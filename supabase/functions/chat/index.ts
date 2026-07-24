// Supabase Edge Function — LLM / Embedding / Scrape 代理
// 部署: supabase functions deploy chat
// 密钥: supabase secrets set LLM_API_KEY=xxx LLM_BASE_URL=xxx LLM_MODEL=xxx JINA_API_KEY=xxx
// 兼容旧配置: 未设置 LLM_* 时回退到 DEEPSEEK_API_KEY + DeepSeek 默认值

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Expose-Headers": "Content-Type",
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders })
  }

  const DEEPSEEK_API_KEY = Deno.env.get("DEEPSEEK_API_KEY")
  const LLM_API_KEY   = Deno.env.get("LLM_API_KEY") ?? DEEPSEEK_API_KEY
  const LLM_BASE_URL  = Deno.env.get("LLM_BASE_URL") ?? "https://api.deepseek.com/v1"
  const LLM_MODEL     = Deno.env.get("LLM_MODEL") ?? "deepseek-v4-flash"
  const LLM_PROVIDER  = Deno.env.get("LLM_PROVIDER") ?? ""
  const LLM_MAX_TOKENS = parseInt(Deno.env.get("LLM_MAX_TOKENS") ?? "500")
  const JINA_API_KEY = Deno.env.get("JINA_API_KEY")!

  // ==================== GET: 返回模型信息 ====================
  if (req.method === "GET") {
    return new Response(JSON.stringify({ provider: LLM_PROVIDER, model: LLM_MODEL }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const body = await req.json() as {
    messages?: unknown[]
    tools?: unknown[]
    stream?: boolean
    embedding?: boolean
    scrape?: boolean
    url?: string
  }

  // ==================== Scrape 代理 ====================
  if (body.scrape && body.url) {
    try {
      const urlStr = body.url
      const isWechat = urlStr.includes("mp.weixin.qq.com")

      if (isWechat) {
        const WECHAT_UA =
          "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.34(0x16082222) NetType/WIFI Language/zh_CN"

        const pageRes = await fetch(urlStr, {
          headers: { "User-Agent": WECHAT_UA },
        })

        if (!pageRes.ok) {
          return new Response(
            JSON.stringify({ error: `WeChat fetch failed: HTTP ${pageRes.status}` }),
            { status: pageRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          )
        }

        const html = await pageRes.text()

        const contentMatch = html.match(/content_noencode:\s*'([^']*)'/)
        const titleMatch = html.match(/title:\s*'([^']*)'/)
        const nickMatch = html.match(/nick_name:\s*'([^']*)'/)
        const descMatch = html.match(/desc:\s*'([^']*)'/)

        const title = titleMatch?.[1] || ""
        const nickName = nickMatch?.[1] || ""
        const desc = descMatch?.[1] || ""
        let content = contentMatch?.[1] || ""

        if (!content) {
          return new Response(
            JSON.stringify({ error: "Could not find article content" }),
            { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          )
        }

        content = content.replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
        content = content.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
        content = content.replace(/<[^>]*>/g, "")
        content = content.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&nbsp;/g, " ")

        let result = ""
        if (title) result += `标题: ${title}\n`
        if (nickName) result += `公众号: ${nickName}\n`
        if (desc) result += `摘要: ${desc}\n`
        if (title || nickName || desc) result += "\n"
        result += content

        return new Response(result, {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" },
        })
      }

      // Non-WeChat: Jina Reader
      const readerUrl = `https://r.jina.ai/${urlStr}`
      const res = await fetch(readerUrl, {
        headers: {
          Authorization: `Bearer ${JINA_API_KEY}`,
          "X-Return-Format": "markdown",
        },
      })
      return new Response(res.body, {
        status: res.status,
        headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" },
      })
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e)
      return new Response(
        JSON.stringify({ error: "Scrape proxy error", detail: errMsg }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }
  }

  // ==================== Embedding 代理 ====================
  if (body.embedding && body.messages?.[0]) {
    const msg = body.messages[0] as { content: string }
    const text = typeof msg === "string" ? msg : msg.content
    const res = await fetch("https://api.jina.ai/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${JINA_API_KEY}`,
      },
      body: JSON.stringify({
        model: "jina-embeddings-v3",
        input: text,
      }),
    })
    return new Response(res.body, {
      status: res.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  // ==================== Chat 代理 ====================
  const chatBody: Record<string, unknown> = {
    model: LLM_MODEL,
    messages: body.messages,
    max_tokens: LLM_MAX_TOKENS,
  }
  if (body.tools) chatBody.tools = body.tools
  if (body.stream) chatBody.stream = true

  const res = await fetch(`${LLM_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LLM_API_KEY}`,
    },
    body: JSON.stringify(chatBody),
  })

  if (body.stream) {
    return new Response(res.body, {
      status: res.status,
      headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    })
  }

  return new Response(res.body, {
    status: res.status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
})

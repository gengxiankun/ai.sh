// Supabase Edge Function — LLM / Embedding / Scrape 代理
// 部署: supabase functions deploy chat
// 密钥: supabase secrets set LLM_API_KEY=xxx LLM_BASE_URL=xxx LLM_MODEL=xxx JINA_API_KEY=xxx
// 兼容旧配置: 未设置 LLM_* 时回退到 DEEPSEEK_API_KEY + DeepSeek 默认值

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Expose-Headers": "Content-Type",
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders })
  }

  try {

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
    parse_pdf?: boolean
    pdf_data?: string
    scrape?: boolean
    url?: string
    proxy?: boolean
    proxy_skill_id?: string
    proxy_url?: string
    proxy_method?: string
    proxy_headers?: Record<string, string>
    proxy_body?: string
    max_tokens?: number
  }

  // ==================== PDF 文本提取 ====================
  if (body.parse_pdf && body.pdf_data) {
    try {
      const binary = Uint8Array.from(atob(body.pdf_data), (c) => c.charCodeAt(0))
      const raw = new TextDecoder("latin1").decode(binary)
      const result: string[] = []

      // 提取 PDF 对象（含流内容）
      const objRegex = /(\d+ \d+ obj[\s\S]*?endobj)/g
      let om: RegExpExecArray | null

      while ((om = objRegex.exec(raw)) !== null) {
        const objData = om[1]

        // 检查是否包含压缩流
        const streamMatch = objData.match(/\/Filter\s*\/FlateDecode[\s\S]*?stream\r?\n([\s\S]*?)\r?\nendstream/)
        let content = ""

        if (streamMatch) {
          // FlateDecode 压缩流 — 解压缩
          try {
            const compressed = Uint8Array.from(
              streamMatch[1].split("").map((c) => c.charCodeAt(0))
            )
            const ds = new DecompressionStream("deflate")
            const writer = ds.writable.getWriter()
            const reader = ds.readable.getReader()
            writer.write(compressed)
            writer.close()
            const chunks: Uint8Array[] = []
            while (true) {
              const { done, value } = await reader.read()
              if (done) break
              chunks.push(value)
            }
            const totalLen = chunks.reduce((s, c) => s + c.length, 0)
            const decompressed = new Uint8Array(totalLen)
            let offset = 0
            for (const c of chunks) {
              decompressed.set(c, offset)
              offset += c.length
            }
            content = new TextDecoder("latin1").decode(decompressed)
          } catch {
            // 解压失败，使用原始内容
            content = streamMatch[1]
          }
        } else {
          // 非压缩流
          const plainMatch = objData.match(/stream\r?\n([\s\S]*?)\r?\nendstream/)
          content = plainMatch ? plainMatch[1] : objData
        }

        // 从内容中提取文本
        const textBlocks: string[] = []
        const btRegex = /BT([\s\S]*?)ET/g
        let bt: RegExpExecArray | null
        while ((bt = btRegex.exec(content)) !== null) {
          const block = bt[1]
          let out = ""

          // Tj 操作符: (text) Tj
          const tjRegex = /\(([^)]*)\)\s*Tj/g
          let tj: RegExpExecArray | null
          while ((tj = tjRegex.exec(block)) !== null) {
            out += tj[1]
          }

          // TJ 数组: [(text) num (text) ...] TJ
          const tjArrRegex = /\[([^\]]*)\]\s*TJ/g
          let ta: RegExpExecArray | null
          while ((ta = tjArrRegex.exec(block)) !== null) {
            const parts = ta[1].match(/\(([^)]*)\)/g)
            if (parts) out += parts.map((p) => p.slice(1, -1)).join("")
          }

          // ' 操作符 (单引号)
          const sqRegex = /\('([^']*)'\)/g
          let sq: RegExpExecArray | null
          while ((sq = sqRegex.exec(block)) !== null) {
            out += sq[1]
          }

          if (out.trim()) textBlocks.push(out)
        }
        result.push(...textBlocks)
      }

      if (result.length > 0) {
        // 去重连续的空白行
        const cleaned = result
          .filter((l) => l.trim())
          .join("\n")
        return new Response(cleaned || "[No text extracted from PDF]", {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" },
        })
      }

      // 回退：尝试直接从 raw 中提取文本（无压缩的简单 PDF）
      const fallback: string[] = []
      const btRegex = /BT([\s\S]*?)ET/g
      let fbm: RegExpExecArray | null
      while ((fbm = btRegex.exec(raw)) !== null) {
        const block = fbm[1]
        let out = ""
        const tjRegex = /\(([^)]*)\)\s*Tj/g
        let tjm: RegExpExecArray | null
        while ((tjm = tjRegex.exec(block)) !== null) out += tjm[1]
        const tjArrRegex = /\[([^\]]*)\]\s*TJ/g
        let tam: RegExpExecArray | null
        while ((tam = tjArrRegex.exec(block)) !== null) {
          const parts = tam[1].match(/\(([^)]*)\)/g)
          if (parts) out += parts.map((p) => p.slice(1, -1)).join("")
        }
        if (out.trim()) fallback.push(out)
      }

      return new Response(fallback.join("\n") || "[No text extracted from PDF]", {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" },
      })
    } catch (e) {
      return new Response(
        JSON.stringify({ error: "PDF parse error", detail: String(e) }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }
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

  // ==================== 通用代理 — Skill 外部 API 调用 ====================
  if (body.proxy && body.proxy_url) {
    const headers: Record<string, string> = { ...body.proxy_headers }
    // 替换 __SECRET__ 占位符 → Deno.env.get("SKILL_<id>_<key>")
    if (body.proxy_skill_id) {
      for (const [key, value] of Object.entries(headers)) {
        if (value === "__SECRET__") {
          const secretKey = `SKILL_${body.proxy_skill_id}_${key}`.toUpperCase().replace(/-/g, "_")
          headers[key] = Deno.env.get(secretKey) ?? ""
        }
      }
    }
    try {
      const res = await fetch(body.proxy_url, {
        method: body.proxy_method ?? "GET",
        headers,
        body: body.proxy_body ?? undefined,
      })
      return new Response(res.body, {
        status: res.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    } catch (e) {
      return new Response(
        JSON.stringify({ error: "Proxy error", detail: String(e) }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }
  }

  // ==================== Chat 代理 ====================
  const chatBody: Record<string, unknown> = {
    model: LLM_MODEL,
    messages: body.messages,
    max_tokens: body.max_tokens ?? LLM_MAX_TOKENS,
  }
  if (body.tools) chatBody.tools = body.tools
  if (body.stream) {
    chatBody.stream = true
    chatBody.stream_options = { include_usage: true }
  }

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

  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e)
    return new Response(
      JSON.stringify({ error: "Edge function error", detail: errMsg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  }
})

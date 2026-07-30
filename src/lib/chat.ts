// AI 聊天客户端 — Agent loop + 流式响应
// 基于现有的 agent 循环逻辑，将 execute() 从浏览器端移到 Worker 端执行

import { runSkillScript, type SkillScript } from './skills/runner'
import { runTool } from '../store/commands'
import type { Skill } from './skills/index'
import type { ChatStep } from '../types'

// Supabase Edge Function 代理地址
const EDGE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

// 基础系统规则
const BASE_RULES = `RULES:
1. Use tools to fetch real data — never fabricate.
2. Use Markdown formatting. Reply in Chinese unless asked in English.`

// Agent 循环 + 上下文裁剪常量
const MAX_ROUNDS = 5
const MAX_CONTEXT_TOKENS = 6000
const CHARS_PER_TOKEN = 3

// 消息类型
type Message = {
  role: string
  content: string
  tool_calls?: unknown[]
  tool_call_id?: string
}

// Token 估算 — 中英文混合保守估算
function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

// 裁剪对话历史 — 从末尾保留最近消息，确保不切断 tool-call 块
function trimMessages(messages: Message[], maxTokens: number): Message[] {
  let total = 0
  const kept: Message[] = []

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    let msgTokens = estimateTokens(msg.content)
    if (msg.tool_calls) {
      msgTokens += estimateTokens(JSON.stringify(msg.tool_calls))
    }

    if (total + msgTokens > maxTokens && kept.length > 0) break

    total += msgTokens
    kept.unshift(msg)
  }

  // 如果第一条是孤立的 tool 消息，补上发起它的 assistant 消息
  // 避免 LLM 收到孤立的 tool 结果
  if (kept[0]?.role === 'tool') {
    const firstIdx = messages.indexOf(kept[0])
    for (let j = firstIdx - 1; j >= 0; j--) {
      if (messages[j].role === 'assistant' && messages[j].tool_calls) {
        kept.unshift(messages[j])
        break
      }
      if (messages[j].role === 'tool') {
        kept.unshift(messages[j])
      } else {
        break
      }
    }
  }

  return kept
}

// 调用 Worker API
async function callAPI(
  payload: unknown[],
  tools?: unknown[],
  stream = false,
) {
  const res = await fetch(EDGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SUPABASE_KEY}` },
    body: JSON.stringify({ messages: payload, tools, stream }),
  })
  if (!res.ok) throw new Error('API error')
  return res
}

// 并行执行 tool calls — 并发通知 onStep，统一返回 tool 结果
async function executeToolCalls(
  toolCalls: { id: string; function: { name: string; arguments: string } }[],
  skills: Skill[] | undefined,
  allScripts: SkillScript[],
  context: {
    email?: string
    userId?: string
    token?: string
    onStep?: (step: ChatStep) => void
  },
): Promise<{ role: 'tool'; tool_call_id: string; content: string }[]> {
  return Promise.all(
    toolCalls.map(async (tc) => {
      const owner = skills?.find((s) =>
        s.scripts?.some(
          (sc) => sc.definition.function.name === tc.function.name,
        ),
      )

      context.onStep?.({
        skill: owner?.name,
        tool: tc.function.name,
        status: 'calling',
      })

      const script = allScripts.find(
        (s) => s.definition.function.name === tc.function.name,
      )

      let result: string
      try {
        if (script) {
          result = await runSkillScript(script, tc.function.arguments, {
            env: {
              SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
              SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
              SUPABASE_TOKEN: context.token || '',
              WORKER_URL: EDGE_URL,
            },
            email: context.email,
            userId: context.userId,
          })
        } else {
          result = await runTool(tc.function.name, tc.function.arguments, {
            email: context.email,
          })
        }
        context.onStep?.({ skill: owner?.name, tool: tc.function.name, status: 'done' })
      } catch {
        context.onStep?.({ skill: owner?.name, tool: tc.function.name, status: 'error' })
        result = 'Tool execution failed.'
      }

      return { role: 'tool' as const, tool_call_id: tc.id, content: result }
    }),
  )
}

// 第一阶段：LLM 路由 — 根据用户消息选择最合适的 skill
// 只发送 skill 元数据（name + description），不发送 prompt 和 tools
async function routeSkill(
  userMessage: string,
  skillsMeta: { id: string; name: string; description: string }[],
): Promise<{ id: string; usage: number }> {
  if (skillsMeta.length <= 1) return { id: skillsMeta[0]?.id ?? '', usage: 0 }

  const skillList = skillsMeta
    .map((s) => `- **${s.name}** (id: ${s.id}): ${s.description}`)
    .join('\n')

  const routingPrompt = `You are a skill router. Based on the user's message, select the most appropriate skill.

Available skills:
${skillList}

Respond with ONLY the skill id (one word, e.g. "general"), nothing else.`

  const res = await callAPI(
    [
      { role: 'system', content: routingPrompt },
      { role: 'user', content: userMessage },
    ],
    undefined,
    false,
  )
  const data = await res.json()
  const usage = data.usage?.total_tokens || 0
  const choice = data.choices?.[0]?.message?.content?.trim()?.toLowerCase()
  const skillId = choice?.replace(/^(the |skill[ :])/i, '')?.split(/\s+/)[0] ?? ''

  const match = skillsMeta.find((s) => s.id === skillId)
  return { id: match?.id ?? skillsMeta[0].id, usage }
}

// 主 chat 函数 — 发送消息 + 自动 tool calling loop
export async function chat(
  messages: Message[],
  context?: {
    email?: string
    userId?: string
    token?: string
    skills?: Skill[]
    fallbackTools?: unknown[]
    onStep?: (step: ChatStep) => void
  },
): Promise<{ text: string; stream?: ReadableStream<Uint8Array>; usage: number }> {
  if (!import.meta.env.VITE_SUPABASE_URL) return { text: 'Supabase not configured.', usage: 0 }
  if (!import.meta.env.VITE_SUPABASE_ANON_KEY) return { text: 'Supabase not configured.', usage: 0 }

  // 渐进式披露：两阶段 — LLM 先路由选 skill，再展开匹配 skill 的 prompt + tools
  const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')
  const skillsMeta = context?.skills?.map((s) => ({ id: s.id, name: s.name, description: s.description })) ?? []

  let totalUsage = 0
  let skillId = skillsMeta[0]?.id ?? ''
  if (lastUserMsg && skillsMeta.length > 1) {
    try {
      const routeResult = await routeSkill(lastUserMsg.content, skillsMeta)
      skillId = routeResult.id
      totalUsage += routeResult.usage
    } catch {
      // 路由失败时静默降级，默认 QA
    }
    context?.onStep?.({ status: 'routing', content: `→ ${skillsMeta.find((s) => s.id === skillId)?.name ?? skillId}` })
  }

  const matchedSkill = context?.skills?.find((s) => s.id === skillId)
  const matchedScripts = matchedSkill?.scripts ?? []

  // 构建 tools（只包含匹配 skill 的工具）
  const seen = new Set<string>()
  const tools: SkillScript['definition'][] = []
  for (const s of matchedScripts) {
    if (!seen.has(s.definition.function.name)) {
      seen.add(s.definition.function.name)
      tools.push(s.definition)
    }
  }
  if (context?.fallbackTools) {
    for (const t of context.fallbackTools as {
      type: string
      function: { name: string; description?: string }
    }[]) {
      if (!seen.has(t.function.name)) {
        seen.add(t.function.name)
        tools.push({
          type: 'function',
          function: {
            name: t.function.name,
            description: t.function.description ?? '',
          },
        })
      }
    }
  }

  // 构建 system prompt：概览 + 匹配 skill 完整 prompt + 规则
  let systemPrompt = ''
  const skills = context?.skills
  if (skills?.length) {
    systemPrompt += '## Available Skills\n\n'
    for (const s of skills) {
      if (s.id === skillId) {
        systemPrompt += `### ${s.name} (active)\n${s.prompt}\n\n`
      } else {
        systemPrompt += `- **${s.name}**: ${s.description}\n`
      }
    }
    systemPrompt += '\n---\n\n'
  }
  systemPrompt += BASE_RULES

  // 添加用户上下文
  if (context?.email) {
    systemPrompt += `\n\nUser is logged in as: ${context.email}`
  } else {
    systemPrompt +=
      "\n\nUser is NOT logged in."
  }

  // 裁剪对话历史，控制上下文大小
  const trimmedMessages = trimMessages(messages, MAX_CONTEXT_TOKENS)
  const payload: Message[] = [
    { role: 'system', content: systemPrompt },
    ...trimmedMessages,
  ]

  const hasTools = tools.length > 0
  const toolArgs = hasTools ? tools : undefined

  // 多轮 agent loop — 直到 LLM 不再请求 tool 或达到上限
  let round = 0
  while (round < MAX_ROUNDS) {
    round++

    const res = await callAPI(payload, toolArgs)
    const data = await res.json()
    totalUsage += data.usage?.total_tokens || 0
    const msg = data.choices[0].message

    // 没有 tool_calls 或无可用工具 → LLM 认为任务完成
    if (!msg.tool_calls?.length || !hasTools) {
      if (msg.content) return { text: msg.content, usage: totalUsage }
      break
    }

    // 显示推理内容（如有）
    if ((msg as { reasoning_content?: string }).reasoning_content) {
      context?.onStep?.({
        status: 'reasoning',
        content: (msg as { reasoning_content: string }).reasoning_content,
      })
    }

    payload.push(msg)

    // 并行执行所有 tool calls
    const toolResults = await executeToolCalls(
      msg.tool_calls,
      matchedSkill ? [matchedSkill] : undefined,
      matchedScripts,
      {
        email: context?.email,
        userId: context?.userId,
        token: context?.token,
        onStep: context?.onStep,
      },
    )

    for (const tr of toolResults) {
      payload.push(tr)
    }
  }

  // 流式返回最终响应
  const streamRes = await callAPI(payload, undefined, true)
  return { text: '', stream: streamRes.body!, usage: totalUsage }
}

// 读取 SSE 流 — 解析 data: {...} 格式，逐块回调
export async function readStream(
  stream: ReadableStream<Uint8Array>,
  onChunk: (text: string) => void,
): Promise<{ text: string; usage: number }> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let full = ''
  let buffer = ''
  let usage = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6)
        if (data === '[DONE]') continue
        try {
          const json = JSON.parse(data)
          const text = json.choices?.[0]?.delta?.content
          if (text) {
            full += text
            onChunk(full)
          }
          if (json.usage?.total_tokens) usage = json.usage.total_tokens
        } catch {
          // 跳过解析失败的行
        }
      }
    }
  }

  return { text: full, usage }
}

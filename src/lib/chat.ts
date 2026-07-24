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
): Promise<{ text: string; stream?: ReadableStream<Uint8Array> }> {
  if (!import.meta.env.VITE_SUPABASE_URL) return { text: 'Supabase not configured.' }
  if (!import.meta.env.VITE_SUPABASE_ANON_KEY) return { text: 'Supabase not configured.' }

  const skills = context?.skills
  const allScripts = skills?.flatMap((s) => s.scripts ?? []) ?? []

  // 合并 + 去重所有 tool
  const seen = new Set<string>()
  const tools: SkillScript['definition'][] = []
  for (const s of allScripts) {
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

  // 构建 system prompt：skill 概览 + 完整 prompt + 规则
  let systemPrompt = ''
  if (skills?.length) {
    systemPrompt += '## Available Skills\n\n'
    for (const s of skills) {
      systemPrompt += `### ${s.name}\n${s.prompt}\n\n`
    }
    systemPrompt += '---\n\n'
    systemPrompt +=
      'IMPORTANT: For EVERY user message, re-evaluate which skill above is most relevant. If no other skill clearly matches, ALWAYS use the QA skill (the default). You can switch skills between messages.'
    systemPrompt += '\n\n'
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
    const msg = data.choices[0].message

    // 没有 tool_calls 或无可用工具 → LLM 认为任务完成
    if (!msg.tool_calls?.length || !hasTools) {
      if (msg.content) return { text: msg.content }
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
      skills,
      allScripts,
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
  return { text: '', stream: streamRes.body! }
}

// 读取 SSE 流 — 解析 data: {...} 格式，逐块回调
export async function readStream(
  stream: ReadableStream<Uint8Array>,
  onChunk: (text: string) => void,
): Promise<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let full = ''
  let buffer = ''

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
        } catch {
          // 跳过解析失败的行
        }
      }
    }
  }

  return full
}

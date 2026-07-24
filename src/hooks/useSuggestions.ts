// AI 推荐问题 Hook — 单行缓存，先展示再异步刷新，5s 自动轮换
// 始终返回最新缓存立即展示，后台判断过期后重新生成

import { useState, useEffect, useRef } from 'react'

const CACHE_TTL = 5 * 60 * 1000
const GENERATE_COUNT = 20
const PICK_COUNT = 4

function pickRandom<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled.slice(0, n)
}

export function useSuggestions(dataVersion: number) {
  const [suggestions, setSuggestions] = useState<string[]>([])
  const allItemsRef = useRef<string[]>([])
  const generatingRef = useRef(false)

  // 每 5 秒自动换一批
  useEffect(() => {
    const id = setInterval(() => {
      if (allItemsRef.current.length === 0) return
      setSuggestions(pickRandom(allItemsRef.current, PICK_COUNT))
    }, 5000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY

    fetch(
      `${supabaseUrl}/rest/v1/site_news?select=title&order=sort_order`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } },
    )
      .then((r) => r.json())
      .then(async (news: { title: string }[]) => {
        const titles = news.map((n) => n.title)
        if (!titles.length) return

        const rows: { id: number; questions: string; created_at: string }[] =
          await fetch(
            `${supabaseUrl}/rest/v1/site_suggestions?select=id,questions,created_at&order=created_at.desc&limit=1`,
            { headers: { apikey: key, Authorization: `Bearer ${key}` } },
          ).then((r) => r.json())

        let cachedItems: string[] = []
        let rowId: number | null = null

        if (rows?.length > 0) {
          const row = rows[0]
          rowId = row.id
          cachedItems = row.questions.split('\n').filter(Boolean)
          allItemsRef.current = cachedItems
          setSuggestions(pickRandom(cachedItems, PICK_COUNT))

          const age = Date.now() - new Date(row.created_at).getTime()
          if (age < CACHE_TTL) return
        }

        if (generatingRef.current) return
        generatingRef.current = true

        const edgeUrl = import.meta.env.VITE_SUPABASE_URL
          ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`
          : ''
        if (!edgeUrl) {
          generatingRef.current = false
          return
        }

        const prompt = `基于以下内容，生成${GENERATE_COUNT}个用户可能会问的问题（用中文，每行一个，不要编号，不要解释，问题尽量多样化）：

本网站功能：
- 查看个人简介、技能、工作经历（/about）
- 查看项目作品（/projects）
- 查看公司新闻动态（/news）
- 查看联系方式（/contact）
- AI 智能对话聊天（支持 RAG 知识库搜索）
- 查看更新日志时间线（/update-log）
- AI Skills 系统（QA）
- 注册 / 登录账号

最新新闻：
${titles.join('\n')}`

        try {
          const res = await fetch(edgeUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
            body: JSON.stringify({
              messages: [{ role: 'user', content: prompt }],
              stream: false,
            }),
          })
          const data = await res.json()
          const text: string = data.choices?.[0]?.message?.content
          if (!text) { generatingRef.current = false; return }

          const items = text.split('\n').filter(Boolean).slice(0, GENERATE_COUNT)

          if (rowId) {
            await fetch(
              `${supabaseUrl}/rest/v1/site_suggestions?id=eq.${rowId}`,
              {
                method: 'PATCH',
                headers: {
                  apikey: key,
                  Authorization: `Bearer ${key}`,
                  'Content-Type': 'application/json',
                  Prefer: 'return=minimal',
                },
                body: JSON.stringify({ questions: items.join('\n'), created_at: new Date().toISOString() }),
              },
            ).catch(() => {})
          } else {
            await fetch(`${supabaseUrl}/rest/v1/site_suggestions`, {
              method: 'POST',
              headers: {
                apikey: key,
                Authorization: `Bearer ${key}`,
                'Content-Type': 'application/json',
                Prefer: 'return=minimal',
              },
              body: JSON.stringify({ questions: items.join('\n') }),
            }).catch(() => {})
          }

          allItemsRef.current = items
          setSuggestions(pickRandom(items, PICK_COUNT))
        } catch {}
        generatingRef.current = false
      })
      .catch(() => {})
  }, [dataVersion])

  return suggestions
}

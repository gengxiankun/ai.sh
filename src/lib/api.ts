// 通用 API 工具 — 封装 Supabase REST 请求和认证 token 获取
// 消除 App.tsx / rag.ts / site-data.ts 中重复 10+ 次的登录 token 提取逻辑

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

// 从 localStorage 提取当前用户的 access_token（含 fallback）
export function getAuthToken(): string {
  const raw = localStorage.getItem(
    `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`,
  )
  const session = raw ? JSON.parse(raw) : null
  return session?.access_token ?? SUPABASE_KEY
}

// 调用 Supabase REST API（自动附带 token）
export async function fetchREST<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T | null> {
  const url = `${SUPABASE_URL}/rest/v1/${path}`
  const res = await fetch(url, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${getAuthToken()}`,
      ...options.headers,
    },
  })
  if (!res.ok) return null
  return res.json()
}

// Supabase REST 基本路径（按需拼接 query）
export function supabaseRESTPath(path: string): string {
  return `${SUPABASE_URL}/rest/v1/${path}`
}

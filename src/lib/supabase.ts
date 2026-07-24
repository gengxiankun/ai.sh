// Supabase 客户端单例

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null

// 获取 Supabase 客户端实例（懒加载）
export function getSupabase(): SupabaseClient | null {
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key || url === 'https://your-project.supabase.co') return null
  if (!client) client = createClient(url, key)
  return client
}

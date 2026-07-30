// 站点数据 API — 实时从 Supabase 拉取，不做内存缓存
// 每次调用都发起 HTTP 请求获取最新数据

import { fetchREST } from '../lib/api'
import type { SitePost, SiteCategory, SiteTag } from '../types'

export async function fetchAbout(): Promise<string> {
  const data = await fetchREST<{ content: string }[]>(
    'site_about?select=content&limit=1',
  )
  return data?.[0]?.content ?? ''
}

export async function fetchPosts(): Promise<SitePost[]> {
  const data = await fetchREST<SitePost[]>(
    'site_posts?select=id,title,detail,category_id,document_id,created_at&order=sort_order',
  )
  return data ?? []
}

export async function fetchCategories(): Promise<SiteCategory[]> {
  const data = await fetchREST<SiteCategory[]>(
    'site_categories?select=id,name,slug&order=sort_order',
  )
  return data ?? []
}

export async function fetchTags(): Promise<SiteTag[]> {
  const data = await fetchREST<SiteTag[]>(
    'site_tags?select=id,name,slug&order=name',
  )
  return data ?? []
}

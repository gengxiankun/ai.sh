// 站点数据 API — 实时从 Supabase 拉取，不做内存缓存
// 每次调用都发起 HTTP 请求获取最新数据

import { fetchREST } from '../lib/api'
import type { SiteProject, SiteNewsItem } from '../types'

export async function fetchAbout(): Promise<string> {
  const data = await fetchREST<{ content: string }[]>(
    'site_about?select=content&limit=1',
  )
  return data?.[0]?.content ?? ''
}

export async function fetchProjects(): Promise<SiteProject[]> {
  const data = await fetchREST<SiteProject[]>(
    'site_projects?select=name,url,disabled&order=sort_order',
  )
  return data ?? []
}

export async function fetchNews(): Promise<SiteNewsItem[]> {
  const data = await fetchREST<SiteNewsItem[]>(
    'site_news?select=title,detail,document_id&order=sort_order',
  )
  return data ?? []
}

export async function fetchContact(): Promise<{ content: string; image: string }> {
  const data = await fetchREST<{ content: string; image: string }[]>(
    'site_contact?select=content,image&limit=1',
  )
  return data?.[0] ?? { content: '', image: '' }
}

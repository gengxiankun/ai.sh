// RAG 知识库 — embedding 生成 + 向量搜索 + CRUD
// 使用 Jina Embeddings V3 → pgvector 存储和搜索

import { getAuthToken } from './api'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const EDGE_URL = `${SUPABASE_URL}/functions/v1/chat`

// RAG 文档类型
export interface RagDocument {
  id: number
  title: string
  content: string
  similarity: number
}

// 生成文本的向量 embedding（通过 Worker 代理调用 Jina API）
async function getEmbedding(text: string): Promise<number[]> {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('Supabase not configured')
  }
  const res = await fetch(EDGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SUPABASE_KEY}` },
    body: JSON.stringify({
      messages: [{ role: 'user', content: text }],
      stream: false,
      embedding: true,
    }),
  })
  if (!res.ok) throw new Error('Embedding failed')
  const data = await res.json()
  return data.embedding ?? data.data?.[0]?.embedding ?? []
}

// 向量搜索 — 返回最相似的文档列表
export async function searchDocuments(
  query: string,
  limit = 5,
): Promise<RagDocument[]> {
  if (!query.trim()) return []

  const embedding = await getEmbedding(query)
  if (!embedding.length) return []

  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/search_rag_docs`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query_embedding: JSON.stringify(embedding),
      match_threshold: 0.3,
      match_count: limit,
    }),
  })

  if (!res.ok) {
    const err = await res.text().catch(() => '')
    throw new Error(`Search failed: ${res.status} ${err}`)
  }
  return res.json()
}

// 上传文档到知识库
export async function uploadDocument(
  title: string,
  content: string,
  source = 'custom',
): Promise<number | null> {
  const embedding = await getEmbedding(content)
  if (!embedding.length) return null

  const res = await fetch(`${SUPABASE_URL}/rest/v1/rag_documents`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${getAuthToken()}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      title,
      content,
      source,
      embedding: JSON.stringify(embedding),
    }),
  })

  if (!res.ok) return null
  const data = await res.json()
  return data?.[0]?.id ?? null
}

// 更新文档（重新生成 embedding）
export async function updateDocument(
  id: number,
  title: string,
  content: string,
): Promise<boolean> {
  const embedding = await getEmbedding(content)
  if (!embedding.length) return false

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/rag_documents?id=eq.${id}`,
    {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${getAuthToken()}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        title,
        content,
        embedding: JSON.stringify(embedding),
      }),
    },
  )
  return res.ok
}

// 按 ID 删除文档
export async function deleteDocumentById(id: number): Promise<boolean> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const raw = localStorage.getItem(
    `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`,
  )
  const session = raw ? JSON.parse(raw) : null
  const token = session?.access_token ?? SUPABASE_KEY
  const res = await fetch(
    `${supabaseUrl}/rest/v1/rag_documents?id=eq.${id}`,
    {
      method: 'DELETE',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${token}`,
        Prefer: 'return=minimal',
      },
    },
  )
  return res.ok
}

// 按 source 字段删除文档
export async function deleteDocumentBySource(
  source: string,
): Promise<boolean> {
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const raw = localStorage.getItem(
    `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`,
  )
  const session = raw ? JSON.parse(raw) : null
  const token = session?.access_token ?? key
  const res = await fetch(
    `${supabaseUrl}/rest/v1/rag_documents?source=eq.${encodeURIComponent(source)}`,
    {
      method: 'DELETE',
      headers: {
        apikey: key,
        Authorization: `Bearer ${token}`,
        Prefer: 'return=minimal',
      },
    },
  )
  return res.ok
}

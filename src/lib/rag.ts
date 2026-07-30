// RAG 知识库 — embedding 生成 + 分块 + 向量搜索 + CRUD
// 使用 Jina Embeddings V3 → pgvector HNSW 索引搜索

import { getAuthToken } from './api'
import { splitContent } from './chunk'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const EDGE_URL = `${SUPABASE_URL}/functions/v1/chat`

// RAG 文档类型
export interface RagDocument {
  id: number
  title: string
  content: string  // 最佳匹配 chunk 的内容
  similarity: number
}

// 生成文本的向量 embedding
async function getEmbedding(text: string, task = 'retrieval.passage'): Promise<number[]> {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Supabase not configured')
  const res = await fetch(EDGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SUPABASE_KEY}` },
    body: JSON.stringify({ messages: [{ role: 'user', content: text }], stream: false, embedding: true, embedding_task: task }),
  })
  if (!res.ok) throw new Error('Embedding failed')
  const data = await res.json()
  return data.embedding ?? data.data?.[0]?.embedding ?? []
}

// 批量生成文本的向量 embedding（一次 API 调用）
async function getEmbeddings(texts: string[], task = 'retrieval.passage'): Promise<number[][]> {
  if (!texts.length) return []
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Supabase not configured')
  const res = await fetch(EDGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SUPABASE_KEY}` },
    body: JSON.stringify({ embedding_batch: true, embedding_texts: texts, embedding_task: task }),
  })
  if (!res.ok) throw new Error('Embedding failed')
  const data = await res.json()
  return data.data?.map((d: { embedding: number[] }) => d.embedding) ?? []
}

// 向量搜索 — 搜 chunks，按文档去重返回
export async function searchDocuments(query: string, limit = 5): Promise<RagDocument[]> {
  if (!query.trim()) return []

  const embedding = await getEmbedding(query, 'retrieval.query')
  if (!embedding.length) return []

  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/search_rag_docs`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query_embedding: JSON.stringify(embedding), match_threshold: 0.35, match_count: limit }),
  })

  if (!res.ok) {
    const err = await res.text().catch(() => '')
    throw new Error(`Search failed: ${res.status} ${err}`)
  }
  return res.json()
}

// 上传文档（分块 + 批量生成 embedding）
export async function uploadDocument(title: string, content: string, source = 'custom'): Promise<number | null> {
  const chunks = splitContent(content)
  if (!chunks.length) return null

  const token = getAuthToken()

  // 创建元数据行
  const docRes = await fetch(`${SUPABASE_URL}/rest/v1/rag_documents`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ title, source }),
  })
  if (!docRes.ok) return null
  const docData = await docRes.json()
  const docId: number = docData?.[0]?.id
  if (!docId) return null

  // 批量生成 embedding + 并发插入 chunk
  const embeddings = await getEmbeddings(chunks)
  await Promise.all(chunks.map((c, i) => {
    const emb = embeddings[i]
    if (!emb || !emb.length) return Promise.resolve()
    return fetch(`${SUPABASE_URL}/rest/v1/rag_chunks`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ document_id: docId, chunk_index: i, content: c, embedding: JSON.stringify(emb) }),
    })
  }))

  return docId
}

// 更新文档（删旧 chunks → 重新分块 + 批量 embedding）
export async function updateDocument(id: number, title: string, content: string): Promise<boolean> {
  const chunks = splitContent(content)
  if (!chunks.length) return false

  const token = getAuthToken()

  // 删旧 chunks
  await fetch(`${SUPABASE_URL}/rest/v1/rag_chunks?document_id=eq.${id}`, {
    method: 'DELETE',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}`, Prefer: 'return=minimal' },
  }).catch(() => {})

  // 批量生成 embedding + 并发插入新 chunk
  const embeddings = await getEmbeddings(chunks)
  await Promise.all(chunks.map((c, i) => {
    const emb = embeddings[i]
    if (!emb || !emb.length) return Promise.resolve()
    return fetch(`${SUPABASE_URL}/rest/v1/rag_chunks`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ document_id: id, chunk_index: i, content: c, embedding: JSON.stringify(emb) }),
    })
  }))

  // 更新标题
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rag_documents?id=eq.${id}`, {
    method: 'PATCH',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ title }),
  })
  return res.ok
}

// 按 ID 删除文档（chunks 由 CASCADE 自动删）
export async function deleteDocumentById(id: number): Promise<boolean> {
  const token = getAuthToken()
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rag_documents?id=eq.${id}`, {
    method: 'DELETE',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}`, Prefer: 'return=minimal' },
  })
  return res.ok
}

// 邀请码 API — 创建、验证、消耗词元
import { fetchREST, getAuthToken } from './api'

export type InviteCode = {
  id: number
  token: string
  description: string
  token_quota: number
  token_used: number
  expires_at: string
  created_by: string
  created_at: string
}

const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const URL = import.meta.env.VITE_SUPABASE_URL

// 验证邀请码有效性（公开接口）
export async function verifyInvite(token: string): Promise<InviteCode | null> {
  const res = await fetch(`${URL}/rest/v1/invite_codes?select=id,token,token_quota,token_used,expires_at&token=eq.${encodeURIComponent(token)}&limit=1`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  })
  if (!res.ok) return null
  const rows: InviteCode[] = await res.json()
  if (!rows.length) return null
  const row = rows[0]
  if (new Date(row.expires_at) < new Date()) return null // 已过期
  if (row.token_used >= row.token_quota) return null // 额度用完
  return row
}

// 消耗词元（通过 RPC 函数，原子操作）
export async function consumeInvite(token: string, usage: number) {
  if (!usage) return
  await fetch(`${URL}/rest/v1/rpc/consume_invite`, {
    method: 'POST',
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_token: token, p_usage: usage }),
  }).catch(() => {})
}

// 创建邀请码（admin）
export async function createInvite(description: string, quota: number, days: number): Promise<string> {
  const token = Array.from({ length: 8 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('')
  const expiresAt = new Date(Date.now() + days * 86400000).toISOString()
  const res = await fetch(`${URL}/rest/v1/invite_codes`, {
    method: 'POST',
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${getAuthToken()}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({ token, description, token_quota: quota, expires_at: expiresAt, created_by: 'admin' }),
  })
  if (!res.ok) throw new Error(`创建失败: HTTP ${res.status}`)
  return token
}

// 更新邀请码（admin）
export async function updateInvite(id: number, data: { description?: string; token_quota?: number; expires_at?: string }): Promise<boolean> {
  const res = await fetch(`${URL}/rest/v1/invite_codes?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${getAuthToken()}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(data),
  })
  return res.ok
}

// 列出所有邀请码（admin）
export async function listInvites(): Promise<InviteCode[]> {
  return (await fetchREST<InviteCode[]>('invite_codes?select=*&order=created_at.desc')) ?? []
}

// 删除邀请码（admin）
export async function deleteInvite(id: number): Promise<boolean> {
  const token = getAuthToken()
  const res = await fetch(`${URL}/rest/v1/invite_codes?id=eq.${id}`, {
    method: 'DELETE',
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${token}`,
    },
  })
  return res.ok
}

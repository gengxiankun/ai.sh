// 共享类型定义 — 从 App.tsx、site-data.ts、chat.ts、data.ts 收口

import type { User } from '@supabase/supabase-js'
import type { Skill } from './lib/skills/index'

// 终端输出行
export type ChatStep = {
  skill?: string
  tool?: string
  status: 'calling' | 'done' | 'error' | 'reasoning'
  content?: string
}

// Action 按钮（链接、展开详情、admin 操作）
export type Action = {
  label: string
  detail?: string
  url?: string
  disabled?: boolean
  image?: string
  // admin 内联操作
  _delete?: { table: string; title: string; col?: string }
  _edit?: { table: string; title: string; id?: number }
  inlineActions?: Action[]
}

// 终端历史记录中的一行
export type Line = {
  input: string
  output: string
  actions?: Action[]
  image?: string
  status?: 'loading' | 'done'
  isAI?: boolean
  steps?: ChatStep[]
}

// 命令返回值
export type CommandResult = string | { output: string; actions: Action[] }

// site-data 数据类型
export type SiteProject = {
  name: string
  url?: string
  disabled: boolean
}

export type SiteNewsItem = {
  title: string
  detail: string
  document_id?: number
}

// 更新日志条目
export type UpdateEntry = {
  hash: string
  date: string
  message: string
}

// useAuth 返回类型
export type AuthState = {
  user: User | null
  isAdmin: boolean
  passwordMode: { email: string; mode: 'login' | 'register' } | null
  setPasswordMode: (v: { email: string; mode: 'login' | 'register' } | null) => void
  chatHistoryRef: React.MutableRefObject<{ role: 'user' | 'assistant'; content: string }[]>
}

// useTerminal 参数
export type TerminalContext = {
  user: User | null
  isAdmin: boolean
  skills: Skill[]
  onDataRefresh: () => void
}

export type { User, Skill }

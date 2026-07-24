// 认证 Hook — 管理用户登录状态、会话监听、聊天历史同步
// 从 App.tsx 抽出 6 个 useEffect + 6 个 state

import { useState, useEffect, useRef, useCallback } from 'react'
import { getSupabase } from '../lib/supabase'
import type { User } from '@supabase/supabase-js'

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [passwordMode, setPasswordMode] = useState<{
    email: string
    mode: 'login' | 'register'
  } | null>(null)
  const [realPassword, setRealPassword] = useState('')

  // ref 同步，确保在事件闭包中能读到最新值
  const userRef = useRef<User | null>(null)
  const passwordModeRef = useRef(passwordMode)
  const realPasswordRef = useRef('')
  const isAdminRef = useRef(false)
  const chatHistoryRef = useRef<
    { role: 'user' | 'assistant'; content: string }[]
  >([])

  userRef.current = user
  passwordModeRef.current = passwordMode
  realPasswordRef.current = realPassword


  const adminEmail = import.meta.env.VITE_ADMIN_EMAIL
  const isAdmin = adminEmail && user?.email === adminEmail
  isAdminRef.current = isAdmin

  // 初始化会话
  useEffect(() => {
    const supabase = getSupabase()
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null)
    })
    const { data: sub } = supabase.auth.onAuthStateChange(
      async (_e, session) => {
        const u = session?.user ?? null
        setUser(u)
        if (u) {
          // 登录后恢复聊天历史
          const { data } = await supabase
            .from('chat_messages')
            .select('role,content')
            .eq('user_id', u.id)
            .order('created_at')
          chatHistoryRef.current =
            (data as { role: 'user' | 'assistant'; content: string }[]) ?? []
        } else {
          chatHistoryRef.current = []
        }
      },
    )
    return () => sub.subscription.unsubscribe()
  }, [])

  // 密码输入处理
  const handlePasswordKey = useCallback(
    (key: string, ctrlKey: boolean, metaKey: boolean, altKey: boolean) => {
      if (key === 'Backspace') {
        setRealPassword((v) => v.slice(0, -1))
        return true
      }
      if (key.length === 1 && !ctrlKey && !metaKey && !altKey) {
        setRealPassword((v) => v + key)
        return true
      }
      return false
    },
    [],
  )

  return {
    user,
    userRef,
    isAdmin,
    isAdminRef,
    passwordMode,
    passwordModeRef,
    realPassword,
    realPasswordRef,
    setPasswordMode,
    setRealPassword,
    chatHistoryRef,
    handlePasswordKey,
  }
}

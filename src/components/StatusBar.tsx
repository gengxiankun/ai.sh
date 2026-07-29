// 输入框顶部状态栏 — 显示用户信息
// 在 terminal 模式和 welcome 模式中复用

import { type FC } from 'react'
import type { User } from '@supabase/supabase-js'

type Props = {
  user: User | null
  isAdmin: boolean
  onGuestClick: () => void
}

export const StatusBar: FC<Props> = ({ user, isAdmin, onGuestClick }) => {
  return (
    <div
      className="px-3 py-1.5 text-xs flex items-center gap-2 border-b"
      style={{
        borderColor: 'var(--ui-input-border)',
        color: 'var(--ui-text-secondary)',
      }}
    >
      {user ? (
        <>
          <span
            className="w-4 h-4 rounded-full shrink-0 flex items-center justify-center text-[9px] font-semibold"
            style={{ background: 'var(--ui-accent)', color: '#fff' }}
          >
            {user.email?.[0].toUpperCase()}
          </span>
          <span className="truncate">{user.email}</span>
          {isAdmin && (
            <span
              className="text-[8px] px-1 py-0.5 rounded-sm font-semibold tracking-wide"
              style={{
                background: 'var(--ui-badge-bg)',
                color: 'var(--ui-badge-text)',
              }}
            >
              ADMIN
            </span>
          )}
        </>
      ) : (
        <span
          className="cursor-pointer hover:underline flex items-center gap-1"
          style={{ color: 'var(--ui-text-secondary)' }}
          onClick={onGuestClick}
          title="Click to login or register"
        >
          <span
            className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-[8px]"
            style={{
              background: 'var(--ui-suggestion)',
              color: 'var(--ui-bg)',
            }}
          >
            ?
          </span>
          Guest
        </span>
      )}
    </div>
  )
}

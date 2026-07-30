// 输入框顶部状态栏 — 显示用户信息
import { type FC, useMemo } from 'react'
import type { User } from '@supabase/supabase-js'
import md5 from 'blueimp-md5'

type Props = {
  user: User | null
  isAdmin: boolean
  onGuestClick: () => void
}

function gravatarUrl(email: string): string {
  const hash = md5(email.trim().toLowerCase())
  return `https://www.gravatar.com/avatar/${hash}?s=32&d=identicon`
}

export const StatusBar: FC<Props> = ({ user, isAdmin, onGuestClick }) => {
  const gravatar = useMemo(() => {
    return user?.email ? gravatarUrl(user.email) : ''
  }, [user?.email])

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
          {gravatar ? (
            <img className="w-4 h-4 rounded-full shrink-0" src={gravatar} alt="" />
          ) : (
            <span
              className="w-4 h-4 rounded-full shrink-0 flex items-center justify-center text-[9px] font-semibold"
              style={{ background: 'var(--ui-accent)', color: '#fff' }}
            >
              {user.email?.[0].toUpperCase()}
            </span>
          )}
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

// 底部状态栏 — 显示用户信息 + 已加载的 AI Skills
// 在 terminal 模式和 welcome 模式中复用

import { type FC } from 'react'
import { Puzzle } from 'lucide-react'
import type { User } from '@supabase/supabase-js'
import type { Skill } from '../lib/skills/index'

type Props = {
  user: User | null
  isAdmin: boolean
  skills: Skill[]
  onGuestClick: () => void
}

export const StatusBar: FC<Props> = ({ user, isAdmin, skills, onGuestClick }) => {
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
      {skills.map((s) => (
        <span
          key={s.id}
          className="text-[8px] px-1.5 py-0.5 rounded font-medium tracking-wide border ml-1 inline-flex items-center gap-0.5"
          style={{
            background: 'rgba(99,102,241,0.1)',
            color: '#818cf8',
            borderColor: 'rgba(99,102,241,0.25)',
          }}
          title={`${s.description}\n${s.scripts?.length ?? 0} tools`}
        >
          <Puzzle className="w-2.5 h-2.5 shrink-0" /> {s.name}
        </span>
      ))}
    </div>
  )
}

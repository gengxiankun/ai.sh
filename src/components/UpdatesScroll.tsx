// 更新日志滚动条 — 底部无缝滚动展示 changelog

import { type FC } from 'react'
import type { UpdateEntry } from '../types'

type Props = {
  updates: UpdateEntry[]
  onClick?: () => void
}

export const UpdatesScroll: FC<Props> = ({ updates, onClick }) => {
  if (updates.length === 0) return null

  // 倒序显示（最新的在前），再复制一份实现无缝循环
  const items = [...updates].reverse()

  return (
    <div
      className="overflow-hidden w-full max-w-2xl h-[1.5em] relative cursor-pointer"
      style={{
        maskImage:
          'linear-gradient(0deg, transparent, #000 10%, #000 90%, transparent)',
      }}
      onClick={onClick}
    >
      <div className="animate-[scroll-v_40s_linear_infinite]">
        {[...items, ...items].map((u, i) => (
          <div
            key={i}
            className="text-xs leading-[1.5em] whitespace-nowrap overflow-hidden text-ellipsis"
            style={{ color: 'var(--ui-suggestion)' }}
          >
            {u.date} · {u.message}
          </div>
        ))}
      </div>
    </div>
  )
}

// AI 推荐问题 Chips — 显示推荐问题，点击填入输入框

import { type FC } from 'react'

type Props = {
  suggestions: string[]
  onSelect: (text: string) => void
}

export const Suggestions: FC<Props> = ({ suggestions, onSelect }) => {
  if (suggestions.length === 0) return null

  return (
    <div className="w-full max-w-2xl flex flex-col gap-1">
      {suggestions.map((s, i) => (
        <span
          key={i}
          className="text-xs px-3 py-1.5 rounded-lg cursor-pointer hover:opacity-80 transition-opacity text-left border w-fit"
          style={{
            background: 'var(--ui-action-bg)',
            color: 'var(--ui-action-text)',
            borderColor: 'var(--ui-action-border)',
          }}
          onClick={() => onSelect(s)}
        >
          {s}
        </span>
      ))}
    </div>
  )
}

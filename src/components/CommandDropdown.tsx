// 命令自动补全下拉 — 输入 / 后显示匹配的命令列表
// 支持键盘导航（ArrowUp/Down）和 hover 选择

import { type FC } from 'react'

type Props = {
  commands: string[]
  descriptions: Record<string, string>
  selectedIdx: number
  hoverIdx: number
  onHover: (idx: number) => void
  onLeave: () => void
  onSelect: (cmd: string) => void
}

export const CommandDropdown: FC<Props> = ({
  commands,
  descriptions,
  selectedIdx,
  hoverIdx,
  onHover,
  onLeave,
  onSelect,
}) => {
  if (commands.length === 0) return null

  return (
    <div
      className="absolute bottom-full left-0 right-0 mx-0 mb-2 rounded-xl border overflow-hidden shadow-lg max-h-[16rem] overflow-y-auto"
      style={{
        background: 'var(--ui-input-bg)',
        borderColor: 'var(--ui-input-border)',
      }}
    >
      {commands.map((cmd, i) => (
        <div
          key={cmd}
          data-dropdown-idx={i}
          className="px-3 py-1.5 text-xs cursor-pointer flex items-center transition-colors"
          style={{
            background:
              i === selectedIdx
                ? 'var(--ui-action-hover-bg)'
                : i === hoverIdx
                  ? 'var(--ui-action-bg)'
                  : 'transparent',
          }}
          onMouseEnter={() => onHover(i)}
          onMouseLeave={onLeave}
          onClick={() => onSelect(cmd)}
        >
          <span
            className="shrink-0"
            style={{
              color:
                i === selectedIdx ? 'var(--ui-accent)' : 'var(--ui-text)',
            }}
          >
            /{cmd}
          </span>
          {descriptions[cmd] && (
            <span
              className="ml-2 truncate"
              style={{ color: 'var(--ui-text-secondary)' }}
            >
              {descriptions[cmd]}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

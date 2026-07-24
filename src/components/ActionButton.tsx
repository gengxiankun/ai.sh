// Action 按钮组件 — 支持链接跳转 / 展开详情 / admin 内联操作

import { type FC } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import type { Action } from '../types'

type Props = {
  action: Action
  isAdmin: boolean
  onClick: (action: Action) => void
}

const baseClass =
  'flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm transition-all duration-150 w-full'

const hoverHandlers = {
  onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
    e.currentTarget.style.background = 'var(--ui-action-hover-bg)'
    e.currentTarget.style.borderColor = 'var(--ui-action-hover-border)'
  },
  onMouseLeave: (e: React.MouseEvent<HTMLElement>) => {
    e.currentTarget.style.background = 'var(--ui-action-bg)'
    e.currentTarget.style.borderColor = 'var(--ui-action-border)'
  },
}

export const ActionButton: FC<Props> = ({ action, isAdmin, onClick }) => {
  // 开发中项目 — 不可点击
  if (action.disabled) {
    return (
      <div
        className={baseClass}
        style={{
          background: 'var(--ui-disabled-bg)',
          borderColor: 'var(--ui-border)',
        }}
      >
        <span style={{ color: 'var(--ui-disabled-text)' }}>{action.label}</span>
        <span
          className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
          style={{
            background: 'var(--ui-badge-bg)',
            color: 'var(--ui-badge-text)',
          }}
        >
          开发中
        </span>
      </div>
    )
  }

  // 外部链接 — 使用 <a> 标签
  if (action.url) {
    const isMailto = action.url.startsWith('mailto:')
    return (
      <a
        href={action.url}
        target={isMailto ? undefined : '_blank'}
        rel={isMailto ? undefined : 'noopener noreferrer'}
        className={`${baseClass} no-underline cursor-pointer group`}
        style={{
          background: 'var(--ui-action-bg)',
          borderColor: 'var(--ui-action-border)',
          color: 'var(--ui-action-text)',
        }}
        {...hoverHandlers}
      >
        <span className="group-hover:translate-x-0.5 transition-transform truncate">
          {action.label}
        </span>
        <svg
          className="w-3 h-3 opacity-40 group-hover:opacity-80 transition-opacity ml-auto shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M7 17L17 7M17 7H7m10 0v10" />
        </svg>
      </a>
    )
  }

  // 可展开详情按钮 — 带 admin 内联编辑/删除
  return (
    <button
      type="button"
      className={`${baseClass} cursor-pointer group text-left`}
      style={{
        background: 'var(--ui-action-bg)',
        borderColor: 'var(--ui-action-border)',
        color: 'var(--ui-action-text)',
      }}
      {...hoverHandlers}
      onClick={() => onClick(action)}
    >
      <span className="group-hover:translate-x-0.5 transition-transform truncate">
        {action.label}
      </span>
      {action.inlineActions && isAdmin ? (
        <span
          className="flex items-center gap-0.5 ml-auto shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          {action.inlineActions.map((ia, k) => (
            <span
              key={k}
              className="w-5 h-5 rounded flex items-center justify-center cursor-pointer hover:opacity-60 transition-opacity"
              style={{
                color: ia._delete
                  ? 'var(--ui-badge-text)'
                  : 'var(--ui-action-text)',
              }}
              onClick={(e) => {
                e.stopPropagation()
                onClick(ia)
              }}
            >
              {ia._edit ? (
                <Pencil className="w-3 h-3" />
              ) : (
                <Trash2 className="w-3 h-3" />
              )}
            </span>
          ))}
          <svg
            className="w-3 h-3 opacity-30 group-hover:opacity-70 transition-opacity"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </span>
      ) : (
        <svg
          className="w-3 h-3 opacity-30 group-hover:opacity-70 transition-opacity ml-auto shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      )}
    </button>
  )
}

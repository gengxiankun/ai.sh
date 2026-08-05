// Action 按钮组件 — 支持链接跳转 / 展开详情 / admin 内联操作
import { type FC, useState } from 'react'
import { Pencil, Trash2, Clipboard, Clock, Repeat } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import type { Action } from '../types'

type Props = {
  action: Action
  isAdmin: boolean
  onClick: (action: Action) => void
}

const baseClass =
  'flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm transition-all duration-150 w-full'

// 任务优先级颜色（high/medium/low）— 用于 checkbox 边框/填充
const PRIORITY_COLORS = {
  high:   '#ef4444',
  medium: '#d97706',
  low:    '#10b981',
} as const
const PRIORITY_STYLES = {
  high:   { background: 'rgba(239,68,68,0.12)',  color: '#ef4444' },
  medium: { background: 'rgba(245,158,11,0.12)', color: '#d97706' },
  low:    { background: 'rgba(16,185,129,0.12)', color: '#10b981' },
} as const
const PRIORITY_LABELS = { high: '高', medium: '中', low: '低' } as const

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
  const [expanded, setExpanded] = useState(false)

  // 任务卡片（compact）始终可展开；其他卡片仅在存在详情时可展开
  const canExpand = action.compact || !!action.detail

  // 优先级颜色 — 用于 checkbox 边框/填充（无优先级时回退默认色）
  const prioColor = action.priority ? PRIORITY_COLORS[action.priority] : null

  if (action.disabled) {
    return (
      <div className={baseClass} style={{ background: 'var(--ui-disabled-bg)', borderColor: 'var(--ui-border)' }}>
        <span style={{ color: 'var(--ui-disabled-text)' }}>{action.label}</span>
        {action.description && <span className="text-[11px] ml-auto shrink-0 truncate" style={{ color: 'var(--ui-disabled-text)', opacity: 0.6 }}>{action.description}</span>}
        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: 'var(--ui-badge-bg)', color: 'var(--ui-badge-text)' }}>开发中</span>
      </div>
    )
  }

  if (action.url) {
    const isMailto = action.url.startsWith('mailto:')
    return (
      <a href={action.url} target={isMailto ? undefined : '_blank'} rel={isMailto ? undefined : 'noopener noreferrer'}
        className={`${baseClass} no-underline cursor-pointer group`}
        style={{ background: 'var(--ui-action-bg)', borderColor: 'var(--ui-action-border)', color: 'var(--ui-action-text)' }}
        {...hoverHandlers}
      >
        <span className="group-hover:translate-x-0.5 transition-transform truncate">{action.label}</span>
        {action.description && <span className="text-[11px] ml-auto shrink-0 truncate" style={{ color: 'var(--ui-text-secondary)' }}>{action.description}</span>}
        <svg className="w-3 h-3 opacity-40 group-hover:opacity-80 transition-opacity ml-auto shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7 17L17 7M17 7H7m10 0v10" /></svg>
      </a>
    )
  }

  return (
    <button
      type="button"
      className={`flex flex-col ${baseClass} ${canExpand ? 'cursor-pointer' : ''} group text-left items-start`}
      style={{ background: 'var(--ui-action-bg)', borderColor: 'var(--ui-action-border)', color: 'var(--ui-action-text)' }}
      {...hoverHandlers}
      onClick={() => { if (canExpand) setExpanded(!expanded) }}
    >
      <div className="flex items-center w-full">
        {action._done && (
          <span className="w-4 h-4 rounded border flex items-center justify-center mr-2 cursor-pointer hover:opacity-70 shrink-0"
            style={{ borderColor: prioColor ?? 'var(--ui-text-secondary)', background: 'transparent' }}
            onClick={(e) => { e.stopPropagation(); onClick({ label: '', _done: action._done }) }}
          />
        )}
        {action._undo && (
          <span className="w-4 h-4 rounded flex items-center justify-center mr-2 cursor-pointer hover:opacity-70 shrink-0"
            style={{ background: prioColor ?? 'var(--ui-accent)', color: '#fff' }}
            onClick={(e) => { e.stopPropagation(); onClick({ label: '', _undo: action._undo }) }}
          >
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 13l4 4L19 7"/></svg>
          </span>
        )}
        <span className={`group-hover:translate-x-0.5 transition-transform truncate ${action.compact ? 'flex-1 min-w-0' : ''} ${action._undo ? 'line-through opacity-60' : ''}`}>{action.label}</span>
        {action.compact && (action.category || action.tags?.length) && (
          <span className="flex items-center gap-2 ml-2 shrink-0">
            {action.tags?.length ? <Repeat className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--ui-text-secondary)' }} /> : null}
            {action.category && (
              <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--ui-text-secondary)' }}>
                <Clock className="w-3 h-3 shrink-0" />{action.category}
              </span>
            )}
          </span>
        )}
        {action.inlineActions && isAdmin ? (
          <span className="flex items-center gap-0.5 ml-auto shrink-0" onClick={(e) => e.stopPropagation()}>
            {action.inlineActions.map((ia, k) => (
              <span key={k} className="w-5 h-5 rounded flex items-center justify-center cursor-pointer hover:opacity-60 transition-opacity"
                style={{ color: ia._delete ? 'var(--ui-badge-text)' : 'var(--ui-action-text)' }}
                onClick={(e) => { e.stopPropagation(); onClick(ia) }}
              >
                {ia._edit ? <Pencil className="w-3 h-3" /> : ia._copy ? <Clipboard className="w-3 h-3" /> : <Trash2 className="w-3 h-3" />}
              </span>
            ))}
            <svg className={`w-3 h-3 opacity-30 group-hover:opacity-70 transition-all ${expanded ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
          </span>
        ) : (
          <svg className={`w-3 h-3 opacity-30 group-hover:opacity-70 transition-all ml-auto shrink-0 ${expanded ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
        )}
      </div>
      {!action.compact && action.description && !expanded && (
        <div className="text-[11px] mt-0.5 line-clamp-2" style={{ color: 'var(--ui-text-secondary)' }}>{action.description}</div>
      )}
      {!action.compact && (action.priority || action.category || (action.tags && action.tags.length > 0)) && (
        <div className="flex items-center gap-1.5 mt-1">
          {action.priority && (
            <span className="text-[10px] px-1.5 py-px rounded font-medium" style={{ background: PRIORITY_STYLES[action.priority].background, color: PRIORITY_STYLES[action.priority].color }}>
              {PRIORITY_LABELS[action.priority]}优先级
            </span>
          )}
          {action.category && <span className="text-xs" style={{ color: 'var(--ui-text-secondary)' }}>{action.category}</span>}
          {action.tags && action.tags.map((tag) => (<span key={tag} className="text-xs px-1.5 py-px rounded" style={{ color: 'var(--ui-accent)', background: 'var(--ui-action-hover-bg)', border: '0.5px solid var(--ui-action-hover-border)' }}>{tag}</span>))}
        </div>
      )}
      {expanded && (
        <div className="w-full mt-2 max-h-[60vh] overflow-y-auto rounded-md border p-3" style={{ background: 'var(--ui-bg)', borderColor: 'var(--ui-input-border)' }}>
          {action.detail ? (
            <div className="text-sm leading-relaxed prose prose-sm max-w-none dark:prose-invert" style={{ color: 'var(--ui-text-secondary)' }}>
              <ReactMarkdown remarkPlugins={[remarkBreaks, remarkGfm]} rehypePlugins={[rehypeHighlight]}>{action.detail}</ReactMarkdown>
            </div>
          ) : (
            <div className="text-xs" style={{ color: 'var(--ui-text-secondary)', opacity: 0.6 }}>暂无备注</div>
          )}
        </div>
      )}
    </button>
  )
}

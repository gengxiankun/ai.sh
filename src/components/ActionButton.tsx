// Action 按钮组件 — 支持链接跳转 / 展开详情 / admin 内联操作
import { type FC, useState } from 'react'
import { Pencil, Trash2, Clipboard } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'
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
  const [expanded, setExpanded] = useState(false)

  const hasDetail = !!action.detail

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
      className={`flex flex-col ${baseClass} ${hasDetail ? 'cursor-pointer' : ''} group text-left items-start`}
      style={{ background: 'var(--ui-action-bg)', borderColor: 'var(--ui-action-border)', color: 'var(--ui-action-text)' }}
      {...hoverHandlers}
      onClick={() => { if (hasDetail) setExpanded(!expanded) }}
    >
      <div className="flex items-center w-full">
        <span className="group-hover:translate-x-0.5 transition-transform truncate">{action.label}</span>
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
      {action.description && !expanded && (
        <div className="text-[11px] mt-0.5" style={{ color: 'var(--ui-text-secondary)' }}>{action.description}</div>
      )}
      {(action.category || (action.tags && action.tags.length > 0)) && (
        <div className="flex items-center gap-1.5 mt-px">
          {action.category && <span className="text-xs" style={{ color: 'var(--ui-text-secondary)' }}>{action.category}</span>}
          {action.tags && action.tags.map((tag) => (<span key={tag} className="text-xs px-1.5 py-px rounded" style={{ color: 'var(--ui-accent)', background: 'var(--ui-action-hover-bg)', border: '0.5px solid var(--ui-action-hover-border)' }}>{tag}</span>))}
        </div>
      )}
      {expanded && action.detail && (
        <div className="w-full mt-2 max-h-[60vh] overflow-y-auto rounded-md border p-3" style={{ background: 'var(--ui-bg)', borderColor: 'var(--ui-input-border)' }}>
          <div className="text-sm leading-relaxed prose prose-sm max-w-none dark:prose-invert" style={{ color: 'var(--ui-text-secondary)' }}>
            <ReactMarkdown remarkPlugins={[remarkBreaks, remarkGfm]}>{action.detail}</ReactMarkdown>
          </div>
        </div>
      )}
    </button>
  )
}

// 通用弹层容器 — admin 编辑/新增等模态框的共享外壳
// 统一背景遮罩、关闭逻辑、动画效果

import { type FC, type ReactNode } from 'react'

type Props = {
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
  className?: string
}

export const Modal: FC<Props> = ({ title, subtitle, onClose, children, className }) => {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6 animate-[fade-in_0.15s_ease-out]"
      style={{ background: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => {
        // 点击遮罩关闭
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className={`w-[95vw] rounded-2xl shadow-2xl overflow-hidden animate-[fade-in_0.2s_ease-out] ${className || 'max-w-lg'}`}
        style={{
          background: 'var(--ui-input-bg)',
          border: '1px solid var(--ui-input-border)',
        }}
      >
        {/* 标题栏 */}
        <div
          className="px-3 py-2 border-b flex items-center justify-between"
          style={{ borderColor: 'var(--ui-input-border)' }}
        >
          <div>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--ui-text)' }}>
              {title}
            </h3>
            {subtitle && (
              <p
                className="text-[11px] mt-0.5"
                style={{ color: 'var(--ui-suggestion)' }}
              >
                {subtitle}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-5 h-5 rounded-md flex items-center justify-center cursor-pointer hover:opacity-70 transition-opacity"
            style={{
              background: 'var(--ui-action-bg)',
              color: 'var(--ui-text-secondary)',
            }}
          >
            <svg
              className="w-2.5 h-2.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 内容区域 */}
        <div className="p-3 flex flex-col gap-2">{children}</div>
      </div>
    </div>
  )
}

// AI 步骤状态标签 — 显示 Agent tool calling 的进度
// 支持 calling / done / error / reasoning 四种状态

import type { ChatStep } from '../types'
import { type FC } from 'react'

export const StepBadge: FC<{ step: ChatStep }> = ({ step }) => {
  // 推理状态 — 显示 AI 思考过程
  if (step.status === 'reasoning') {
    return (
      <div
        className="text-[10px] px-2 py-1 rounded-lg inline-flex items-start gap-1 max-w-full"
        style={{ background: 'rgba(99,102,241,0.08)', color: '#a5b4fc' }}
      >
        <span className="shrink-0 mt-px">🧠</span>
        <span className="whitespace-pre-wrap leading-relaxed">
          {step.content || 'Thinking...'}
        </span>
      </div>
    )
  }

  // 工具调用状态
  const bgColor =
    step.status === 'calling'
      ? 'var(--ui-action-bg)'
      : step.status === 'done'
        ? '#064e3b'
        : '#7f1d1d'

  const textColor =
    step.status === 'calling'
      ? 'var(--ui-action-text)'
      : step.status === 'done'
        ? '#6ee7b7'
        : '#fca5a5'

  return (
    <span
      className="text-[10px] px-2 py-0.5 rounded-full font-medium inline-flex items-center gap-1 w-fit"
      style={{ background: bgColor, color: textColor }}
    >
      {step.status === 'calling' ? (
        <svg className="w-2.5 h-2.5 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="3"
            strokeDasharray="30 70"
            strokeLinecap="round"
          />
        </svg>
      ) : step.status === 'done' ? (
        <svg
          className="w-2.5 h-2.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg
          className="w-2.5 h-2.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      )}
      {step.skill && <span className="opacity-60">{step.skill}</span>}
      <span className="font-semibold">{step.tool}</span>
    </span>
  )
}

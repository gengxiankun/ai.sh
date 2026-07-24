// 对话历史列表 — 渲染终端输出的所有行
// 包括用户输入、AI 输出、action 按钮、step 状态标签、图片

import { type FC } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'
import type { Line } from '../types'
import { StepBadge } from './StepBadge'
import { ActionButton } from './ActionButton'

type Props = {
  history: Line[]
  isAdmin: boolean
  onActionClick: (action: Line['actions'] extends (infer T)[] | undefined ? T : never) => void
}

export const History: FC<Props> = ({ history, isAdmin, onActionClick }) => {
  // 过滤空行（没有 input、output、status、steps 中任意一个的）
  const visibleLines = history.filter(
    (h) => h.input !== '' || h.output || h.status || h.steps?.length,
  )

  return (
    <div className="flex-1 overflow-y-auto px-4 sm:px-8 md:px-12 py-5">
      <div className="max-w-4xl mx-auto">
        {visibleLines.map((line, i) => (
          <div
            key={i}
            className="mb-3"
            style={{ animation: 'fade-in 0.2s ease-out' }}
          >
            {/* 用户输入 */}
            {line.input !== '' && (
              <div
                className="text-sm font-medium mb-1.5"
                style={{ color: 'var(--ui-accent)' }}
              >
                {line.input}
              </div>
            )}

            {/* 文件附件 */}
            {line.file && (
              <div className="mb-1.5">
                <span
                  className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded"
                  style={{
                    background: 'rgba(99,102,241,0.1)',
                    color: '#818cf8',
                  }}
                >
                  {line.file.name}
                </span>
              </div>
            )}

            {/* AI Steps — Agent tool calling 进度 */}
            {line.steps && line.steps.length > 0 && (
              <div className="flex flex-col gap-1 mt-1.5">
                {line.steps.map((step, j) => (
                  <StepBadge key={j} step={step} />
                ))}
              </div>
            )}

            {/* AI 输出 — Markdown 渲染 */}
            {line.output && (
              <div
                className="text-sm mt-1.5 leading-relaxed prose prose-sm max-w-none dark:prose-invert"
                style={{ color: 'var(--ui-text-secondary)' }}
              >
                <ReactMarkdown remarkPlugins={[remarkBreaks, remarkGfm]}>
                  {line.output}
                </ReactMarkdown>
              </div>
            )}

            {/* 图片展示 */}
            {line.image && (
              <div
                className="mt-3 p-3 rounded-lg border inline-block"
                style={{
                  background: 'var(--ui-image-bg)',
                  borderColor: 'var(--ui-border)',
                }}
              >
                <img
                  src={line.image}
                  alt=""
                  className="w-44 h-44 rounded-md"
                />
              </div>
            )}

            {/* Action 按钮列表 */}
            {line.actions && (
              <div className="mt-2 flex flex-col gap-1.5">
                {line.actions.map((action, j) => (
                  <ActionButton
                    key={j}
                    action={action}
                    isAdmin={isAdmin}
                    onClick={onActionClick}
                  />
                ))}
              </div>
            )}

            {/* 状态指示器（loading spinner / done copy button） */}
            {(line.status || line.input || line.output) && (
              <div className="flex items-center gap-3 mt-1.5">
                {line.status === 'loading' && (
                  <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="var(--ui-suggestion)"
                      strokeWidth="3"
                      strokeDasharray="30 70"
                      strokeLinecap="round"
                    />
                  </svg>
                )}
                {line.status === 'done' && (
                  <button
                    type="button"
                    className="transition-colors cursor-pointer"
                    style={{ color: 'var(--ui-suggestion)' }}
                    onClick={() => {
                      navigator.clipboard
                        .writeText(line.output || line.input)
                        .then()
                    }}
                    title="Copy"
                  >
                    <svg
                      className="w-3 h-3 hover:opacity-80"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <rect x="9" y="9" width="13" height="13" rx="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

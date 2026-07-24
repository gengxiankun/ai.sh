// 输入框组件 — textarea（正常模式）/ 密码显示（密码模式）
// 从 App.tsx 抽出两处重复的输入渲染

import { type FC, type RefObject } from 'react'

type Props = {
  input: string
  passwordMode: boolean
  textareaRef: RefObject<HTMLTextAreaElement | null>
  onChange: (value: string) => void
  onInput: (el: HTMLTextAreaElement) => void
}

export const InputBox: FC<Props> = ({
  input,
  passwordMode,
  textareaRef,
  onChange,
  onInput,
}) => {
  return (
    <div className="flex items-start gap-3 px-4 py-4 text-sm max-h-[24rem] overflow-y-auto">
      {passwordMode ? (
        // 密码模式 — 显示圆点掩码
        <span
          style={{ color: 'var(--ui-text)' }}
          className="flex-1 inline-block min-h-[1.2em]"
        >
          {input || '\u00A0'}
        </span>
      ) : (
        // 正常模式 — 可编辑 textarea
        <textarea
          ref={textareaRef}
          value={input}
          rows={1}
          placeholder="Type / for commands or chat with AI..."
          onChange={(e) => onChange(e.target.value)}
          onInput={(e) => onInput(e.currentTarget)}
          className="w-full bg-transparent border-none outline-none text-sm font-medium resize-none overflow-hidden"
          style={{ color: 'var(--ui-text)', caretColor: 'var(--ui-accent)' }}
          autoFocus
          autoComplete="off"
        />
      )}
    </div>
  )
}

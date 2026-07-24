// About 编辑弹层 — admin 修改个人简介

import { type FC, useState } from 'react'
import { Modal } from './Modal'
import { getAuthToken, supabaseRESTPath } from '../../lib/api'

type Props = {
  currentContent: string
  onClose: () => void
  onSaved: () => void
}

export const AboutEdit: FC<Props> = ({ currentContent, onClose, onSaved }) => {
  const [text, setText] = useState(currentContent)

  // 保存到 Supabase
  const save = async () => {
    const res = await fetch(supabaseRESTPath('site_about?id=eq.1'), {
      method: 'PATCH',
      headers: {
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${getAuthToken()}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ content: text }),
    })
    if (res.ok) {
      onSaved()
      onClose()
    }
  }

  return (
    <Modal
      title="Edit About"
      subtitle="Cmd+Enter to save"
      onClose={onClose}
    >
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault()
            save()
          }
        }}
        className="w-full h-36 sm:h-56 rounded-md border p-2 text-sm font-mono leading-relaxed resize-none outline-none transition-all focus:ring-1"
        style={{
          background: 'var(--ui-bg)',
          borderColor: 'var(--ui-input-border)',
          color: 'var(--ui-text)',
          '--tw-ring-color': 'var(--ui-accent)',
        } as React.CSSProperties}
        spellCheck={false}
        autoFocus
      />
      {/* 底部操作栏 */}
      <div className="flex items-center justify-between mt-1.5">
        <span className="text-[10px]" style={{ color: 'var(--ui-suggestion)' }}>
          {text.length.toLocaleString()} chars
        </span>
        <div className="flex gap-1.5">
          <button
            onClick={onClose}
            className="px-2.5 py-1.5 rounded-md text-xs font-medium cursor-pointer hover:opacity-80 transition-opacity"
            style={{
              background: 'var(--ui-action-bg)',
              color: 'var(--ui-text-secondary)',
            }}
          >
            Cancel
          </button>
          <button
            onClick={save}
            className="px-2.5 py-1.5 rounded-md text-xs font-medium cursor-pointer text-white hover:opacity-90 transition-opacity"
            style={{ background: 'var(--ui-accent)' }}
          >
            Save Changes
          </button>
        </div>
      </div>
    </Modal>
  )
}

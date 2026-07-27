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

  // 保存到 Supabase — 无数据时 POST 新增，有数据时 PATCH 更新
  const save = async () => {
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY
    const token = getAuthToken()
    const headers = {
      apikey: key,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    }

    const check = await fetch(supabaseRESTPath('site_about?select=id&id=eq.1'), {
      headers: { apikey: key, Authorization: `Bearer ${token}` },
    })
    const exists = check.ok && ((await check.json()) as unknown[]).length > 0

    const res = await fetch(
      supabaseRESTPath(exists ? 'site_about?id=eq.1' : 'site_about'),
      {
        method: exists ? 'PATCH' : 'POST',
        headers,
        body: JSON.stringify(exists ? { content: text } : { id: 1, content: text }),
      },
    )

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

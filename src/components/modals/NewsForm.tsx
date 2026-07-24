// News 新增/编辑表单 — admin 管理新闻内容
// 复用于 add 和 edit 两种模式

import { type FC, useState } from 'react'
import { Modal } from './Modal'
import { getAuthToken } from '../../lib/api'
import { uploadDocument, updateDocument } from '../../lib/rag'

type Props = {
  mode: 'add' | 'edit'
  initialTitle?: string
  initialDetail?: string
  editId?: string // 编辑模式下的原始 title（用于定位）
  editDocId?: number | null // 关联的 RAG 文档 ID
  onClose: () => void
  onSaved: () => void
}

export const NewsForm: FC<Props> = ({
  mode,
  initialTitle = '',
  initialDetail = '',
  editId,
  editDocId,
  onClose,
  onSaved,
}) => {
  const [title, setTitle] = useState(initialTitle)
  const [detail, setDetail] = useState(initialDetail)

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY
  const token = getAuthToken()

  const save = async () => {
    if (!title || !detail) return
    if (mode === 'add') {
      // 新增：先上传到知识库，再插入 site_news
      const docId = await uploadDocument(title, detail, 'news')
      await fetch(`${supabaseUrl}/rest/v1/site_news`, {
        method: 'POST',
        headers: {
          apikey: key,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ title, detail, document_id: docId }),
      })
    } else if (editId) {
      // 编辑：PATCH site_news + 同步更新知识库
      await fetch(
        `${supabaseUrl}/rest/v1/site_news?title=eq.${encodeURIComponent(editId)}`,
        {
          method: 'PATCH',
          headers: {
            apikey: key,
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
          },
          body: JSON.stringify({ title, detail }),
        },
      )
      if (editDocId) {
        updateDocument(editDocId, title, detail).then()
      }
    }
    onSaved()
    onClose()
  }

  return (
    <Modal
      title={mode === 'add' ? 'Add News' : 'Edit News'}
      onClose={onClose}
    >
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title"
        className="w-full rounded-md border px-2 py-1.5 text-sm outline-none transition-all focus:ring-1"
        style={{
          background: 'var(--ui-bg)',
          borderColor: 'var(--ui-input-border)',
          color: 'var(--ui-text)',
          '--tw-ring-color': 'var(--ui-accent)',
        } as React.CSSProperties}
        autoFocus
      />
      <textarea
        value={detail}
        onChange={(e) => setDetail(e.target.value)}
        placeholder="Detail content"
        className="w-full h-32 sm:h-48 rounded-md border p-2 text-sm font-mono leading-relaxed resize-none outline-none transition-all focus:ring-1"
        style={{
          background: 'var(--ui-bg)',
          borderColor: 'var(--ui-input-border)',
          color: 'var(--ui-text)',
          '--tw-ring-color': 'var(--ui-accent)',
        } as React.CSSProperties}
        spellCheck={false}
      />
      <div className="flex items-center justify-end gap-1.5">
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
          {mode === 'add' ? 'Add' : 'Save'}
        </button>
      </div>
    </Modal>
  )
}

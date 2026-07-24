// Knowledge Base 上传/编辑表单
// 复用于 kb-upload 和 kb-edit 两种模式

import { type FC, useState } from 'react'
import { Modal } from './Modal'
import { uploadDocument } from '../../lib/rag'
import { getAuthToken } from '../../lib/api'

type Props = {
  mode: 'upload' | 'edit'
  initialTitle?: string
  initialContent?: string
  editId?: number | null // 编辑模式下旧文档 ID（会被删除重建）
  onClose: () => void
  onSaved: (message: string) => void
}

export const KBForm: FC<Props> = ({
  mode,
  initialTitle = '',
  initialContent = '',
  editId,
  onClose,
  onSaved,
}) => {
  const [title, setTitle] = useState(initialTitle)
  const [content, setContent] = useState(initialContent)

  const save = async () => {
    if (!title || !content) return
    if (mode === 'upload') {
      const ok = await uploadDocument(title, content)
      if (ok) {
        onSaved(`Document "${title}" uploaded to knowledge base.`)
      } else {
        onSaved('Upload failed. Check worker configuration.')
      }
    } else if (editId) {
      // 编辑模式：上传新文档 + 删除旧文档
      const ok = await uploadDocument(title, content)
      if (ok) {
        // 删除旧文档
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
        const key = import.meta.env.VITE_SUPABASE_ANON_KEY
        const token = getAuthToken()
        await fetch(`${supabaseUrl}/rest/v1/rag_documents?id=eq.${editId}`, {
          method: 'DELETE',
          headers: {
            apikey: key,
            Authorization: `Bearer ${token}`,
            Prefer: 'return=minimal',
          },
        })
        onSaved('Document updated.')
      } else {
        onSaved('Update failed.')
      }
    }
    onClose()
  }

  return (
    <Modal
      title={
        mode === 'upload'
          ? 'Upload to Knowledge Base'
          : 'Edit Knowledge Base Document'
      }
      onClose={onClose}
    >
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Document title"
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
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Document content"
        className="w-full h-48 rounded-md border p-2 text-sm font-mono leading-relaxed resize-none outline-none transition-all focus:ring-1"
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
          {mode === 'upload' ? 'Upload' : 'Save'}
        </button>
      </div>
    </Modal>
  )
}

// Post 新增/编辑表单 — admin 管理文章内容
// 复用于 add 和 edit 两种模式，支持分类和标签

import { type FC, useState, useEffect, useRef } from 'react'
import { BottomSheet } from './BottomSheet'
import { getAuthToken } from '../../lib/api'
import { uploadDocument, updateDocument } from '../../lib/rag'
import { fetchCategories, fetchTags } from '../../store/api'
import type { SiteCategory, SiteTag } from '../../types'

type Props = {
  mode: 'add' | 'edit'
  initialTitle?: string
  initialDetail?: string
  editId?: string // 编辑模式下的 post id
  editDocId?: number | null // 关联的 RAG 文档 ID
  onClose: () => void
  onSaved: () => void
}

export const PostForm: FC<Props> = ({
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
  const [categoryId, setCategoryId] = useState<number | ''>('')
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([])
  const [showCatDropdown, setShowCatDropdown] = useState(false)
  const [showTagDropdown, setShowTagDropdown] = useState(false)
  const [categories, setCategories] = useState<SiteCategory[]>([])
  const [tags, setTags] = useState<SiteTag[]>([])
  const [newCatName, setNewCatName] = useState('')
  const [newTagName, setNewTagName] = useState('')
  const catDropdownRef = useRef<HTMLDivElement>(null)
  const tagDropdownRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY
  const token = getAuthToken()

  useEffect(() => {
    fetchCategories().then((data) => {
      setCategories(data)
      if (data.length > 0 && mode === 'add') setCategoryId(data[0].id)
    })
    fetchTags().then(setTags)
  }, [mode])

  // 点击外部关闭下拉
  useEffect(() => {
    if (!showCatDropdown && !showTagDropdown) return
    const handler = (e: MouseEvent) => {
      if (showCatDropdown && catDropdownRef.current && !catDropdownRef.current.contains(e.target as Node)) {
        setShowCatDropdown(false)
      }
      if (showTagDropdown && tagDropdownRef.current && !tagDropdownRef.current.contains(e.target as Node)) {
        setShowTagDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showCatDropdown, showTagDropdown])

  const selectCategory = (id: number | '') => {
    setCategoryId(id)
    setShowCatDropdown(false)
  }

  const addCategory = async () => {
    const trimmed = newCatName.trim()
    if (!trimmed) return
    const existing = categories.find((c) => c.name === trimmed)
    if (existing) {
      setCategoryId(existing.id)
      setNewCatName('')
      setShowCatDropdown(false)
      return
    }
    const res = await fetch(`${supabaseUrl}/rest/v1/site_categories`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({ name: trimmed, slug: trimmed.toLowerCase().replace(/\s+/g, '-') }),
    })
    if (res.ok) {
      const data = await res.json()
      const created = data?.[0]
      if (created) {
        setCategories((prev) => [...prev, created])
        setCategoryId(created.id)
      }
    }
    setNewCatName('')
    setShowCatDropdown(false)
  }

  const toggleTag = (id: number) => {
    setSelectedTagIds((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id],
    )
  }

  const addTag = async () => {
    const trimmed = newTagName.trim()
    if (!trimmed) return
    const existing = tags.find((t) => t.name === trimmed)
    if (existing) {
      if (!selectedTagIds.includes(existing.id)) {
        setSelectedTagIds((prev) => [...prev, existing.id])
      }
      setNewTagName('')
      return
    }
    const res = await fetch(`${supabaseUrl}/rest/v1/site_tags`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({ name: trimmed, slug: trimmed.toLowerCase().replace(/\s+/g, '-') }),
    })
    if (res.ok) {
      const data = await res.json()
      const created = data?.[0]
      if (created) {
        setTags((prev) => [...prev, created])
        setSelectedTagIds((prev) => [...prev, created.id])
      }
    }
    setNewTagName('')
  }

  const selectedCategoryName = categoryId
    ? categories.find((c) => c.id === categoryId)?.name ?? ''
    : ''

  const selectedTagNames = tags
    .filter((t) => selectedTagIds.includes(t.id))
    .map((t) => t.name)
    .join(', ')

  const insertMarkdown = (before: string, after = '') => {
    const ta = textareaRef.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const selected = detail.slice(start, end)
    const replacement = before + selected + after
    const newVal = detail.slice(0, start) + replacement + detail.slice(end)
    setDetail(newVal)
    requestAnimationFrame(() => {
      ta.focus()
      const cursor = start + before.length + selected.length + after.length
      ta.setSelectionRange(cursor, cursor)
    })
  }

  const save = async () => {
    if (!title || !detail) return
    if (mode === 'add') {
      const docId = await uploadDocument(title, detail, 'post')
      const res = await fetch(`${supabaseUrl}/rest/v1/site_posts`, {
        method: 'POST',
        headers: {
          apikey: key,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify({
          title,
          detail,
          category_id: categoryId || null,
          document_id: docId,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        const postId = data?.[0]?.id
        if (postId && selectedTagIds.length > 0) {
          await Promise.all(
            selectedTagIds.map((tagId) =>
              fetch(`${supabaseUrl}/rest/v1/site_post_tags`, {
                method: 'POST',
                headers: {
                  apikey: key,
                  Authorization: `Bearer ${token}`,
                  'Content-Type': 'application/json',
                  Prefer: 'return=minimal',
                },
                body: JSON.stringify({ post_id: postId, tag_id: tagId }),
              }),
            ),
          )
        }
      }
    } else if (editId) {
      await fetch(
        `${supabaseUrl}/rest/v1/site_posts?id=eq.${editId}`,
        {
          method: 'PATCH',
          headers: {
            apikey: key,
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
          },
          body: JSON.stringify({
            title,
            detail,
            category_id: categoryId || null,
          }),
        },
      )
      if (editDocId) {
        updateDocument(editDocId, title, detail).then()
      }
      // 更新标签：先删后插
      await fetch(
        `${supabaseUrl}/rest/v1/site_post_tags?post_id=eq.${editId}`,
        {
          method: 'DELETE',
          headers: {
            apikey: key,
            Authorization: `Bearer ${token}`,
            Prefer: 'return=minimal',
          },
        },
      )
      if (selectedTagIds.length > 0) {
        await Promise.all(
          selectedTagIds.map((tagId) =>
            fetch(`${supabaseUrl}/rest/v1/site_post_tags`, {
              method: 'POST',
              headers: {
                apikey: key,
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
                Prefer: 'return=minimal',
              },
              body: JSON.stringify({ post_id: Number(editId), tag_id: tagId }),
            }),
          ),
        )
      }
    }
    onSaved()
    onClose()
  }

  return (
    <BottomSheet
      title={mode === 'add' ? '创建帖子' : '编辑帖子'}
      onClose={onClose}
    >
      <div className="flex flex-col h-full gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="标题"
          className="rounded-md border px-2 py-1.5 text-sm outline-none transition-all focus:ring-1 shrink-0"
          style={{
            width: '60%',
            background: 'var(--ui-bg)',
            borderColor: 'var(--ui-input-border)',
            color: 'var(--ui-text)',
            '--tw-ring-color': 'var(--ui-accent)',
          } as React.CSSProperties}
          autoFocus
        />

        {/* 分类 + 标签同一行 */}
        <div className="flex items-center gap-2 shrink-0" style={{ width: '60%' }}>
          <div className="flex-1 relative" ref={catDropdownRef}>
            <input
              readOnly
              value={selectedCategoryName}
              onClick={() => setShowCatDropdown((v) => !v)}
              placeholder="点击选择分类"
              className="w-full rounded-md border px-2 py-1.5 text-sm outline-none transition-all focus:ring-1 cursor-pointer truncate"
              style={{
                background: 'var(--ui-bg)',
                borderColor: 'var(--ui-input-border)',
                color: 'var(--ui-text)',
                '--tw-ring-color': 'var(--ui-accent)',
              } as React.CSSProperties}
            />
            {showCatDropdown && (
              <div
                className="absolute top-full left-0 right-0 mt-1 rounded-md border shadow-lg z-10 max-h-36 overflow-y-auto"
                style={{
                  background: 'var(--ui-input-bg)',
                  borderColor: 'var(--ui-input-border)',
                }}
              >
                <div
                  className="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:opacity-80 text-sm"
                  style={{ color: 'var(--ui-text-secondary)' }}
                  onClick={() => selectCategory('')}
                >
                  无分类
                </div>
                {categories.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:opacity-80 text-sm"
                    style={{
                      color: categoryId === c.id ? 'var(--ui-accent)' : 'var(--ui-text)',
                      background: categoryId === c.id ? 'var(--ui-action-bg)' : 'transparent',
                    }}
                    onClick={() => selectCategory(c.id)}
                  >
                    {c.name}
                  </div>
                ))}
                <div
                  className="flex items-center gap-1.5 px-2 py-1.5 border-t"
                  style={{ borderColor: 'var(--ui-input-border)' }}
                >
                  <input
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        addCategory()
                      }
                    }}
                    placeholder="新增分类…"
                    className="flex-1 text-sm outline-none"
                    style={{
                      background: 'transparent',
                      color: 'var(--ui-text)',
                    }}
                  />
                  <button
                    onClick={addCategory}
                    className="text-xs px-1.5 py-0.5 rounded cursor-pointer text-white shrink-0"
                    style={{ background: 'var(--ui-accent)' }}
                  >
                    新增
                  </button>
                </div>
              </div>
            )}
          </div>
          <div className="flex-1 relative" ref={tagDropdownRef}>
            <input
              readOnly
              value={selectedTagNames}
              onClick={() => setShowTagDropdown((v) => !v)}
              placeholder="点击选择标签"
              className="w-full rounded-md border px-2 py-1.5 text-sm outline-none transition-all focus:ring-1 cursor-pointer truncate"
              style={{
                background: 'var(--ui-bg)',
                borderColor: 'var(--ui-input-border)',
                color: 'var(--ui-text)',
                '--tw-ring-color': 'var(--ui-accent)',
              } as React.CSSProperties}
            />
            {showTagDropdown && (
              <div
                className="absolute top-full left-0 right-0 mt-1 rounded-md border shadow-lg z-10 max-h-40 overflow-y-auto"
                style={{
                  background: 'var(--ui-input-bg)',
                  borderColor: 'var(--ui-input-border)',
                }}
              >
                {tags.map((t) => {
                  const selected = selectedTagIds.includes(t.id)
                  return (
                    <label
                      key={t.id}
                      className="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:opacity-80 text-sm"
                      style={{
                        color: 'var(--ui-text)',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleTag(t.id)}
                        className="accent-current"
                        style={{ accentColor: 'var(--ui-accent)' }}
                      />
                      {t.name}
                    </label>
                  )
                })}
                <div
                  className="flex items-center gap-1.5 px-2 py-1.5 border-t"
                  style={{ borderColor: 'var(--ui-input-border)' }}
                >
                  <input
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        addTag()
                      }
                    }}
                    placeholder="新增标签…"
                    className="flex-1 text-sm outline-none"
                    style={{
                      background: 'transparent',
                      color: 'var(--ui-text)',
                    }}
                  />
                  <button
                    onClick={addTag}
                    className="text-xs px-1.5 py-0.5 rounded cursor-pointer text-white shrink-0"
                    style={{ background: 'var(--ui-accent)' }}
                  >
                    新增
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 内容 — 占满剩余高度 */}
        <div className="flex flex-col flex-1" style={{ width: '80%' }}>
          {/* 工具栏 */}
          <div
            className="flex items-center gap-px px-1.5 py-1 rounded-t-md border shrink-0 select-none"
            style={{
              background: 'var(--ui-input-bg)',
              borderColor: 'var(--ui-input-border)',
            }}
          >
            {([
              { before: '**', after: '**', icon: 'Bold', title: '加粗', group: 0 },
              { before: '*', after: '*', icon: 'Italic', title: '斜体', group: 0 },
              { before: '~~', after: '~~', icon: 'Strike', title: '删除线', group: 0 },
              { before: '`', after: '`', icon: 'Code', title: '行内代码', group: 1 },
              { before: '\n```\n', after: '\n```\n', icon: 'Block', title: '代码块', group: 1 },
              { before: '> ', after: '', icon: 'Quote', title: '引用', group: 2 },
              { before: '[', after: '](url)', icon: 'Link', title: '链接', group: 2 },
              { before: '- ', after: '', icon: 'UL', title: '无序列表', group: 3 },
              { before: '1. ', after: '', icon: 'OL', title: '有序列表', group: 3 },
              { before: '# ', after: '', icon: 'H1', title: '一级标题', group: 4 },
              { before: '## ', after: '', icon: 'H2', title: '二级标题', group: 4 },
              { before: '---\n', after: '', icon: 'HR', title: '分割线', group: 4 },
            ]).map((btn, i, arr) => (
              <span key={i} className="flex items-center">
                {i > 0 && arr[i - 1].group !== btn.group && (
                  <div
                    className="w-px h-4 mx-1 shrink-0"
                    style={{ background: 'var(--ui-input-border)' }}
                  />
                )}
                <button
                  type="button"
                  title={btn.title}
                  onClick={() => insertMarkdown(btn.before, btn.after)}
                  className="p-1 rounded text-xs cursor-pointer transition-colors hover:opacity-100"
                  style={{
                    color: 'var(--ui-text-secondary)',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = 'var(--ui-action-bg)'
                    ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--ui-text)'
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
                    ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--ui-text-secondary)'
                  }}
                >
                  {/* Bold */}
                  {btn.icon === 'Bold' && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/>
                    </svg>
                  )}
                  {/* Italic */}
                  {btn.icon === 'Italic' && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/>
                    </svg>
                  )}
                  {/* Strike */}
                  {btn.icon === 'Strike' && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.3 4.9c-2.3-.6-4.4-1-6.2-.9-2.7 0-5.3.7-5.3 3.6 0 1.5 1.8 2.7 3.7 3v.5H4"/><line x1="12" y1="21" x2="12" y2="10.2"/><path d="M6.7 14.5c2.2.5 3.5.9 5.3 1 4.2 0 5.3-2 5.3-3.5 0-.6-.3-1.1-.8-1.5"/><line x1="4" y1="12" x2="20" y2="12"/>
                    </svg>
                  )}
                  {/* Code */}
                  {btn.icon === 'Code' && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
                    </svg>
                  )}
                  {/* Block code */}
                  {btn.icon === 'Block' && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="10" rx="2"/><line x1="3" y1="7" x2="21" y2="7"/><line x1="14" y1="17" x2="14" y2="21"/><line x1="10" y1="17" x2="18" y2="17"/>
                    </svg>
                  )}
                  {/* Quote */}
                  {btn.icon === 'Quote' && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M6 17h3l2-4V7H5v6h3zm8 0h3l2-4V7h-6v6h3z"/>
                    </svg>
                  )}
                  {/* Link */}
                  {btn.icon === 'Link' && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                    </svg>
                  )}
                  {/* UL */}
                  {btn.icon === 'UL' && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><circle cx="4" cy="6" r="1" fill="currentColor"/><circle cx="4" cy="12" r="1" fill="currentColor"/><circle cx="4" cy="18" r="1" fill="currentColor"/>
                    </svg>
                  )}
                  {/* OL */}
                  {btn.icon === 'OL' && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="11" y1="6" x2="20" y2="6"/><line x1="11" y1="12" x2="20" y2="12"/><line x1="11" y1="18" x2="20" y2="18"/><path d="M4 10V4H3"/><path d="M3.6 10h.8"/><path d="M5 14l-1.5 4h3"/><path d="M3 18h3"/>
                    </svg>
                  )}
                  {/* H1 */}
                  {btn.icon === 'H1' && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 5v14"/><path d="M12 5v14"/><path d="M3 12h9"/><path d="M17 10V5l-3 2"/><line x1="15" y1="14" x2="21" y2="14"/>
                    </svg>
                  )}
                  {/* H2 */}
                  {btn.icon === 'H2' && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 5v14"/><path d="M12 5v14"/><path d="M3 12h9"/><path d="M16 12a3 3 0 1 1 0 6"/><path d="M16 12a3 3 0 1 1 0-6"/>
                    </svg>
                  )}
                  {/* HR */}
                  {btn.icon === 'HR' && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="4" y1="12" x2="20" y2="12"/><polyline points="8 8 4 12 8 16"/><polyline points="16 8 20 12 16 16"/>
                    </svg>
                  )}
                </button>
              </span>
            ))}
          </div>
          <textarea
            ref={textareaRef}
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder="内容 (Markdown)"
            className="flex-1 rounded-b-md border border-t-0 p-2 text-sm font-mono leading-relaxed resize-none outline-none transition-all focus:ring-1"
            style={{
              background: 'var(--ui-bg)',
              borderColor: 'var(--ui-input-border)',
              color: 'var(--ui-text)',
              '--tw-ring-color': 'var(--ui-accent)',
            } as React.CSSProperties}
            spellCheck={false}
          />
        </div>

        {/* 按钮 — 左侧 */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={save}
            className="px-2.5 py-1.5 rounded-md text-xs font-medium cursor-pointer text-white hover:opacity-90 transition-opacity"
            style={{ background: 'var(--ui-accent)' }}
          >
            保存
          </button>
          <button
            onClick={onClose}
            className="px-2.5 py-1.5 rounded-md text-xs font-medium cursor-pointer hover:opacity-80 transition-opacity"
            style={{
              background: 'var(--ui-action-bg)',
              color: 'var(--ui-text-secondary)',
            }}
          >
            舍弃
          </button>
        </div>
      </div>
    </BottomSheet>
  )
}

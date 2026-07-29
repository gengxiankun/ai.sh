// 终端主界面 — 对话历史 + 输入框
// 当用户输入过命令后显示（hasCommands = true）

import { type FC, type RefObject, useState, useRef, useEffect } from 'react'
import type { User } from '@supabase/supabase-js'
import type { Skill } from '../lib/skills/index'
import type { Line, PendingFile } from '../types'
import { History } from './History'
import { CommandDropdown } from './CommandDropdown'
import { StatusBar } from './StatusBar'
import { InputBox } from './InputBox'
import type { Action } from '../types'
import { SkillIcon } from './SkillIcon'
import { Plus, X, Paperclip } from 'lucide-react'

type Props = {
  history: Line[]
  input: string
  dropdownCommands: string[]
  commandDescriptions: Record<string, string>
  dropdownIdx: number
  hoverIdx: number
  passwordMode: boolean
  user: User | null
  isAdmin: boolean
  skills: Skill[]
  modelInfo: { provider: string; model: string } | null
  pendingFile: PendingFile | null
  textareaRef: RefObject<HTMLTextAreaElement | null>
  bottomRef: RefObject<HTMLDivElement | null>
  onInputChange: (v: string) => void
  onInputResize: (el: HTMLTextAreaElement) => void
  onDropdownHover: (i: number) => void
  onDropdownLeave: () => void
  onDropdownSelect: (cmd: string) => void
  onActionClick: (action: Action) => void
  onGuestClick: () => void
  onFileSelect: (file: PendingFile) => void
  onFileRemove: () => void
}

export const Terminal: FC<Props> = ({
  history,
  input,
  dropdownCommands,
  commandDescriptions,
  dropdownIdx,
  hoverIdx,
  passwordMode,
  user,
  isAdmin,
  skills,
  modelInfo,
  pendingFile,
  textareaRef,
  bottomRef,
  onInputChange,
  onInputResize,
  onDropdownHover,
  onDropdownLeave,
  onDropdownSelect,
  onActionClick,
  onGuestClick,
  onFileSelect,
  onFileRemove,
}) => {
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 })
  const [showSkills, setShowSkills] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
        setShowSkills(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const toggleMenu = () => {
    if (!menuOpen && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setMenuPos({ top: r.top, left: r.left })
    }
    setMenuOpen(!menuOpen)
  }

  return (
    <>
      <History
        history={history}
        isAdmin={isAdmin}
        onActionClick={onActionClick}
      />
      <div ref={bottomRef} />

      {/* 底部输入区域 */}
      <div className="shrink-0 px-4 sm:px-8 md:px-12 pb-6 pt-3">
        <div className="max-w-4xl mx-auto relative">
          <CommandDropdown
            commands={dropdownCommands}
            descriptions={commandDescriptions}
            selectedIdx={dropdownIdx}
            hoverIdx={hoverIdx}
            onHover={onDropdownHover}
            onLeave={onDropdownLeave}
            onSelect={onDropdownSelect}
          />

          <div
            className="rounded-xl border overflow-hidden"
            style={{
              background: 'var(--ui-input-bg)',
              borderColor: 'var(--ui-input-border)',
            }}
          >
            <StatusBar
              user={user}
              isAdmin={isAdmin}
              onGuestClick={onGuestClick}
            />
            <InputBox
              input={input}
              passwordMode={passwordMode}
              textareaRef={textareaRef}
              onChange={onInputChange}
              onInput={onInputResize}
            />
            <div
              className="px-3 pb-1 text-[10px] flex items-center gap-2"
              style={{
                borderColor: 'var(--ui-input-border)',
                color: 'var(--ui-text-secondary)',
              }}
            >
              <div ref={btnRef}>
                <Plus
                  className="w-3.5 h-3.5 cursor-pointer hover:opacity-70 transition-opacity"
                  onClick={toggleMenu}
                />
              </div>
              {pendingFile && (
                <span
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded"
                  style={{
                    background: 'rgba(99,102,241,0.1)',
                    color: '#818cf8',
                  }}
                >
                  {pendingFile.name}
                  <X
                    className="w-3 h-3 cursor-pointer hover:opacity-70"
                    onClick={onFileRemove}
                  />
                </span>
              )}
              <span>
                {modelInfo?.provider
                ? `${modelInfo.provider} · ${modelInfo.model}`
                : modelInfo?.model ?? ''}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Plus 下拉菜单 — 渲染在 overflow-hidden 外部 */}
      {menuOpen && (
        <div
          ref={menuRef}
          className="fixed w-36 rounded-lg border py-1 shadow-lg z-50"
          style={{
            top: menuPos.top - 8,
            left: menuPos.left,
            transform: 'translateY(-100%)',
            background: 'var(--ui-input-bg)',
            borderColor: 'var(--ui-input-border)',
          }}
        >
          <label className="flex items-center gap-2 px-3 py-2 text-xs cursor-pointer hover:opacity-80" style={{ color: 'var(--ui-text)' }}>
            <Paperclip className="w-3.5 h-3.5" />
            <span>上传文件</span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".md,.pdf"
              className="hidden"
              onChange={async (e) => {
                setMenuOpen(false)
                const f = e.target.files?.[0]
                if (!f) return
                e.target.value = ''
                const ext = f.name.split('.').pop()?.toLowerCase()
                if (ext === 'md') {
                  const text = await f.text()
                  onFileSelect({ name: f.name, type: 'md', content: text })
                } else if (ext === 'pdf') {
                  const b64 = await new Promise<string>((resolve) => {
                    const reader = new FileReader()
                    reader.onload = () => {
                      const result = (reader.result as string).split(',')[1]
                      resolve(result)
                    }
                    reader.readAsDataURL(f)
                  })
                  const key = import.meta.env.VITE_SUPABASE_ANON_KEY
                  const url = import.meta.env.VITE_SUPABASE_URL
                  try {
                    const res = await fetch(`${url}/functions/v1/chat`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
                      body: JSON.stringify({ parse_pdf: true, pdf_data: b64 }),
                    })
                    if (!res.ok) {
                      const errText = await res.text()
                      throw new Error(`${res.status}: ${errText}`)
                    }
                    const text = await res.text()
                    onFileSelect({ name: f.name, type: 'pdf', content: text })
                  } catch {
                    onFileSelect({ name: f.name, type: 'pdf', content: '[PDF 提取失败]' })
                  }
                }
              }}
            />
          </label>
          <div
            className="flex items-center gap-2 px-3 py-2 text-xs cursor-pointer hover:opacity-80 relative"
            style={{ color: 'var(--ui-text)' }}
            onMouseEnter={() => setShowSkills(true)}
            onMouseLeave={() => setShowSkills(false)}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>技能</span>
            {showSkills && skills.length > 0 && (
              <div
                className="absolute left-full top-0 ml-1 w-56 rounded-lg border py-1 shadow-lg z-50"
                style={{
                  background: 'var(--ui-input-bg)',
                  borderColor: 'var(--ui-input-border)',
                }}
              >
                {skills.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center gap-2 px-3 py-1.5"
                    title={s.description}
                  >
                    <SkillIcon icon={s.icon} className="w-3 h-3 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs font-medium" style={{ color: 'var(--ui-text)' }}>{s.name}</div>
                      <div className="text-[9px] truncate" style={{ color: 'var(--ui-text-secondary)' }}>{s.description}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

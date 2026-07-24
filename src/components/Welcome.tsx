// 欢迎页 — Landing screen（首次打开，没有命令历史时显示）
// 包含 ASCII logo、输入框、推荐问题、更新日志滚动条

import { type FC, type RefObject } from 'react'
import type { User } from '@supabase/supabase-js'
import type { Skill } from '../lib/skills/index'
import type { UpdateEntry } from '../types'
import { CommandDropdown } from './CommandDropdown'
import { StatusBar } from './StatusBar'
import { InputBox } from './InputBox'
import logoText from './logo.txt?raw'
import { Suggestions } from './Suggestions'
import { UpdatesScroll } from './UpdatesScroll'

type Props = {
  input: string
  suggestions: string[]
  updates: UpdateEntry[]
  dropdownCommands: string[]
  commandDescriptions: Record<string, string>
  dropdownIdx: number
  hoverIdx: number
  passwordMode: boolean
  user: User | null
  isAdmin: boolean
  skills: Skill[]
  textareaRef: RefObject<HTMLTextAreaElement | null>
  onInputChange: (v: string) => void
  onInputResize: (el: HTMLTextAreaElement) => void
  onDropdownHover: (i: number) => void
  onDropdownLeave: () => void
  onDropdownSelect: (cmd: string) => void
  onGuestClick: () => void
  onOpenUpdateLog?: () => void
}

export const Welcome: FC<Props> = ({
  input,
  suggestions,
  updates,
  dropdownCommands,
  commandDescriptions,
  dropdownIdx,
  hoverIdx,
  passwordMode,
  user,
  isAdmin,
  skills,
  textareaRef,
  onInputChange,
  onInputResize,
  onDropdownHover,
  onDropdownLeave,
  onDropdownSelect,
  onGuestClick,
  onOpenUpdateLog,
}) => {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 sm:px-8 md:px-12 gap-4">
      {/* ASCII Logo */}
      <div className="text-center">
        <pre
          className="mb-5 inline-block"
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 'clamp(8px, 1.5vw, 13px)',
            lineHeight: '1.4',
            color: 'var(--ui-text)',
          }}
        >
          {logoText}
        </pre>
      </div>

      {/* 输入框区域 */}
      <div className="w-full max-w-3xl relative">
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
            skills={skills}
            onGuestClick={onGuestClick}
          />
          <InputBox
            input={input}
            passwordMode={passwordMode}
            textareaRef={textareaRef}
            onChange={onInputChange}
            onInput={onInputResize}
          />
        </div>
      </div>

      {/* AI 推荐问题 + 更新日志滚动条 */}
      <div className="w-full max-w-3xl">
        <Suggestions suggestions={suggestions} onSelect={onInputChange} />
        <UpdatesScroll updates={updates} onClick={onOpenUpdateLog} />
      </div>
    </div>
  )
}

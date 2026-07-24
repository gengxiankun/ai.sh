// 终端主界面 — 对话历史 + 输入框
// 当用户输入过命令后显示（hasCommands = true）

import { type FC, type RefObject } from 'react'
import type { User } from '@supabase/supabase-js'
import type { Skill } from '../lib/skills/index'
import type { Line } from '../types'
import { History } from './History'
import { CommandDropdown } from './CommandDropdown'
import { StatusBar } from './StatusBar'
import { InputBox } from './InputBox'
import type { Action } from '../types'

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
  textareaRef: RefObject<HTMLTextAreaElement | null>
  bottomRef: RefObject<HTMLDivElement | null>
  onInputChange: (v: string) => void
  onInputResize: (el: HTMLTextAreaElement) => void
  onDropdownHover: (i: number) => void
  onDropdownLeave: () => void
  onDropdownSelect: (cmd: string) => void
  onActionClick: (action: Action) => void
  onGuestClick: () => void
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
  textareaRef,
  bottomRef,
  onInputChange,
  onInputResize,
  onDropdownHover,
  onDropdownLeave,
  onDropdownSelect,
  onActionClick,
  onGuestClick,
}) => {
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
      </div>
    </>
  )
}

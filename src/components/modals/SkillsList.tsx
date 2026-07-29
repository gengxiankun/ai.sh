// Skills 列表弹层 — 展示当前加载的所有 AI Skills

import { type FC } from 'react'
import { Modal } from './Modal'
import type { Skill } from '../../lib/skills/index'
import { SkillIcon } from '../SkillIcon'

type Props = {
  skills: Skill[]
  onClose: () => void
}

export const SkillsList: FC<Props> = ({ skills, onClose }) => {
  return (
    <Modal title="AI Skills" onClose={onClose} className="max-w-md">
      {skills.length === 0 ? (
        <div
          className="text-xs text-center py-2"
          style={{ color: 'var(--ui-suggestion)' }}
        >
          暂无可用 Skills
        </div>
      ) : (
        <div className="flex flex-col gap-1.5 max-h-[14rem] overflow-y-auto">
          {skills.map((s) => (
            <div
              key={s.id}
              className="px-2 py-1.5 rounded-md border"
              style={{
                background: 'var(--ui-action-bg)',
                borderColor: 'var(--ui-action-border)',
              }}
            >
              <div className="flex items-center gap-1.5">
                <SkillIcon icon={s.icon} className="w-4 h-4 shrink-0" />
                <span className="font-semibold text-xs shrink-0" style={{ color: 'var(--ui-text)' }}>
                  {s.name}
                </span>
                <span
                  className="text-[10px] px-1 py-0.5 rounded font-medium shrink-0"
                  style={{
                    background: 'var(--ui-accent)',
                    color: '#fff',
                  }}
                >
                  {s.scripts?.length ?? 0} tools
                </span>
                {s.triggers.length > 0 && (
                  <span
                    className="text-[10px] px-1 py-0.5 rounded font-medium shrink-0"
                    style={{
                      background: 'var(--ui-badge-bg)',
                      color: 'var(--ui-badge-text)',
                    }}
                  >
                    {s.triggers.length} triggers
                  </span>
                )}
              </div>
              <p className="text-xs mt-0.5" style={{ color: 'var(--ui-text-secondary)', lineHeight: '1.3' }}>
                {s.description}
              </p>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}

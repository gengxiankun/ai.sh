// Skills 列表弹层 — 展示当前加载的所有 AI Skills

import { type FC } from 'react'
import { Modal } from './Modal'
import type { Skill } from '../../lib/skills/index'

type Props = {
  skills: Skill[]
  onClose: () => void
}

export const SkillsList: FC<Props> = ({ skills, onClose }) => {
  return (
    <Modal title="Skills" onClose={onClose}>
      {skills.length === 0 ? (
        <div
          className="text-sm text-center py-2"
          style={{ color: 'var(--ui-suggestion)' }}
        >
          No skills loaded
        </div>
      ) : (
        <div className="flex flex-col gap-1 max-h-[16rem] overflow-y-auto">
          {skills.map((s) => (
            <div
              key={s.id}
              className="px-2.5 py-2 rounded-md border text-sm transition-all"
              style={{
                background: 'var(--ui-action-bg)',
                borderColor: 'var(--ui-action-border)',
              }}
            >
              <div className="flex items-center gap-2 mb-0.5">
                <span className="font-semibold shrink-0" style={{ color: 'var(--ui-text)' }}>
                  {s.name}
                </span>
                <span
                  className="text-[9px] px-1.5 py-0.5 rounded font-medium shrink-0"
                  style={{
                    background: 'var(--ui-accent)',
                    color: '#fff',
                  }}
                >
                  {s.scripts?.length ?? 0} tools
                </span>
                {s.triggers.length > 0 && (
                  <span
                    className="text-[9px] px-1.5 py-0.5 rounded font-medium shrink-0"
                    style={{
                      background: 'var(--ui-badge-bg)',
                      color: 'var(--ui-badge-text)',
                    }}
                  >
                    {s.triggers.length} triggers
                  </span>
                )}
              </div>
              <p style={{ color: 'var(--ui-text-secondary)', lineHeight: '1.4' }}>
                {s.description}
              </p>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}

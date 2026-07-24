// 更新日志弹层 — 按日期时间线展示 changelog

import { type FC } from 'react'
import { Modal } from './Modal'
import type { UpdateEntry } from '../../types'

type Props = {
  updates: UpdateEntry[]
  onClose: () => void
}

export const UpdateLogModal: FC<Props> = ({ updates, onClose }) => {
  const grouped: Record<string, UpdateEntry[]> = {}
  for (const u of updates) {
    if (!grouped[u.date]) grouped[u.date] = []
    grouped[u.date].push(u)
  }
  const dates = Object.keys(grouped).sort((a, b) => b.localeCompare(a))

  return (
    <Modal title="更新日志" subtitle={`共 ${updates.length} 条更新`} className="max-w-3xl" onClose={onClose}>
      <div className="max-h-[20rem] overflow-y-auto flex flex-col gap-2">
        {dates.map((date) => (
          <div key={date}>
            <div
              className="text-xs font-semibold mb-1 sticky top-0 py-0.5"
              style={{
                color: 'var(--ui-accent)',
                background: 'var(--ui-input-bg)',
              }}
            >
              {date}
            </div>
            <div className="flex flex-col gap-0.5">
              {grouped[date].map((u, i) => (
                <div
                  key={i}
                  className="text-xs leading-relaxed"
                  style={{ color: 'var(--ui-text-secondary)' }}
                >
                  <span style={{ color: 'var(--ui-suggestion)' }}>&bull; </span>
                  {u.message}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  )
}

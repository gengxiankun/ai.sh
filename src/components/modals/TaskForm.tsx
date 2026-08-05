// 任务表单 — add / edit 两种模式
import { type FC, useState, useEffect } from 'react'
import { BottomSheet } from './BottomSheet'
import { createTask, updateTask } from '../../lib/tasks'

const inputClass = 'rounded-md border px-2.5 py-1.5 text-sm outline-none transition-all focus:ring-1 shrink-0'
const selectClass = 'rounded-md border px-2.5 py-1.5 text-sm outline-none transition-all focus:ring-1 shrink-0 appearance-auto'
const btnClass = 'px-2.5 py-1.5 rounded-md text-xs font-medium cursor-pointer'

const pad = (n: number) => String(n).padStart(2, '0')

// ISO → 本地 datetime-local 值 (YYYY-MM-DDTHH:mm:ss)；纯日期视为当天 00:00:00
function toLocalDatetimeInput(iso: string): string {
  const d = iso.includes('T') ? new Date(iso) : new Date(iso + 'T00:00:00')
  if (isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

// 当前本地时间 → datetime-local 值 (YYYY-MM-DDTHH:mm:ss)
function nowDatetimeInput(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

type Props = {
  mode: 'add' | 'edit'
  onClose: () => void
  onSaved?: () => void
  initialTitle?: string
  initialNote?: string
  initialPriority?: string
  initialDueDate?: string
  initialRecurrence?: string
  initialInterval?: number
  editId?: number
}

export const TaskForm: FC<Props> = ({
  mode, onClose, onSaved,
  initialTitle = '', initialNote = '', initialPriority = 'medium',
  initialDueDate = '', initialRecurrence = '', initialInterval = 1,
  editId,
}) => {
  const [title, setTitle] = useState(initialTitle)
  const [note, setNote] = useState(initialNote)
  const [priority, setPriority] = useState(initialPriority)
  const [dueDate, setDueDate] = useState('')
  const [recurrence, setRecurrence] = useState(initialRecurrence)
  const [interval, setInterval] = useState(initialInterval)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setTitle(initialTitle); setNote(initialNote); setPriority(initialPriority)
    setDueDate(initialDueDate ? toLocalDatetimeInput(initialDueDate) : nowDatetimeInput())
    setRecurrence(initialRecurrence); setInterval(initialInterval)
  }, [initialTitle, initialNote, initialPriority, initialDueDate, initialRecurrence, initialInterval, mode])

  const handleCreate = async () => {
    if (!title.trim()) { setError('标题不能为空'); return }
    setLoading(true)
    try {
      await createTask({ title: title.trim(), note: note.trim(), priority, due_date: dueDate ? new Date(dueDate).toISOString() : undefined, recurrence: recurrence || undefined, recurrence_interval: interval })
      onSaved?.(); onClose()
    } catch (e) { setError(String(e)) }
    setLoading(false)
  }

  const handleEdit = async () => {
    if (!title.trim()) { setError('标题不能为空'); return }
    if (!editId) return
    setLoading(true)
    try {
      await updateTask(editId, { title: title.trim(), note: note.trim(), priority, due_date: dueDate ? new Date(dueDate).toISOString() : undefined, recurrence: recurrence || undefined, recurrence_interval: interval })
      onSaved?.(); onClose()
    } catch (e) { setError(String(e)) }
    setLoading(false)
  }

  return (
    <BottomSheet title={mode === 'edit' ? '编辑任务' : '新建任务'} onClose={onClose}>
      <div className="flex flex-col gap-2 flex-1 min-h-0">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="任务标题"
          className={inputClass + ' font-medium'}
          style={{ background: 'var(--ui-bg)', borderColor: 'var(--ui-input-border)', color: 'var(--ui-text)', width: '60%' }} />

        <input type="datetime-local" step="1" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
          className={inputClass}
          style={{ background: 'var(--ui-bg)', borderColor: 'var(--ui-input-border)', color: 'var(--ui-text)', width: '20%' }} />

        <div className="flex gap-2">
          <select value={priority} onChange={(e) => setPriority(e.target.value)}
            className="rounded-md border px-2.5 py-1.5 text-sm outline-none transition-all focus:ring-1 shrink-0"
            style={{
              background: 'var(--ui-bg)', borderColor: 'var(--ui-input-border)', width: '20%',
              color: priority === 'high' ? '#f85149' : priority === 'medium' ? '#d29922' : '#3fb950',
            }}>
            <option value="low">低</option>
            <option value="medium">中</option>
            <option value="high">高</option>
          </select>

          <select value={recurrence} onChange={(e) => setRecurrence(e.target.value)} className={selectClass}
            style={{ background: 'var(--ui-bg)', borderColor: 'var(--ui-input-border)', color: 'var(--ui-text)', width: '20%' }}>
            <option value="">不重复</option>
            <option value="daily">每天</option>
            <option value="weekly">每周</option>
            <option value="monthly">每月</option>
            <option value="yearly">每年</option>
          </select>

          {recurrence && (
            <>
              <span className="text-xs shrink-0" style={{ color: 'var(--ui-text-secondary)' }}>间隔</span>
              <input type="number" value={interval} onChange={(e) => setInterval(Number(e.target.value) || 1)} min={1}
                className="w-16 rounded-md border px-2 py-1.5 text-sm outline-none transition-all focus:ring-1"
                style={{ background: 'var(--ui-bg)', borderColor: 'var(--ui-input-border)', color: 'var(--ui-text)' }} />
            </>
          )}
        </div>

        <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="备注（可选）"
          className="flex-1 min-h-0 rounded-md border px-2.5 py-1.5 text-sm outline-none transition-all focus:ring-1 resize-none"
          style={{ background: 'var(--ui-bg)', borderColor: 'var(--ui-input-border)', color: 'var(--ui-text)', width: '60%' }} />

        {error && <div className="text-xs" style={{ color: '#f85149' }}>{error}</div>}
        <div className="flex gap-1.5 mt-1 shrink-0">
          <button onClick={onClose} className={btnClass} style={{ background: 'var(--ui-action-bg)', color: 'var(--ui-text-secondary)' }}>取消</button>
          <button onClick={mode === 'edit' ? handleEdit : handleCreate} disabled={loading}
            className={`${btnClass} text-white`} style={{ background: 'var(--ui-accent)' }}>
            {loading ? '...' : mode === 'edit' ? '保存' : '创建'}
          </button>
        </div>
      </div>
    </BottomSheet>
  )
}

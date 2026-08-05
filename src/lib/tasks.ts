// 任务管理 API — CRUD + 周期性自动生成
import { getAuthToken } from './api'

const URL = import.meta.env.VITE_SUPABASE_URL
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export type Task = {
  id: number
  title: string
  note: string
  status: string
  priority: string
  due_date: string | null
  recurrence: string | null
  recurrence_interval: number
  completed_at: string | null
  created_at: string
}

export async function fetchTasks(all = false): Promise<Task[]> {
  let q = 'tasks?select=*&order=due_date.asc.nullslast,priority.asc'
  if (!all) q = 'tasks?select=*&status=eq.pending&order=due_date.asc.nullslast,priority.asc'
  const res = await fetch(`${URL}/rest/v1/${q}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  })
  if (!res.ok) return []
  return res.json()
}

export async function createTask(data: {
  title: string
  note?: string
  priority?: string
  due_date?: string
  recurrence?: string
  recurrence_interval?: number
}): Promise<Task | null> {
  const res = await fetch(`${URL}/rest/v1/tasks`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${getAuthToken()}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(data),
  })
  if (!res.ok) return null
  const rows = await res.json()
  return rows[0] ?? null
}

export async function updateTask(id: number, data: Partial<Task>): Promise<boolean> {
  const res = await fetch(`${URL}/rest/v1/tasks?id=eq.${id}`, {
    method: 'PATCH',
    headers: { apikey: KEY, Authorization: `Bearer ${getAuthToken()}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(data),
  })
  return res.ok
}

export async function completeTask(id: number): Promise<Task | null> {
  // 先获取原任务
  const getRes = await fetch(`${URL}/rest/v1/tasks?id=eq.${id}&select=*`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  })
  if (!getRes.ok) return null
  const rows: Task[] = await getRes.json()
  const task = rows[0]
  if (!task) return null

  // 标记完成
  await fetch(`${URL}/rest/v1/tasks?id=eq.${id}`, {
    method: 'PATCH',
    headers: { apikey: KEY, Authorization: `Bearer ${getAuthToken()}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ status: 'done', completed_at: new Date().toISOString() }),
  })

  // 周期性任务：生成下一个
  if (task.recurrence && task.due_date) {
    const nextDue = nextDueDate(task.due_date, task.recurrence, task.recurrence_interval)
    await createTask({
      title: task.title,
      note: task.note,
      priority: task.priority,
      due_date: nextDue,
      recurrence: task.recurrence,
      recurrence_interval: task.recurrence_interval,
    })
  }

  return task
}

function nextDueDate(current: string, recurrence: string, interval: number): string {
  const d = new Date(current)
  switch (recurrence) {
    case 'daily': d.setDate(d.getDate() + interval); break
    case 'weekly': d.setDate(d.getDate() + interval * 7); break
    case 'monthly': d.setMonth(d.getMonth() + interval); break
    case 'yearly': d.setFullYear(d.getFullYear() + interval); break
  }
  return d.toISOString()
}

export async function deleteTask(id: number): Promise<boolean> {
  const res = await fetch(`${URL}/rest/v1/tasks?id=eq.${id}`, {
    method: 'DELETE',
    headers: { apikey: KEY, Authorization: `Bearer ${getAuthToken()}`, Prefer: 'return=minimal' },
  })
  return res.ok
}

export async function fetchTaskHistory(title: string): Promise<Task[]> {
  const q = `tasks?select=*&title=ilike.*${encodeURIComponent(title)}*&status=eq.done&order=completed_at.desc&limit=30`
  const res = await fetch(`${URL}/rest/v1/${q}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  })
  if (!res.ok) return []
  return res.json()
}

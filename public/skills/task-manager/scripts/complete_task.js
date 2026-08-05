execute = async function(args, context) {
  if (!context.email) return '需要管理员权限，请先登录。'
  var p = typeof args === 'string' ? JSON.parse(args) : args
  if (!p.id) return '缺少 id。'
  var url = context.env.SUPABASE_URL
  var key = context.env.SUPABASE_ANON_KEY
  var token = context.env.SUPABASE_TOKEN || key

  var getRes = await fetch(url + '/rest/v1/tasks?id=eq.' + p.id + '&select=*', {
    headers: { apikey: key, Authorization: 'Bearer ' + key, Accept: 'application/json' }
  })
  if (!getRes.ok) return '获取任务失败: ' + getRes.status
  var rows = await getRes.json()
  var task = rows && rows[0]
  if (!task) return '未找到任务 #' + p.id
  if (task.status === 'done') return '任务「' + task.title + '」已完成。'

  var patch = await fetch(url + '/rest/v1/tasks?id=eq.' + p.id, {
    method: 'PATCH',
    headers: { apikey: key, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ status: 'done', completed_at: new Date().toISOString() })
  })
  if (!patch.ok) return '完成任务失败: ' + patch.status
  var msg = '任务「' + task.title + '」已完成。'

  if (task.recurrence && task.due_date) {
    var next = new Date(task.due_date)
    var interval = task.recurrence_interval || 1
    if (task.recurrence === 'daily') next.setDate(next.getDate() + interval)
    else if (task.recurrence === 'weekly') next.setDate(next.getDate() + interval * 7)
    else if (task.recurrence === 'monthly') next.setMonth(next.getMonth() + interval)
    else if (task.recurrence === 'yearly') next.setFullYear(next.getFullYear() + interval)

    var nb = { title: task.title, due_date: next.toISOString(), recurrence: task.recurrence, recurrence_interval: interval }
    if (task.note) nb.note = task.note
    if (task.priority) nb.priority = task.priority
    await fetch(url + '/rest/v1/tasks', {
      method: 'POST',
      headers: { apikey: key, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(nb)
    })
    msg += ' 已生成下一周期任务。'
  }
  return msg
}

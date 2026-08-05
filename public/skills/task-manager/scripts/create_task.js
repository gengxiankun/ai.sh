execute = async function(args, context) {
  if (!context.email) return '需要管理员权限，请先登录。'
  var p = typeof args === 'string' ? JSON.parse(args) : args
  if (!p.title) return '缺少 title。'
  var url = context.env.SUPABASE_URL
  var key = context.env.SUPABASE_ANON_KEY
  var token = context.env.SUPABASE_TOKEN || key

  var body = { title: p.title, due_date: p.due_date || new Date().toISOString() }
  if (p.note) body.note = p.note
  if (p.priority) body.priority = p.priority
  if (p.recurrence) body.recurrence = p.recurrence
  if (p.recurrence_interval) body.recurrence_interval = p.recurrence_interval

  var res = await fetch(url + '/rest/v1/tasks', {
    method: 'POST',
    headers: { apikey: key, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(body)
  })
  if (!res.ok) return '创建任务失败: ' + res.status
  var data = await res.json()
  var id = data && data[0] ? data[0].id : ''
  return '任务「' + p.title + '」已创建（id: ' + id + '）。'
}

execute = async function(args, context) {
  if (!context.email) return '需要管理员权限，请先登录。'
  var p = typeof args === 'string' ? JSON.parse(args) : args
  if (!p.id) return '缺少 id。'
  var url = context.env.SUPABASE_URL
  var key = context.env.SUPABASE_ANON_KEY
  var token = context.env.SUPABASE_TOKEN || key

  var fields = ['title', 'note', 'priority', 'due_date', 'recurrence', 'recurrence_interval', 'status']
  var body = {}
  for (var i = 0; i < fields.length; i++) {
    var k = fields[i]
    if (p[k] !== undefined && p[k] !== null) body[k] = p[k]
  }
  if (!Object.keys(body).length) return '没有要更新的字段。'

  var res = await fetch(url + '/rest/v1/tasks?id=eq.' + p.id, {
    method: 'PATCH',
    headers: { apikey: key, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(body)
  })
  if (!res.ok) return '更新任务失败: ' + res.status
  return '任务 #' + p.id + ' 已更新。'
}

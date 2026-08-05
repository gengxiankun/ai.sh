execute = async function(args, context) {
  var p = {}
  try { p = JSON.parse(args) } catch {}
  var url = context.env.SUPABASE_URL
  var key = context.env.SUPABASE_ANON_KEY
  var base = 'tasks?select=id,title,note,status,priority,due_date,recurrence,recurrence_interval,completed_at'
  var q = p.status
    ? base + '&status=eq.' + encodeURIComponent(p.status) + '&order=due_date.asc.nullslast,priority.asc'
    : base + '&order=due_date.asc.nullslast,priority.asc'
  var res = await fetch(url + '/rest/v1/' + q, {
    headers: { apikey: key, Authorization: 'Bearer ' + key, Accept: 'application/json' }
  })
  if (!res.ok) return '加载任务失败: ' + res.status
  var data = await res.json()
  if (!data || !data.length) return '暂无任务。'

  return '共 ' + data.length + ' 个任务:\n' + data.map(function(t, i) {
    var meta = []
    if (t.status === 'done') meta.push('已完成')
    meta.push('优先级:' + t.priority)
    if (t.due_date) meta.push('截止:' + t.due_date.replace('T', ' ').slice(0, 16))
    if (t.recurrence) meta.push('重复:' + t.recurrence + (t.recurrence_interval > 1 ? 'x' + t.recurrence_interval : ''))
    return (i + 1) + '. [' + t.id + '] ' + t.title + (meta.length ? ' (' + meta.join(', ') + ')' : '')
  }).join('\n')
}

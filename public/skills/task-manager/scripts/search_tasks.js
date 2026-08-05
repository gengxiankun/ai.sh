execute = async function(args, context) {
  var p = {}
  try { p = JSON.parse(args) } catch {}

  var url = context.env.SUPABASE_URL
  var key = context.env.SUPABASE_ANON_KEY

  // 本地日期 → UTC ISO 边界，避免时区偏移导致查不到当天任务
  function dayStart(dateStr) {
    var d = new Date(dateStr + 'T00:00:00')
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString()
  }
  function dayEnd(dateStr) {
    var d = new Date(dateStr + 'T00:00:00')
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).toISOString()
  }

  var conds = []
  // 关键词：匹配标题或备注（逻辑树语法，内部 or(...) 不带 =）
  if (p.query) {
    var q = encodeURIComponent(String(p.query).trim())
    conds.push('or(title.ilike.*' + q + '*,note.ilike.*' + q + '*)')
  }
  if (p.status) conds.push('status.eq.' + encodeURIComponent(p.status))
  // 时间：匹配截止时间或完成时间
  if (p.date || p.from || p.to) {
    var from = p.date || p.from
    var to = p.date || p.to
    var tf = []
    if (from) {
      var s = dayStart(from)
      tf.push('due_date.gte.' + s, 'completed_at.gte.' + s)
    }
    if (to) {
      var e = dayEnd(to)
      tf.push('due_date.lte.' + e, 'completed_at.lte.' + e)
    }
    conds.push('or(' + tf.join(',') + ')')
  }

  var qs = 'tasks?select=id,title,note,status,priority,due_date,recurrence,recurrence_interval,completed_at'
  if (conds.length === 1) {
    // 单条件：or(...) 转顶层 or=(...)；简单条件原样
    var c = conds[0]
    qs += '&' + (c.slice(0, 3) === 'or(' ? 'or=(' + c.slice(3) : c)
  } else if (conds.length > 1) {
    // 多条件：and=() 逻辑树，内部子逻辑用 or(...)
    qs += '&and=(' + conds.join(',') + ')'
  }
  qs += '&order=due_date.asc.nullslast'

  var res = await fetch(url + '/rest/v1/' + qs, {
    headers: { apikey: key, Authorization: 'Bearer ' + key, Accept: 'application/json' }
  })
  if (!res.ok) return '搜索任务失败: ' + res.status
  var data = await res.json()
  if (!data || !data.length) return '没有找到匹配的任务。'

  return '找到 ' + data.length + ' 个任务:\n' + data.map(function(t, i) {
    var status = t.status === 'done' ? '✅已完成' : '⏳待办'
    var due = t.due_date ? ' · 截止 ' + t.due_date.replace('T', ' ').slice(0, 16) : ''
    var doneAt = t.status === 'done' && t.completed_at ? ' · 完成于 ' + t.completed_at.replace('T', ' ').slice(0, 16) : ''
    var line = (i + 1) + '. [' + t.id + '] ' + t.title + ' (' + status + due + doneAt + ')'
    if (t.note) line += '\n    备注: ' + (t.note.length > 500 ? t.note.slice(0, 500) + '…' : t.note)
    return line
  }).join('\n')
}

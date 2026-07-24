execute = async function(args, context) {
  if (!context.email) return '需要管理员权限，请先登录。'
  var p = typeof args === 'string' ? JSON.parse(args) : args
  if (!p.title) return '缺少 title。'
  var url = context.env.SUPABASE_URL
  var key = context.env.SUPABASE_ANON_KEY
  var token = context.env.SUPABASE_TOKEN || key
  var res = await fetch(url + '/rest/v1/site_news?title=eq.' + encodeURIComponent(p.title), {
    method: 'DELETE',
    headers: { apikey: key, Authorization: 'Bearer ' + token, Prefer: 'return=minimal' }
  })
  if (!res.ok) return '删除新闻失败: ' + res.status
  return '新闻「' + p.title + '」已删除。'
}

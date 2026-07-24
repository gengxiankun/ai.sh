execute = async function(args, context) {
  if (!context.email) return '需要管理员权限，请先登录。'
  var p = typeof args === 'string' ? JSON.parse(args) : args
  if (!p.content) return '缺少 content。'
  var url = context.env.SUPABASE_URL
  var key = context.env.SUPABASE_ANON_KEY
  var token = context.env.SUPABASE_TOKEN || key
  var res = await fetch(url + '/rest/v1/site_about?id=eq.1', {
    method: 'PATCH',
    headers: {
      apikey: key,
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    },
    body: JSON.stringify({ content: p.content })
  })
  if (!res.ok) return '更新关于内容失败: ' + res.status
  return '关于内容已更新。'
}

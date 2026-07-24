execute = async function(args, context) {
  if (!context.email) return '需要管理员权限，请先登录。'
  var p = typeof args === 'string' ? JSON.parse(args) : args
  if (!p.target) return '缺少 target（要编辑的原标题）。'
  var body = {}
  if (p.title !== undefined) body.title = p.title
  if (p.detail !== undefined) body.detail = p.detail
  if (!Object.keys(body).length) return '没有要更新的字段。'
  var url = context.env.SUPABASE_URL
  var key = context.env.SUPABASE_ANON_KEY
  var token = context.env.SUPABASE_TOKEN || key
  var res = await fetch(url + '/rest/v1/site_news?title=eq.' + encodeURIComponent(p.target), {
    method: 'PATCH',
    headers: {
      apikey: key,
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    },
    body: JSON.stringify(body)
  })
  if (!res.ok) return '编辑新闻失败: ' + res.status
  return '新闻「' + p.target + '」已更新。'
}

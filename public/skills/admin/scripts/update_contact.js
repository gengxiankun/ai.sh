execute = async function(args, context) {
  if (!context.email) return '需要管理员权限，请先登录。'
  var p = typeof args === 'string' ? JSON.parse(args) : args
  var body = {}
  if (p.content !== undefined) body.content = p.content
  if (p.image !== undefined) body.image = p.image
  if (!Object.keys(body).length) return '没有要更新的字段。'
  var url = context.env.SUPABASE_URL
  var key = context.env.SUPABASE_ANON_KEY
  var token = context.env.SUPABASE_TOKEN || key
  var res = await fetch(url + '/rest/v1/site_contact?id=eq.1', {
    method: 'PATCH',
    headers: {
      apikey: key,
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    },
    body: JSON.stringify(body)
  })
  if (!res.ok) return '更新联系方式失败: ' + res.status
  return '联系方式已更新。'
}

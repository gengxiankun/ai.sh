execute = async function(args, context) {
  if (!context.email) return '需要管理员权限，请先登录。'
  var p = typeof args === 'string' ? JSON.parse(args) : args
  if (!p.target) return '缺少 target（要编辑的原项目名）。'
  var body = {}
  if (p.name !== undefined) body.name = p.name
  if (p.url !== undefined) body.url = p.url
  if (p.disabled !== undefined) body.disabled = (p.disabled === true || p.disabled === 'true')
  if (p.sort_order !== undefined) body.sort_order = parseInt(p.sort_order, 10) || 0
  if (!Object.keys(body).length) return '没有要更新的字段。'
  var url = context.env.SUPABASE_URL
  var key = context.env.SUPABASE_ANON_KEY
  var token = context.env.SUPABASE_TOKEN || key
  var res = await fetch(url + '/rest/v1/site_projects?name=eq.' + encodeURIComponent(p.target), {
    method: 'PATCH',
    headers: {
      apikey: key,
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    },
    body: JSON.stringify(body)
  })
  if (!res.ok) return '编辑项目失败: ' + res.status
  return '项目「' + p.target + '」已更新。'
}

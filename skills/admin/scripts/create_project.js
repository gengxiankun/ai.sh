execute = async function(args, context) {
  if (!context.email) return '需要管理员权限，请先登录。'
  var p = typeof args === 'string' ? JSON.parse(args) : args
  if (!p.name) return '缺少 name（项目名）。'
  var url = context.env.SUPABASE_URL
  var key = context.env.SUPABASE_ANON_KEY
  var token = context.env.SUPABASE_TOKEN || key
  var body = {
    name: p.name,
    url: p.url || null,
    disabled: p.disabled === true || p.disabled === 'true'
  }
  if (p.sort_order !== undefined) body.sort_order = parseInt(p.sort_order, 10) || 0
  var res = await fetch(url + '/rest/v1/site_projects', {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    },
    body: JSON.stringify(body)
  })
  if (!res.ok) return '新增项目失败: ' + res.status
  return '项目「' + p.name + '」已新增。'
}

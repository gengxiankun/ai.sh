execute = async function(args, context) {
  if (!context.email) return '需要管理员权限，请先登录。'
  var p = typeof args === 'string' ? JSON.parse(args) : args
  if (!p.name) return '缺少 name（项目名）。'
  var url = context.env.SUPABASE_URL
  var key = context.env.SUPABASE_ANON_KEY
  var token = context.env.SUPABASE_TOKEN || key
  var res = await fetch(url + '/rest/v1/site_projects?name=eq.' + encodeURIComponent(p.name), {
    method: 'DELETE',
    headers: { apikey: key, Authorization: 'Bearer ' + token, Prefer: 'return=minimal' }
  })
  if (!res.ok) return '删除项目失败: ' + res.status
  return '项目「' + p.name + '」已删除。'
}

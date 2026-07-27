execute = async function(args, context) {
  if (!context.email) return '需要管理员权限，请先登录。'
  var p = typeof args === 'string' ? JSON.parse(args) : args
  if (!p.id) return '缺少 id（要删除的分类 id）。'
  var url = context.env.SUPABASE_URL
  var key = context.env.SUPABASE_ANON_KEY
  var token = context.env.SUPABASE_TOKEN || key
  var res = await fetch(url + '/rest/v1/site_categories?id=eq.' + p.id, {
    method: 'DELETE',
    headers: { apikey: key, Authorization: 'Bearer ' + token, Prefer: 'return=minimal' }
  })
  if (!res.ok) return '删除分类失败: ' + res.status
  return '分类 #' + p.id + ' 已删除。'
}

execute = async function(args, context) {
  if (!context.email) return '需要管理员权限，请先登录。'
  var p = typeof args === 'string' ? JSON.parse(args) : args
  if (!p.name) return '缺少 name。'
  var slug = p.slug || p.name.toLowerCase().replace(/\s+/g, '-')
  var url = context.env.SUPABASE_URL
  var key = context.env.SUPABASE_ANON_KEY
  var token = context.env.SUPABASE_TOKEN || key
  var res = await fetch(url + '/rest/v1/site_tags', {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: JSON.stringify({ name: p.name, slug: slug })
  })
  if (!res.ok) return '新增标签失败: ' + res.status
  var data = await res.json()
  var created = data?.[0]
  return '标签「' + p.name + '」已新增' + (created ? '（id: ' + created.id + '）' : '') + '。'
}

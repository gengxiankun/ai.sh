execute = async function(args, context) {
  var url = context.env.SUPABASE_URL
  var key = context.env.SUPABASE_ANON_KEY
  var res = await fetch(url + '/rest/v1/site_projects?select=name,url,disabled,sort_order&order=sort_order', {
    headers: { apikey: key, Authorization: 'Bearer ' + key, Accept: 'application/json' }
  })
  if (!res.ok) return '加载项目失败: ' + res.status
  var data = await res.json()
  if (!data || !data.length) return '暂无项目。'
  return '共 ' + data.length + ' 个项目:\n' + data.map(function(pj, i) {
    return (i + 1) + '. [' + (pj.disabled ? '禁用' : '启用') + '] ' + pj.name + (pj.url ? ' → ' + pj.url : '')
  }).join('\n')
}

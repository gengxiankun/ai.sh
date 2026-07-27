execute = async function(args, context) {
  var url = context.env.SUPABASE_URL
  var key = context.env.SUPABASE_ANON_KEY
  var res = await fetch(url + '/rest/v1/site_categories?select=id,name,slug,sort_order&order=sort_order', {
    headers: { apikey: key, Authorization: 'Bearer ' + key, Accept: 'application/json' }
  })
  if (!res.ok) return '加载分类失败: ' + res.status
  var data = await res.json()
  if (!data || !data.length) return '暂无分类。'
  return '共 ' + data.length + ' 个分类:\n' + data.map(function(c, i) {
    return (i + 1) + '. [' + c.id + '] ' + c.name
  }).join('\n')
}

execute = async function(args, context) {
  var url = context.env.SUPABASE_URL
  var key = context.env.SUPABASE_ANON_KEY
  var res = await fetch(url + '/rest/v1/site_tags?select=id,name,slug&order=name', {
    headers: { apikey: key, Authorization: 'Bearer ' + key, Accept: 'application/json' }
  })
  if (!res.ok) return '加载标签失败: ' + res.status
  var data = await res.json()
  if (!data || !data.length) return '暂无标签。'
  return '共 ' + data.length + ' 个标签:\n' + data.map(function(t, i) {
    return (i + 1) + '. [' + t.id + '] ' + t.name
  }).join('\n')
}

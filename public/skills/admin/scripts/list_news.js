execute = async function(args, context) {
  var url = context.env.SUPABASE_URL
  var key = context.env.SUPABASE_ANON_KEY
  var res = await fetch(url + '/rest/v1/site_news?select=title,detail,sort_order&order=sort_order', {
    headers: { apikey: key, Authorization: 'Bearer ' + key, Accept: 'application/json' }
  })
  if (!res.ok) return '加载新闻失败: ' + res.status
  var data = await res.json()
  if (!data || !data.length) return '暂无新闻。'
  return '共 ' + data.length + ' 条新闻:\n' + data.map(function(n, i) {
    return (i + 1) + '. ' + n.title
  }).join('\n')
}

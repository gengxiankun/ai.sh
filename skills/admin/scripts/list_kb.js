execute = async function(args, context) {
  var url = context.env.SUPABASE_URL
  var key = context.env.SUPABASE_ANON_KEY
  var res = await fetch(url + '/rest/v1/rag_documents?select=id,title,source&order=id.desc&limit=50', {
    headers: { apikey: key, Authorization: 'Bearer ' + key, Accept: 'application/json' }
  })
  if (!res.ok) return '加载知识库失败: ' + res.status
  var data = await res.json()
  if (!data || !data.length) return '知识库为空。'
  return '共 ' + data.length + ' 篇文档:\n' + data.map(function(d) {
    return '#' + d.id + ' ' + d.title + (d.source ? ' (' + d.source + ')' : '')
  }).join('\n')
}

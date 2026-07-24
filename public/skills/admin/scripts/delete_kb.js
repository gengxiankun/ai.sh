execute = async function(args, context) {
  if (!context.email) return '需要管理员权限，请先登录。'
  var p = typeof args === 'string' ? JSON.parse(args) : args
  if (p.id === undefined || p.id === null || p.id === '') return '缺少 id。'
  var url = context.env.SUPABASE_URL
  var key = context.env.SUPABASE_ANON_KEY
  var token = context.env.SUPABASE_TOKEN || key
  var res = await fetch(url + '/rest/v1/rag_documents?id=eq.' + encodeURIComponent(p.id), {
    method: 'DELETE',
    headers: { apikey: key, Authorization: 'Bearer ' + token, Prefer: 'return=minimal' }
  })
  if (!res.ok) return '删除文档失败: ' + res.status
  return '知识库文档 #' + p.id + ' 已删除。'
}

execute = async function(args, context) {
  if (!context.email) return '需要管理员权限，请先登录。'
  var p = typeof args === 'string' ? JSON.parse(args) : args
  if (!p.id) return '缺少 id（要删除的文章 id）。'
  var url = context.env.SUPABASE_URL
  var key = context.env.SUPABASE_ANON_KEY
  var token = context.env.SUPABASE_TOKEN || key

  // 先获取 document_id 以便同步删除 RAG 文档
  var item = await fetch(url + '/rest/v1/site_posts?id=eq.' + p.id + '&select=document_id', {
    headers: { apikey: key, Authorization: 'Bearer ' + key }
  }).then(function(r) { return r.json() }).then(function(d) { return d?.[0] })

  var res = await fetch(url + '/rest/v1/site_posts?id=eq.' + p.id, {
    method: 'DELETE',
    headers: { apikey: key, Authorization: 'Bearer ' + token, Prefer: 'return=minimal' }
  })
  if (!res.ok) return '删除文章失败: ' + res.status

  // 同步删除关联的 RAG 文档
  if (item && item.document_id) {
    await fetch(url + '/rest/v1/rag_documents?id=eq.' + item.document_id, {
      method: 'DELETE',
      headers: { apikey: key, Authorization: 'Bearer ' + token, Prefer: 'return=minimal' }
    }).catch(function() {})
  }

  return '文章 #' + p.id + ' 已删除。'
}

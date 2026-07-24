execute = async function(args, context) {
  if (!context.email) return '需要管理员权限，请先登录。'
  var p = typeof args === 'string' ? JSON.parse(args) : args
  if (!p.title || !p.content) return '缺少 title 或 content。'
  var url = context.env.SUPABASE_URL
  var key = context.env.SUPABASE_ANON_KEY
  var token = context.env.SUPABASE_TOKEN || key
  var workerUrl = context.env.WORKER_URL

  var embRes = await fetch(workerUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{ role: 'user', content: p.content }],
      stream: false,
      embedding: true
    })
  })
  if (!embRes.ok) return '生成向量失败: ' + embRes.status
  var embData = await embRes.json()
  var embedding = embData.embedding || (embData.data && embData.data[0] && embData.data[0].embedding)
  if (!embedding || !embedding.length) return '生成向量失败：返回为空。'

  var res = await fetch(url + '/rest/v1/rag_documents', {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: JSON.stringify({
      title: p.title,
      content: p.content,
      source: p.source || 'admin',
      embedding: JSON.stringify(embedding)
    })
  })
  if (!res.ok) return '写入知识库失败: ' + res.status
  var saved = await res.json()
  var id = saved && saved[0] ? saved[0].id : '?'
  return '文档「' + p.title + '」已加入知识库 (id: ' + id + ')。'
}

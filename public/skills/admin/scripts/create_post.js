execute = async function(args, context) {
  if (!context.email) return '需要管理员权限，请先登录。'
  var p = typeof args === 'string' ? JSON.parse(args) : args
  if (!p.title || !p.detail) return '缺少 title 或 detail。'
  if (!p.category_id) return '缺少 category_id（请先用 list_categories 获取分类列表）。'
  var url = context.env.SUPABASE_URL
  var key = context.env.SUPABASE_ANON_KEY
  var token = context.env.SUPABASE_TOKEN || key
  var workerUrl = context.env.WORKER_URL

  var body = { title: p.title, detail: p.detail, category_id: p.category_id }

  // 1. 分块
  var chunks = splitContent(p.detail)
  if (!chunks.length) return '内容分块失败。'

  // 2. 创建 rag_documents 记录
  var docRes = await fetch(url + '/rest/v1/rag_documents', {
    method: 'POST',
    headers: { apikey: key, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ title: p.title, source: 'post' })
  })
  if (!docRes.ok) return '创建 RAG 记录失败: ' + docRes.status
  var docData = await docRes.json()
  var docId = docData?.[0]?.id
  if (!docId) return '创建 RAG 记录失败。'
  body.document_id = docId

  // 3. 批量 embedding
  var embRes = await fetch(workerUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
    body: JSON.stringify({ embedding_batch: true, embedding_texts: chunks, embedding_task: 'retrieval.passage' })
  })
  if (!embRes.ok) return '生成向量失败: ' + embRes.status
  var embData = await embRes.json()
  var embeddings = embData.data

  // 4. 插入 chunk
  for (var i = 0; i < chunks.length; i++) {
    var emb = embeddings[i]?.embedding
    if (!emb || !emb.length) continue
    await fetch(url + '/rest/v1/rag_chunks', {
      method: 'POST',
      headers: { apikey: key, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ document_id: docId, chunk_index: i, content: chunks[i], embedding: JSON.stringify(emb) })
    })
  }

  // 5. 创建文章
  var res = await fetch(url + '/rest/v1/site_posts', {
    method: 'POST',
    headers: { apikey: key, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(body)
  })
  if (!res.ok) return '新增文章失败: ' + res.status
  var data = await res.json()
  var postId = data[0]?.id
  if (postId && p.tags && Array.isArray(p.tags) && p.tags.length) {
    for (var ti = 0; ti < p.tags.length; ti++) {
      await fetch(url + '/rest/v1/site_post_tags', {
        method: 'POST',
        headers: { apikey: key, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ post_id: postId, tag_id: p.tags[ti] })
      })
    }
  }
  return '文章「' + p.title + '」已新增（id: ' + postId + ', RAG: ' + chunks.length + ' chunks）。'
}

function splitContent(text) {
  var chunks = []
  var paragraphs = text.split(/\n\n+/)
  for (var pi = 0; pi < paragraphs.length; pi++) {
    var trimmed = paragraphs[pi].trim()
    if (!trimmed) continue
    if (trimmed.length <= 1024) {
      chunks.push(trimmed)
    } else {
      var sentences = trimmed.split(/(?<=[。！？；\n])\s*/)
      var current = ''
      for (var si = 0; si < sentences.length; si++) {
        var s = sentences[si].trim()
        if (!s) continue
        if (current.length + s.length > 1024 && current.length > 0) {
          chunks.push(current.trim())
          current = current.slice(-128) + ' ' + s
        } else {
          current += (current ? ' ' : '') + s
        }
      }
      if (current.trim()) chunks.push(current.trim())
    }
  }
  return chunks.filter(function(c) { return c.length > 0 })
}

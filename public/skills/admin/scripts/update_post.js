execute = async function(args, context) {
  if (!context.email) return '需要管理员权限，请先登录。'
  var p = typeof args === 'string' ? JSON.parse(args) : args
  if (!p.id) return '缺少 id（要编辑的文章 id）。'
  var url = context.env.SUPABASE_URL
  var key = context.env.SUPABASE_ANON_KEY
  var token = context.env.SUPABASE_TOKEN || key
  var workerUrl = context.env.WORKER_URL

  var body = {}
  if (p.title !== undefined) body.title = p.title
  if (p.detail !== undefined) body.detail = p.detail
  if (p.category_id !== undefined) body.category_id = p.category_id
  if (!Object.keys(body).length && !p.tags) return '没有要更新的字段。'

  // 1. 更新文章
  if (Object.keys(body).length) {
    var res = await fetch(url + '/rest/v1/site_posts?id=eq.' + p.id, {
      method: 'PATCH',
      headers: { apikey: key, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(body)
    })
    if (!res.ok) return '编辑文章失败: ' + res.status
  }

  // 2. 更新标签
  if (p.tags && Array.isArray(p.tags)) {
    await fetch(url + '/rest/v1/site_post_tags?post_id=eq.' + p.id, {
      method: 'DELETE',
      headers: { apikey: key, Authorization: 'Bearer ' + token, Prefer: 'return=minimal' }
    })
    for (var ti = 0; ti < p.tags.length; ti++) {
      await fetch(url + '/rest/v1/site_post_tags', {
        method: 'POST',
        headers: { apikey: key, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ post_id: Number(p.id), tag_id: p.tags[ti] })
      })
    }
  }

  // 3. 同步 RAG（仅当 detail 有更新时）
  if (p.detail === undefined) return '文章 #' + p.id + ' 已更新。'

  // 查当前 document_id
  var item = await fetch(url + '/rest/v1/site_posts?id=eq.' + p.id + '&select=document_id,title', {
    headers: { apikey: key, Authorization: 'Bearer ' + key }
  }).then(function(r) { return r.json() }).then(function(d) { return d?.[0] })
  if (!item) return '文章 #' + p.id + ' 已更新（RAG 查询失败）。'

  var docId = item.document_id
  if (!docId) {
    // 无 RAG 记录，创建新的
    var chunks = splitContent(p.detail)
    if (!chunks.length) return '文章 #' + p.id + ' 已更新（分块为空）。'
    var docRes = await fetch(url + '/rest/v1/rag_documents', {
      method: 'POST',
      headers: { apikey: key, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ title: p.title || item.title || '', source: 'admin' })
    })
    if (!docRes.ok) return '文章 #' + p.id + ' 已更新（RAG 创建失败）。'
    var docData = await docRes.json()
    docId = docData?.[0]?.id
    if (!docId) return '文章 #' + p.id + ' 已更新（RAG 创建失败）。'
    // 更新 site_posts 关联
    await fetch(url + '/rest/v1/site_posts?id=eq.' + p.id, {
      method: 'PATCH',
      headers: { apikey: key, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ document_id: docId })
    })
  } else {
    // 删旧 chunks
    await fetch(url + '/rest/v1/rag_chunks?document_id=eq.' + docId, {
      method: 'DELETE',
      headers: { apikey: key, Authorization: 'Bearer ' + token, Prefer: 'return=minimal' }
    }).catch(function() {})
    // 更新标题
    if (p.title !== undefined) {
      await fetch(url + '/rest/v1/rag_documents?id=eq.' + docId, {
        method: 'PATCH',
        headers: { apikey: key, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ title: p.title })
      }).catch(function() {})
    }
  }

  // 分块 + 批量 embedding + 插入
  var chunks = splitContent(p.detail)
  if (!chunks.length) return '文章 #' + p.id + ' 已更新（分块为空）。'
  var embRes = await fetch(workerUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
    body: JSON.stringify({ embedding_batch: true, embedding_texts: chunks, embedding_task: 'retrieval.passage' })
  })
  if (!embRes.ok) return '文章 #' + p.id + ' 已更新（向量失败: ' + embRes.status + '）。'
  var embData = await embRes.json()
  var embeddings = embData.data

  for (var i = 0; i < chunks.length; i++) {
    var emb = embeddings[i]?.embedding
    if (!emb || !emb.length) continue
    await fetch(url + '/rest/v1/rag_chunks', {
      method: 'POST',
      headers: { apikey: key, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ document_id: docId, chunk_index: i, content: chunks[i], embedding: JSON.stringify(emb) })
    })
  }

  return '文章 #' + p.id + ' 已更新（RAG: ' + chunks.length + ' chunks）。'
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

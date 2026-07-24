execute = async function(args, context) {
  var query = ''
  try { query = JSON.parse(args).query || '' } catch(e) {}
  if (!query) return 'No search query provided.'

  // Get embedding via Jina (through our worker)
  var workerUrl = context.env.WORKER_URL
  if (!workerUrl) return 'Knowledge base search unavailable.'

  var embedRes = await fetch(workerUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{ role: 'user', content: query }],
      stream: false,
      embedding: true
    })
  })
  if (!embedRes.ok) return 'Embedding generation failed.'
  var embedData = await embedRes.json()
  var embedding = embedData.embedding || (embedData.data && embedData.data[0] && embedData.data[0].embedding) || []
  if (!embedding.length) return 'Embedding generation failed.'

  // Search Supabase RPC
  var supabaseUrl = context.env.SUPABASE_URL
  var supabaseKey = context.env.SUPABASE_ANON_KEY
  var searchRes = await fetch(supabaseUrl + '/rest/v1/rpc/search_rag_docs', {
    method: 'POST',
    headers: {
      apikey: supabaseKey,
      Authorization: 'Bearer ' + supabaseKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query_embedding: JSON.stringify(embedding),
      match_threshold: 0.3,
      match_count: 5
    })
  })
  if (!searchRes.ok) return 'Knowledge base search failed.'
  var docs = await searchRes.json()
  if (!docs || !docs.length) return 'No relevant information found in knowledge base.'

  return docs.map(function(d) {
    return '**' + d.title + '** (' + Math.round(d.similarity * 100) + '%)\n' + d.content.slice(0, 800)
  }).join('\n\n---\n\n')
}

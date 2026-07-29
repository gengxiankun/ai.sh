execute = async function(args, context) {
  var p = typeof args === 'string' ? JSON.parse(args) : args
  var query = p.query || ''
  if (!query) return '缺少搜索关键词 query。'

  var res = await fetch(context.env.WORKER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + context.env.SUPABASE_ANON_KEY },
    body: JSON.stringify({
      proxy: true,
      proxy_skill_id: 'tavily-search',
      proxy_url: 'https://api.tavily.com/search',
      proxy_method: 'POST',
      proxy_headers: {
        'Content-Type': 'application/json',
        'Authorization': '__SECRET__'
      },
      proxy_body: JSON.stringify({
        query: query,
        max_results: Number(p.max_results) || 5,
        search_depth: 'basic'
      })
    })
  })

  if (!res.ok) return '搜索失败: HTTP ' + res.status
  var data = await res.json()
  if (data.error) return '搜索失败: ' + data.error
  if (!data.results || !data.results.length) return '未找到相关结果。'

  return data.results.map(function(r, i) {
    return (i + 1) + '. **' + (r.title || '') + '**\n' + r.url + '\n' + (r.content || '').slice(0, 300)
  }).join('\n\n')
}

execute = async function(args, context) {
  var url = ''
  try { url = JSON.parse(args).url || '' } catch(e) { url = args || '' }
  if (!url) return 'No URL provided.'

  var workerUrl = context.env.WORKER_URL
  if (!workerUrl) return 'Edge function not configured.'

  try {
    var res = await fetch(workerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scrape: true, url: url })
    })

    if (!res.ok) {
      var errBody = ''
      try { errBody = await res.text() } catch(e) {}
      return 'Failed to fetch URL: HTTP ' + res.status + (errBody ? ' - ' + errBody.slice(0, 200) : '')
    }

    var content = await res.text()
    if (!content || !content.trim()) return 'No content found at the URL. The page may be empty or require authentication.'

    var maxLen = 12000
    if (content.length > maxLen) {
      content = content.slice(0, maxLen) + '\n\n...（内容已截断，超出 ' + maxLen + ' 字符）'
    }

    return content
  } catch(e) {
    return 'Failed to fetch URL: ' + (e.message || String(e))
  }
}

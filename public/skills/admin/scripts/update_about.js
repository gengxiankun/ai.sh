execute = async function(args, context) {
  if (!context.email) return '需要管理员权限，请先登录。'

  var p
  try {
    p = typeof args === 'string' ? JSON.parse(args) : args
  } catch (e) {
    console.error('[update_about] JSON parse failed, args:', String(args).substring(0, 500))
    return '参数解析失败: ' + e.message + '。content 内的双引号请用 \\" 转义，换行请用 \\n。'
  }

  if (!p || !p.content) {
    console.error('[update_about] missing content, args:', JSON.stringify(args).substring(0, 200))
    return '缺少必填参数 content。调用格式: { "content": "Markdown 内容" }'
  }

  var url = context.env.SUPABASE_URL
  var key = context.env.SUPABASE_ANON_KEY
  var token = context.env.SUPABASE_TOKEN || key

  var check = await fetch(url + '/rest/v1/site_about?select=id&id=eq.1', {
    headers: { apikey: key, Authorization: 'Bearer ' + token }
  })
  var exists = check.ok && ((await check.json())).length > 0

  var res = await fetch(
    url + '/rest/v1/' + (exists ? 'site_about?id=eq.1' : 'site_about'),
    {
      method: exists ? 'PATCH' : 'POST',
      headers: {
        apikey: key,
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify(exists ? { content: p.content } : { id: 1, content: p.content })
    }
  )
  if (!res.ok) return '更新关于内容失败: HTTP ' + res.status
  return '关于内容已更新。'
}

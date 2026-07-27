execute = async function(args, context) {
  if (!context.email) return '需要管理员权限，请先登录。'
  var p = typeof args === 'string' ? JSON.parse(args) : args
  if (!p.id) return '缺少 id（要编辑的文章 id）。'
  var body = {}
  if (p.title !== undefined) body.title = p.title
  if (p.detail !== undefined) body.detail = p.detail
  if (p.category_id !== undefined) body.category_id = p.category_id
  if (!Object.keys(body).length && !p.tags) return '没有要更新的字段。'
  var url = context.env.SUPABASE_URL
  var key = context.env.SUPABASE_ANON_KEY
  var token = context.env.SUPABASE_TOKEN || key

  if (Object.keys(body).length) {
    var res = await fetch(url + '/rest/v1/site_posts?id=eq.' + p.id, {
      method: 'PATCH',
      headers: {
        apikey: key,
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify(body)
    })
    if (!res.ok) return '编辑文章失败: ' + res.status
  }

  if (p.tags && Array.isArray(p.tags)) {
    await fetch(url + '/rest/v1/site_post_tags?post_id=eq.' + p.id, {
      method: 'DELETE',
      headers: { apikey: key, Authorization: 'Bearer ' + token, Prefer: 'return=minimal' }
    })
    for (var i = 0; i < p.tags.length; i++) {
      await fetch(url + '/rest/v1/site_post_tags', {
        method: 'POST',
        headers: {
          apikey: key,
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal'
        },
        body: JSON.stringify({ post_id: Number(p.id), tag_id: p.tags[i] })
      })
    }
  }

  return '文章 #' + p.id + ' 已更新。'
}

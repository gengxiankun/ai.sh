execute = async function(args, context) {
  if (!context.email) return '需要管理员权限，请先登录。'
  var p = typeof args === 'string' ? JSON.parse(args) : args
  if (!p.title || !p.detail) return '缺少 title 或 detail。'
  if (!p.category_id) return '缺少 category_id（请先用 list_categories 获取分类列表）。'
  var url = context.env.SUPABASE_URL
  var key = context.env.SUPABASE_ANON_KEY
  var token = context.env.SUPABASE_TOKEN || key
  var body = { title: p.title, detail: p.detail, category_id: p.category_id }
  var res = await fetch(url + '/rest/v1/site_posts', {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: JSON.stringify(body)
  })
  if (!res.ok) return '新增文章失败: ' + res.status
  var data = await res.json()
  var postId = data[0]?.id
  if (postId && p.tags && Array.isArray(p.tags) && p.tags.length) {
    for (var i = 0; i < p.tags.length; i++) {
      await fetch(url + '/rest/v1/site_post_tags', {
        method: 'POST',
        headers: {
          apikey: key,
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal'
        },
        body: JSON.stringify({ post_id: postId, tag_id: p.tags[i] })
      })
    }
  }
  return '文章「' + p.title + '」已新增（id: ' + postId + '）。'
}

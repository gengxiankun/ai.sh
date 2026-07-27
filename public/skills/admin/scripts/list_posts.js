execute = async function(args, context) {
  var url = context.env.SUPABASE_URL
  var key = context.env.SUPABASE_ANON_KEY
  var res = await fetch(url + '/rest/v1/site_posts?select=id,title,category_id,sort_order&order=sort_order', {
    headers: { apikey: key, Authorization: 'Bearer ' + key, Accept: 'application/json' }
  })
  if (!res.ok) return '加载文章失败: ' + res.status
  var data = await res.json()
  if (!data || !data.length) return '暂无文章。'

  // 获取分类名
  var catRes = await fetch(url + '/rest/v1/site_categories?select=id,name', {
    headers: { apikey: key, Authorization: 'Bearer ' + key }
  })
  var catMap = {}
  if (catRes.ok) {
    var cats = await catRes.json()
    for (var i = 0; i < cats.length; i++) {
      catMap[cats[i].id] = cats[i].name
    }
  }

  return '共 ' + data.length + ' 篇文章:\n' + data.map(function(p, i) {
    var catName = catMap[p.category_id] || '未分类'
    return (i + 1) + '. [' + p.id + '] [' + catName + '] ' + p.title
  }).join('\n')
}

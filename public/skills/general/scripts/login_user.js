execute = async function(args, context) {
  var p = {}
  try { p = JSON.parse(args) } catch(e) {}
  if (!p.email || !p.password) return 'Missing email or password.'

  var res = await fetch(
    context.env.SUPABASE_URL + '/auth/v1/token?grant_type=password',
    {
      method: 'POST',
      headers: {
        apikey: context.env.SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: p.email, password: p.password }),
    },
  )
  if (!res.ok) {
    var err = await res.json().catch(function() { return { error_description: 'Login failed' } })
    return 'Login failed: ' + (err.error_description || err.msg || res.status)
  }

  // 将 session 写入 localStorage，同步到网站 UI
  var data = await res.json()
  var host = new URL(context.env.SUPABASE_URL).hostname.split('.')[0]
  localStorage.setItem('sb-' + host + '-auth-token', JSON.stringify(data))

  // 延迟刷新页面以同步登录状态
  setTimeout(function() { location.reload() }, 800)

  return 'Login successful! Refreshing the page...'
}

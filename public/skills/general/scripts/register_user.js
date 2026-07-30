execute = async function(args, context) {
  var p = {}
  try { p = JSON.parse(args) } catch(e) {}
  if (!p.email || !p.password) return 'Missing email or password.'

  var res = await fetch(context.env.SUPABASE_URL + '/auth/v1/signup', {
    method: 'POST',
    headers: {
      apikey: context.env.SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email: p.email, password: p.password }),
  })
  if (!res.ok) {
    var err = await res.json().catch(function() { return { msg: res.status } })
    return 'Registration failed: ' + (err.msg || err.message || res.status)
  }
  return 'Registration successful! Check your email to confirm.'
}

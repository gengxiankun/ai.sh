execute = async function(args, context) {
  const url = context.env.SUPABASE_URL + '/rest/v1/site_about?select=content&limit=1'
  const key = context.env.SUPABASE_ANON_KEY
  const res = await fetch(url, {
    headers: { apikey: key, Authorization: 'Bearer ' + key }
  })
  const data = await res.json()
  if (!data || !data.length) return 'No profile available.'
  return data[0].content
}

execute = async function(args, context) {
  const url = context.env.SUPABASE_URL + '/rest/v1/site_contact?select=content,image&limit=1'
  const key = context.env.SUPABASE_ANON_KEY
  const res = await fetch(url, {
    headers: { apikey: key, Authorization: 'Bearer ' + key }
  })
  const data = await res.json()
  if (!data || !data.length) return 'No contact info available.'
  return data[0].content
}

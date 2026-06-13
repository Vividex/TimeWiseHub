import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

Deno.serve(async () => {
  const today = new Date()
  const in30 = new Date(today); in30.setDate(today.getDate() + 30)

  const { data: expiring, error } = await supabase
    .from('certifications').select('user_id, org_id, name, expiry_date')
    .gte('expiry_date', today.toISOString().split('T')[0])
    .lte('expiry_date', in30.toISOString().split('T')[0])

  if (error) { console.error(error.message); return new Response('error', { status: 500 }) }

  for (const cert of expiring ?? []) {
    const { data: managers } = await supabase
      .from('organisation_members').select('user_id').eq('org_id', cert.org_id).in('role', ['owner','admin','manager'])

    for (const mgr of managers ?? []) {
      const { data: subs } = await supabase
        .from('push_subscriptions').select('endpoint, p256dh, auth').eq('user_id', mgr.user_id)

      for (const sub of subs ?? []) {
        try {
          await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-push`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
            body: JSON.stringify({
              subscription: { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
              title: 'Certification expiring soon',
              body: `${cert.name} expires on ${cert.expiry_date}`,
            }),
          })
        } catch (e) { console.error(`Push failed for ${mgr.user_id}:`, e) }
      }
    }
  }

  return new Response(`Processed ${expiring?.length ?? 0} certs`, { status: 200 })
})

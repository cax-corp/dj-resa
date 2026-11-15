const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization,apikey,content-type,x-client-info',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Cache-Control': 'no-store',
};
const reply = (status: number, data: unknown) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return reply(405, { error: 'Méthode non autorisée' });
  const base = Deno.env.get('SUPABASE_URL')!,
    anon = Deno.env.get('SUPABASE_ANON_KEY')!,
    secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  try {
    const auth = req.headers.get('authorization') || '';
    const headers = { apikey: anon, Authorization: auth };
    const userResponse = await fetch(base + '/auth/v1/user', { headers });
    if (!userResponse.ok) return reply(401, { error: 'Connexion requise' });
    const user = await userResponse.json();
    const profileResponse = await fetch(
      base + '/rest/v1/profiles?id=eq.' + encodeURIComponent(user.id) + '&select=role',
      { headers }
    );
    const profiles = profileResponse.ok ? await profileResponse.json() : [];
    if (profiles[0]?.role !== 'admin') return reply(403, { error: 'Accès administrateur requis' });
    const raw = await req.text();
    if (raw.length > 4000) return reply(400, { error: 'Formulaire invalide' });
    const body = JSON.parse(raw);
    const email = String(body.email || '')
        .trim()
        .toLowerCase(),
      name = String(body.full_name || '').trim(),
      password = String(body.password || '');
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      email.length > 254 ||
      !name ||
      name.length > 150 ||
      password.length < 12 ||
      password.length > 200
    )
      return reply(400, {
        error: 'Indiquez un nom, un email valide et un mot de passe de 12 caractères minimum.',
      });
    const service = {
      apikey: secret,
      Authorization: 'Bearer ' + secret,
      'Content-Type': 'application/json',
    };
    const created = await fetch(base + '/auth/v1/admin/users', {
      method: 'POST',
      headers: service,
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: name },
      }),
    });
    if (!created.ok)
      return reply(400, {
        error: 'Impossible de créer ce compte. Vérifiez notamment si cet email est déjà utilisé.',
      });
    const account = await created.json();
    const accountId = account.id;
    const patched = await fetch(base + '/rest/v1/profiles?id=eq.' + encodeURIComponent(accountId), {
      method: 'PATCH',
      headers: { ...service, Prefer: 'return=representation' },
      body: JSON.stringify({ role: 'dj', full_name: name }),
    });
    const saved = patched.ok ? await patched.json() : [];
    if (!saved.length) {
      await fetch(base + '/auth/v1/admin/users/' + encodeURIComponent(accountId), {
        method: 'DELETE',
        headers: service,
      });
      return reply(500, { error: 'Le compte équipe n’a pas pu être finalisé.' });
    }
    return reply(200, { id: accountId, full_name: name, email });
  } catch {
    return reply(500, { error: 'Création du compte impossible pour le moment.' });
  }
});

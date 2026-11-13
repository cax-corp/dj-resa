// JWT verification is performed here for private reads; public reads require a
// live, document-scoped bearer token. No URL/key supplied by a caller is fetched.
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
};
const json = (status: number, data: unknown) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
const mimeTypes = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/plain',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Méthode non autorisée' });
  try {
    const raw = await req.text();
    if (raw.length > 2048) return json(400, { error: 'Requête invalide' });
    let input: { share_token?: string; document_id?: string; metadata?: boolean };
    try {
      input = JSON.parse(raw);
    } catch {
      return json(400, { error: 'Requête invalide' });
    }
    if (!input || typeof input !== 'object') return json(400, { error: 'Requête invalide' });
    const base = Deno.env.get('SUPABASE_URL')!;
    const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    if (!base || !secret || !anon)
      return json(503, { error: 'Lecture momentanément indisponible' });
    const serviceHeaders = { apikey: secret, Authorization: 'Bearer ' + secret };
    let documentId: string;
    let metadataHeaders: Record<string, string>;
    const publicRead = !!input.share_token;
    if (publicRead) {
      if (typeof input.share_token !== 'string' || !uuid.test(input.share_token))
        return json(404, { error: 'Document ou lien indisponible' });
      const response = await fetch(
        base +
          '/rest/v1/document_read_links?token=eq.' +
          input.share_token +
          '&active=eq.true&select=document_id,expires_at&limit=1',
        { headers: serviceHeaders }
      );
      if (!response.ok) return json(503, { error: 'Lecture momentanément indisponible' });
      const links = await response.json();
      const link = links[0];
      if (!link || (link.expires_at && new Date(link.expires_at).getTime() <= Date.now()))
        return json(404, { error: 'Ce lien est invalide, expiré ou révoqué' });
      documentId = link.document_id;
      metadataHeaders = serviceHeaders;
    } else {
      if (typeof input.document_id !== 'string' || !uuid.test(input.document_id))
        return json(404, { error: 'Document indisponible' });
      const authorization = req.headers.get('Authorization') || '';
      if (!/^Bearer \S+$/i.test(authorization))
        return json(401, { error: 'Connectez-vous pour consulter ce document' });
      const verified = await fetch(base + '/auth/v1/user', {
        headers: { apikey: anon, Authorization: authorization },
      });
      if (!verified.ok) return json(401, { error: 'Connectez-vous pour consulter ce document' });
      const user = await verified.json();
      if (!user.id) return json(401, { error: 'Connexion requise' });
      documentId = input.document_id;
      // The caller's JWT, never the service role, authorizes private metadata.
      metadataHeaders = { apikey: anon, Authorization: authorization };
    }
    const response = await fetch(
      base +
        '/rest/v1/project_documents?id=eq.' +
        documentId +
        '&select=id,project_id,name,mime_type,size_bytes,storage_path&limit=1',
      { headers: metadataHeaders }
    );
    if (!response.ok)
      return json(response.status === 401 ? 401 : 404, {
        error: 'Document indisponible ou accès refusé',
      });
    const documents = await response.json();
    const document = documents[0];
    if (!document) return json(404, { error: 'Document indisponible ou accès refusé' });
    const parts = String(document.storage_path).split('/');
    if (
      parts.length < 2 ||
      parts[0] !== document.project_id ||
      parts.some((x: string) => !x || x === '.' || x === '..')
    )
      return json(404, { error: 'Document indisponible' });
    const type = mimeTypes.has(document.mime_type)
      ? document.mime_type
      : 'application/octet-stream';
    if (input.metadata === true)
      return json(200, {
        name: document.name,
        mime_type: type,
        size_bytes: document.size_bytes,
        ...(!publicRead ? { project_id: document.project_id } : {}),
      });
    const file = await fetch(
      base +
        '/storage/v1/object/authenticated/project-documents/' +
        parts.map(encodeURIComponent).join('/'),
      { headers: serviceHeaders }
    );
    if (!file.ok) return json(404, { error: 'Le fichier n’est plus disponible' });
    return new Response(file.body, {
      status: 200,
      headers: {
        ...cors,
        'Content-Type': type,
        'Content-Disposition': "inline; filename*=UTF-8''" + encodeURIComponent(document.name),
      },
    });
  } catch {
    return json(500, { error: 'Impossible de lire le document pour le moment' });
  }
});

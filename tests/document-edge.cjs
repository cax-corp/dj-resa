const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const id = '20000000-0000-4000-8000-000000000001',
  pid = '30000000-0000-4000-8000-000000000001',
  token = '10000000-0000-4000-8000-000000000001';
let active = true,
  expired = false,
  exists = true,
  visible = true,
  path = pid + '/file.pdf',
  handler,
  reads = 0;
global.Deno = {
  env: {
    get: (key) =>
      ({
        SUPABASE_URL: 'https://backend.example.test',
        SUPABASE_SERVICE_ROLE_KEY: 'server-only',
        SUPABASE_ANON_KEY: 'public-key',
      })[key],
  },
  serve: (fn) => (handler = fn),
};
global.fetch = async (url, options = {}) => {
  const target = new URL(url);
  const auth = options.headers?.Authorization;
  if (target.pathname === '/auth/v1/user')
    return auth === 'Bearer valid-user'
      ? Response.json({ id: 'owner' })
      : Response.json({ error: 'invalid' }, { status: 401 });
  if (target.pathname === '/rest/v1/document_read_links')
    return Response.json(
      target.searchParams.get('token') === 'eq.' + token && active
        ? [{ document_id: id, expires_at: expired ? '2000-01-01T00:00:00Z' : null }]
        : []
    );
  if (target.pathname === '/rest/v1/project_documents')
    return Response.json(
      exists && (auth === 'Bearer server-only' || visible)
        ? [
            {
              id,
              project_id: pid,
              name: 'Plan.pdf',
              mime_type: 'application/pdf',
              size_bytes: 12,
              storage_path: path,
            },
          ]
        : []
    );
  if (target.pathname.startsWith('/storage/v1/object/authenticated/')) {
    assert.equal(auth, 'Bearer server-only');
    reads++;
    return new Response('%PDF-1.4 demo', { headers: { 'Content-Type': 'application/pdf' } });
  }
  throw new Error('Unexpected request ' + url);
};
(async () => {
  await import(pathToFileURL(__dirname + '/../supabase/functions/read-document/index.ts'));
  const request = (body, authorization) =>
    handler(
      new Request('https://reader.example.test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authorization ? { Authorization: authorization } : {}),
        },
        body: JSON.stringify(body),
      })
    );
  assert.equal((await request({ document_id: id })).status, 401);
  assert.equal((await request({ document_id: id }, 'Bearer invalid')).status, 401);
  let response = await request({ document_id: id, metadata: true }, 'Bearer valid-user');
  assert.equal(response.status, 200);
  let meta = await response.json();
  assert.equal(meta.project_id, pid);
  assert.equal(meta.storage_path, undefined);
  visible = false;
  assert.equal((await request({ document_id: id }, 'Bearer valid-user')).status, 404);
  visible = true;
  response = await request({ share_token: token, metadata: true });
  meta = await response.json();
  assert.equal(meta.name, 'Plan.pdf');
  assert.equal(meta.project_id, undefined);
  assert.equal(meta.storage_path, undefined);
  assert.equal(meta.signedUrl, undefined);
  response = await request({ share_token: token });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Type'), 'application/pdf');
  assert.ok(response.headers.get('Content-Disposition').startsWith('inline'));
  assert.ok(response.headers.get('Cache-Control').includes('no-store'));
  assert.equal(await response.text(), '%PDF-1.4 demo');
  const count = reads;
  active = false;
  assert.equal((await request({ share_token: token })).status, 404);
  assert.equal(reads, count);
  active = true;
  expired = true;
  assert.equal((await request({ share_token: token })).status, 404);
  expired = false;
  path = pid + '/../other.pdf';
  assert.equal((await request({ share_token: token })).status, 404);
  path = pid + '/file.pdf';
  exists = false;
  assert.equal((await request({ share_token: token })).status, 404);
  assert.equal(
    (await handler(new Request('https://reader.example.test', { method: 'OPTIONS' }))).status,
    204
  );
  console.log(
    'PASS: reader authenticates private users, enforces file visibility and share tokens, hides storage paths, serves inline bytes, blocks expired/revoked/missing files and traversal'
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

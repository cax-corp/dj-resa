const assert = require('node:assert/strict'),
  { pathToFileURL } = require('node:url');
let handler,
  role = 'admin',
  creates = 0,
  cleanup = 0,
  patchFails = false;
global.Deno = {
  env: {
    get: (key) =>
      ({
        SUPABASE_URL: 'https://backend.test',
        SUPABASE_ANON_KEY: 'anon-test',
        SUPABASE_SERVICE_ROLE_KEY: 'server-test',
      })[key],
  },
  serve: (fn) => (handler = fn),
};
global.fetch = async (url, options = {}) => {
  const path = String(url);
  if (path.endsWith('/auth/v1/user'))
    return options.headers.Authorization === 'Bearer owner-token'
      ? Response.json({ id: 'owner' })
      : Response.json({}, { status: 401 });
  if (path.includes('/rest/v1/profiles?') && options.method !== 'PATCH')
    return Response.json([{ role }]);
  if (path.endsWith('/auth/v1/admin/users')) {
    creates++;
    assert.equal(options.headers.Authorization, 'Bearer server-test');
    const payload = JSON.parse(options.body);
    assert.equal(payload.email_confirm, true);
    assert.deepEqual(Object.keys(payload.user_metadata), ['full_name']);
    return Response.json({ id: 'new-team-user' });
  }
  if (options.method === 'PATCH') {
    assert.equal(JSON.parse(options.body).role, 'dj');
    return Response.json(patchFails ? [] : [{ id: 'new-team-user' }]);
  }
  if (options.method === 'DELETE') {
    cleanup++;
    return Response.json({});
  }
  throw new Error('Unexpected request');
};
(async () => {
  await import(pathToFileURL(__dirname + '/../supabase/functions/create-team-user/index.ts').href);
  const call = (token, body) =>
    handler(
      new Request('https://function.test', {
        method: 'POST',
        headers: { Authorization: token, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    );
  const good = {
    full_name: 'Team Person',
    email: 'team@example.test',
    password: 'temporary-test-password',
    role: 'admin',
  };
  assert.equal((await call('', good)).status, 401);
  role = 'client';
  assert.equal((await call('Bearer owner-token', good)).status, 403);
  assert.equal(creates, 0);
  role = 'admin';
  assert.equal((await call('Bearer owner-token', { ...good, password: 'short' })).status, 400);
  const result = await call('Bearer owner-token', good);
  assert.equal(result.status, 200);
  const data = await result.json();
  assert.equal(data.id, 'new-team-user');
  assert.ok(!('password' in data));
  assert.ok(!JSON.stringify(data).includes('server-test'));
  patchFails = true;
  assert.equal((await call('Bearer owner-token', good)).status, 500);
  assert.equal(cleanup, 1);
  console.log(
    'PASS: team account creation verifies admin, validates password, forces DJ role, never exposes credentials and cleans up incomplete accounts'
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

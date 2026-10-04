import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.ts';
import { routeAccount } from '../src/account.ts';
import { routeNativeAccount } from '../src/native-account.ts';
import { ORIGIN, REDIRECT, REDIRECT_ID, time, baseEnv, request, fixture, withFixture, auth, challenge, digest } from './helpers/native-account-fixture.mjs';

test('disabled by default; browser authority, insecure native transport and CORS fail closed', async () => {
  const disabled = { ...baseEnv, AUTH_NATIVE_ENABLED: undefined, DB: { prepare() { throw new Error('must_not_access_db'); } } };
  assert.deepEqual(await (await routeNativeAccount(request('config'), disabled)).json(), { enabled: false, redirectId: REDIRECT_ID, redirectUri: REDIRECT });
  assert.equal((await routeNativeAccount(request('start', {}), disabled)).status, 503);
  for (const headers of [{ cookie: '' }, { cookie: '__Host-reysonai=anything' }, { origin: baseEnv.ALLOWED_ORIGIN }, { origin: 'null' }]) assert.equal((await routeNativeAccount(request('start', {}, headers), disabled)).status, 403);
  const res = await worker.fetch(request('session', undefined, { origin: baseEnv.ALLOWED_ORIGIN }), disabled);
  assert.equal(res.headers.get('access-control-allow-origin'), null); assert.equal(res.headers.get('access-control-allow-credentials'), null);
  const preflight = await worker.fetch(new Request(`${ORIGIN}/v1/account/native/data`, { method: 'OPTIONS', headers: { origin: baseEnv.ALLOWED_ORIGIN } }), disabled);
  assert.equal(preflight.headers.get('access-control-allow-origin'), null);
  const insecure = new Request('http://api.reysonai.com/v1/account/native/session');
  assert.equal((await routeNativeAccount(insecure, { ...baseEnv, DB: {} })).status, 503);
});

test('strict start/body/redirect/method validation and per-route rate limits', withFixture(async f => {
  const good = { codeChallenge: await challenge('a'.repeat(43)), state: 's'.repeat(43), redirectId: REDIRECT_ID };
  for (const patch of [{ codeChallenge: 'x'.repeat(42) }, { state: 'x' }, { redirectId: REDIRECT }, { redirectUri: 'https://evil.invalid' }, { codeChallengeMethod: 'plain' }, { state: [] }]) assert.equal((await f.call('start', { ...good, ...patch })).status, 400);
  assert.equal((await f.call('start')).status, 404);
  assert.equal((await f.call('start?redirectUri=https://evil.invalid', good)).status, 400);
  assert.equal((await routeNativeAccount(new Request(`${ORIGIN}/v1/account/native/start`, { method: 'POST', body: '{}' }), f.env)).status, 415);
  assert.equal((await f.call('start', { ...good, padding: 'x'.repeat(4100) })).status, 413);
  for (const malformed of ['{', '[]', 'null']) assert.equal((await routeNativeAccount(new Request(`${ORIGIN}/v1/account/native/start`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: malformed }), f.env)).status, 400);
  for (let i = 0; i < 32; i++) await f.call('start', good);
  const limited = await f.call('start', good); assert.equal(limited.status, 429); assert.ok(limited.headers.get('retry-after'));
  const rawIPs = f.sqlite.prepare('SELECT bucket FROM account_rate_limits').all().map(row => row.bucket); assert.equal(rawIPs.some(value => value.includes('local')), false);
}));

test('independent browser state and PKCE; callback replay and injection never mint credentials', withFixture(async f => {
  const attempt = await f.authorize(await f.start());
  assert.equal((await routeNativeAccount(new Request(attempt.url), f.env)).status, 400);
  assert.equal((await f.finish(attempt, undefined, '')).status, 400); assert.equal(f.exchanges, 0);
  const success = await f.finish(attempt); assert.equal(success.status, 303); assert.equal(f.exchanges, 1);
  assert.equal(await challenge(f.exchangeBody.get('code_verifier')), attempt.google.searchParams.get('code_challenge'));
  assert.notEqual(f.exchangeBody.get('code_verifier'), attempt.verifier);
  assert.equal((await f.finish(attempt)).status, 400); assert.equal(f.exchanges, 1);
  const code = new URL(success.headers.get('location')).searchParams.get('code');
  const at = { ...attempt, code };
  for (const patch of [{ codeVerifier: 'b'.repeat(43) }, { state: 'b'.repeat(43) }, { redirectId: 'unregistered' }, { code: 'c'.repeat(64) }]) assert.equal((await f.exchange(at, patch)).status, 400);
  const exchanged = await f.exchange(at); assert.equal(exchanged.status, 200);
  const session = await exchanged.json(); assert.match(session.token, /^rn1_[a-f0-9]{64}$/); assert.equal(session.expiresAt, time + 604800);
  assert.equal((await f.exchange(at)).status, 400);
  assert.equal(f.sqlite.prepare('SELECT token_hash FROM account_native_sessions').get().token_hash, await digest(session.token));
  assert.notEqual(f.sqlite.prepare('SELECT code_hash FROM account_native_attempts').get().code_hash, code);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM account_sessions').get().n, 0);
}));

test('exact expiry boundaries for pending attempts, Google state, app codes and native sessions', withFixture(async f => {
  const pending = await f.start(); f.setTime(time + 600); assert.equal((await routeNativeAccount(new Request(pending.url), f.env)).status, 400);
  f.setTime(time); const started = await f.authorize(await f.start()); f.setTime(time + 600); assert.equal((await f.finish(started)).status, 400);
  f.setTime(time); const issued = await f.issue(); f.setTime(time + 60); assert.equal((await f.exchange(issued)).status, 400);
  f.setTime(time); const session = await (await f.exchange(await f.issue())).json(); f.setTime(time + 604800); assert.equal((await f.call('session', undefined, auth(session.token))).status, 401);
}));

test('concurrent exchanges produce one session; failed session insert rolls back code claim', withFixture(async f => {
  const issued = await f.issue();
  f.failInsert(true); await assert.rejects(f.exchange(issued), /injected_session_failure/); f.failInsert(false);
  assert.equal(f.sqlite.prepare('SELECT status FROM account_native_attempts').get().status, 'code');
  const results = await Promise.all([f.exchange(issued), f.exchange(issued), f.exchange(issued)]);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 400, 400]);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM account_native_sessions').get().n, 1);
}));

test('cancel before browser, during consent, after code and after exchange prevents late sessions', withFixture(async f => {
  const pending = await f.start(); assert.equal((await f.cancel(pending)).status, 200); assert.equal((await routeNativeAccount(new Request(pending.url), f.env)).status, 400);
  const consenting = await f.authorize(await f.start()); await f.cancel(consenting); assert.equal((await f.finish(consenting)).status, 400);
  const issued = await f.issue(); await f.cancel(issued); assert.equal((await f.exchange(issued)).status, 400);
  const late = await f.issue(); const session = await (await f.exchange(late)).json();
  await f.cancel(late, { codeVerifier: 'z'.repeat(43) }); assert.equal((await f.call('session', undefined, auth(session.token))).status, 200);
  await f.cancel(late); assert.equal((await f.call('session', undefined, auth(session.token))).status, 401);
  const racing = await f.issue(); const [exchanged] = await Promise.all([f.exchange(racing), f.cancel(racing)]);
  if (exchanged.status === 200) assert.equal((await f.call('session', undefined, auth((await exchanged.json()).token))).status, 401);
}));

test('denied/invalid provider identity returns only trusted state and never a session', withFixture(async f => {
  const denied = await f.authorize(await f.start()); const response = await f.finish(denied, '&error=access_denied');
  assert.equal(response.headers.get('location'), `${REDIRECT}?error=google&state=${denied.state}`); assert.equal(f.exchanges, 0);
  for (const patch of [{ aud: 'another-client' }, { azp: 'wrong-client' }, { iss: 'https://evil.invalid' }, { nonce: 'invalid' }, { email_verified: false }, { exp: time }, { iat: time - 601 }]) {
    const at = await f.authorize(await f.start()); f.setClaims(patch);
    const failed = await f.finish(at); assert.equal(new URL(failed.headers.get('location')).searchParams.get('error'), 'google');
  }
  f.failGoogle(); const at = await f.authorize(await f.start()); assert.equal(new URL((await f.finish(at)).headers.get('location')).searchParams.get('error'), 'google');
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM account_native_sessions').get().n, 0);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM account_native_attempts WHERE status='code'").get().n, 0);
}));

test('native ownership, account switching, shared Web snapshots, conflict/consent, revocation and transport isolation', withFixture(async f => {
  const a = await (await f.exchange(await f.issue('subject-A', 'same@example.invalid'))).json();
  assert.equal((await f.call('data', { data: { 'reysonai:locale:v1': 'ja' }, version: 0, importLocal: true }, auth(a.token))).status, 400);
  assert.equal((await f.call('data', { data: { 'reysonai:locale:v1': 'ja' }, version: 0, importLocal: true, consent: true }, auth(a.token))).status, 200);
  assert.equal((await f.call('data', { data: {}, version: 0 }, auth(a.token))).status, 409);
  assert.equal((await f.call('data', { data: { 'reysonai.trainer.rank.v1': {} }, version: 1 }, auth(a.token))).status, 400);
  assert.equal((await f.call('data', { data: { 'reysonai:profile:v1': 'x'.repeat(500000) }, version: 1 }, auth(a.token))).status, 413);
  const b = await (await f.exchange(await f.issue('subject-B', 'same@example.invalid'))).json(); assert.notEqual(a.user.id, b.user.id);
  assert.deepEqual(await (await f.call('data', undefined, auth(b.token))).json(), { data: {}, version: 0 });
  const againA = await (await f.exchange(await f.issue('subject-A', 'changed@example.invalid'))).json(); assert.equal(a.user.id, againA.user.id); assert.equal(againA.user.email, 'changed@example.invalid');
  assert.deepEqual(await (await f.call('data', undefined, auth(againA.token))).json(), { data: { 'reysonai:locale:v1': 'ja' }, version: 1 });
  const webToken = 'd'.repeat(64);
  f.sqlite.prepare('INSERT INTO account_sessions(token_hash,user_id,expires_at) VALUES (?,?,?)').run(await digest(webToken), a.user.id, time + 604800);
  const web = path => routeAccount(new Request(`${ORIGIN}/v1/account/${path}`, { headers: { cookie: `__Host-reysonai=${webToken}` } }), f.env);
  assert.deepEqual(await (await web('data')).json(), { data: { 'reysonai:locale:v1': 'ja' }, version: 1 });
  assert.equal((await f.call('session', undefined, auth(webToken))).status, 401);
  assert.equal((await f.call('session', undefined, { cookie: `__Host-reysonai=${webToken}` })).status, 403);
  assert.deepEqual(await (await routeAccount(new Request(`${ORIGIN}/v1/account/session`, { headers: auth(a.token) }), f.env)).json(), { user: null });
  assert.equal((await f.call('logout', {}, auth(a.token))).status, 200); assert.equal((await f.call('session', undefined, auth(a.token))).status, 401);
  assert.equal((await f.call('session', undefined, auth(b.token))).status, 200); assert.equal((await web('session')).status, 200);
  f.setTime(time + 601); assert.equal((await f.call('session', undefined, auth(b.token))).status, 200); // Cleanup attempts must not delete seven-day sessions.
}));

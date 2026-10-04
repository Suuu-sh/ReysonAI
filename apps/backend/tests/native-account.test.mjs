import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker from '../src/index.ts';
import { digest, routeAccount } from '../src/account.ts';
import { routeNativeAccount } from '../src/native-account.ts';

const ORIGIN = 'https://api.reysonai.com';
const REDIRECT = 'reysonai://auth/callback';
const REDIRECT_ID = 'reysonai-mobile';
const time = 1_791_103_000;
const b64 = value => Buffer.from(value).toString('base64url');
const challenge = async value => b64(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
const baseEnv = { AUTH_ENABLED: 'true', AUTH_NATIVE_ENABLED: 'true', GOOGLE_CLIENT_ID: 'test-client', GOOGLE_CLIENT_SECRET: 'ephemeral-test-only', GOOGLE_REDIRECT_URI: `${ORIGIN}/v1/account/google/callback`, AUTH_APP_URL: 'https://app.reysonai.com', AUTH_RATE_LIMIT_KEY: 'ephemeral-test-only', ALLOWED_ORIGIN: 'https://app.reysonai.com' };
const request = (path, body, headers = {}) => new Request(`${ORIGIN}/v1/account/native/${path}`, { headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers }, ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }) });
const fixture = async () => {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  for (const path of ['0007_accounts.sql', '0008_native_accounts.sql']) sqlite.exec(readFileSync(new URL(`../migrations/${path}`, import.meta.url), 'utf8'));
  let failInsert = false;
  const db = {
    prepare(sql) {
      let args = [];
      return { bind(...values) { args = values; return this; }, async all() { if (failInsert && sql.startsWith('INSERT INTO account_native_sessions')) throw new Error('injected_session_failure'); return { results: sqlite.prepare(sql).all(...args) }; }, async run() { return sqlite.prepare(sql).run(...args); } };
    },
    async batch(statements) {
      // Serialize concurrent simulated requests exactly as D1 batch transactions do.
      const previous = this.tail || Promise.resolve();
      let unlock;
      this.tail = new Promise(resolve => { unlock = resolve; });
      await previous;
      sqlite.exec('BEGIN');
      try { const results = []; for (const statement of statements) results.push(await statement.all()); sqlite.exec('COMMIT'); return results; }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
      finally { unlock(); }
    },
  };
  const env = { ...baseEnv, DB: db };
  const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const jwk = { ...await crypto.subtle.exportKey('jwk', pair.publicKey), kid: crypto.randomUUID(), alg: 'RS256', use: 'sig' };
  const sign = async claims => { const payload = `${b64(JSON.stringify({ alg: 'RS256', kid: jwk.kid }))}.${b64(JSON.stringify(claims))}`; return `${payload}.${b64(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(payload)))}`; };
  const oldFetch = globalThis.fetch, oldNow = Date.now;
  let currentTime = time, currentClaims, exchangeBody, googleFailure = false, exchanges = 0;
  Date.now = () => currentTime * 1000;
  globalThis.fetch = async (url, options) => {
    if (url === 'https://www.googleapis.com/oauth2/v3/certs') return Response.json({ keys: [jwk] });
    assert.equal(url, 'https://oauth2.googleapis.com/token');
    exchanges++; exchangeBody = new URLSearchParams(options.body);
    return googleFailure ? new Response('{}', { status: 400 }) : Response.json({ id_token: await sign(currentClaims) });
  };
  const call = (path, body, headers) => routeNativeAccount(request(path, body, headers), env);
  const start = async () => {
    const verifier = b64(crypto.getRandomValues(new Uint8Array(32))), state = b64(crypto.getRandomValues(new Uint8Array(32)));
    const response = await call('start', { codeChallenge: await challenge(verifier), state, redirectId: REDIRECT_ID });
    assert.equal(response.status, 200); assert.equal(response.headers.get('set-cookie'), null);
    const started = await response.json();
    assert.equal(started.expiresAt, currentTime + 600); assert.match(started.attemptId, /^[a-f0-9]{64}$/);
    return { ...started, verifier, state };
  };
  const authorize = async (attempt, sub = 'google-sub-A', email = 'test@example.invalid') => {
    const response = await routeNativeAccount(new Request(attempt.url), env);
    assert.equal(response.status, 303);
    const google = new URL(response.headers.get('location'));
    currentClaims = { iss: 'https://accounts.google.com', aud: env.GOOGLE_CLIENT_ID, exp: currentTime + 3600, iat: currentTime, sub, email, email_verified: true, nonce: google.searchParams.get('nonce') };
    assert.equal(google.origin, 'https://accounts.google.com'); assert.equal(google.searchParams.get('scope'), 'openid email'); assert.equal(google.searchParams.get('redirect_uri'), env.GOOGLE_REDIRECT_URI); assert.equal(google.searchParams.get('code_challenge_method'), 'S256');
    assert.match(google.searchParams.get('state'), /^n_[a-f0-9]{64}$/); assert.notEqual(google.searchParams.get('state'), attempt.state);
    return { ...attempt, google, cookie: response.headers.getSetCookie()[0].split(';')[0] };
  };
  const finish = (attempt, suffix = '&code=ephemeral-provider-code', cookie = attempt.cookie) => worker.fetch(new Request(`${env.GOOGLE_REDIRECT_URI}?state=${attempt.google.searchParams.get('state')}${suffix}`, { headers: { cookie } }), env);
  const issue = async (sub, email) => {
    const attempt = await authorize(await start(), sub, email);
    const response = await finish(attempt);
    assert.equal(response.status, 303);
    const callback = new URL(response.headers.get('location'));
    assert.equal(callback.origin, 'null'); assert.equal(`${callback.protocol}//${callback.host}${callback.pathname}`, REDIRECT);
    assert.deepEqual([...callback.searchParams.keys()].sort(), ['code', 'state']); assert.equal(callback.searchParams.get('state'), attempt.state);
    assert.equal(response.headers.get('cache-control'), 'no-store'); assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(response.headers.getSetCookie().length, 1); assert.ok(response.headers.getSetCookie()[0].startsWith('__Host-reysonai-native-oauth='));
    return { ...attempt, code: callback.searchParams.get('code') };
  };
  const exchange = (attempt, patch = {}) => call('exchange', { code: attempt.code, codeVerifier: attempt.verifier, state: attempt.state, redirectId: REDIRECT_ID, ...patch });
  const cancel = (attempt, patch = {}) => call('cancel', { attemptId: attempt.attemptId, codeVerifier: attempt.verifier, state: attempt.state, redirectId: REDIRECT_ID, ...patch });
  return { env, sqlite, call, start, authorize, finish, issue, exchange, cancel, get exchanges() { return exchanges; }, get exchangeBody() { return exchangeBody; }, setClaims(patch) { currentClaims = { ...currentClaims, ...patch }; }, setTime(value) { currentTime = value; }, failGoogle() { googleFailure = true; }, failInsert(value) { failInsert = value; }, close() { globalThis.fetch = oldFetch; Date.now = oldNow; sqlite.close(); } };
};
const withFixture = fn => async () => { const f = await fixture(); try { await fn(f); } finally { f.close(); } };
const auth = token => ({ authorization: `Bearer ${token}` });

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

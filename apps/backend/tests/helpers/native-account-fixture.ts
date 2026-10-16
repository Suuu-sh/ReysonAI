import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker from '../../src/index.ts';
import { digest, routeAccount } from '../../src/account.ts';
import { routeNativeAccount } from '../../src/native-account.ts';

const ORIGIN = 'https://api.reysonai.com';
const REDIRECT = 'reysonai://auth/callback';
const REDIRECT_ID = 'reysonai-mobile';
const time = 1_791_103_000;
const b64 = (value?: any): any => Buffer.from(value).toString('base64url');
const challenge = async (value?: any): Promise<any> => b64(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
const baseEnv = { AUTH_ENABLED: 'true', AUTH_NATIVE_ENABLED: 'true', GOOGLE_CLIENT_ID: 'test-client', GOOGLE_CLIENT_SECRET: 'ephemeral-test-only', GOOGLE_REDIRECT_URI: `${ORIGIN}/v1/account/google/callback`, AUTH_APP_URL: 'https://app.reysonai.com', AUTH_RATE_LIMIT_KEY: 'ephemeral-test-only', ALLOWED_ORIGIN: 'https://app.reysonai.com' };
const request = (path?: any, body?: any, headers: any = {}): any => new Request(`${ORIGIN}/v1/account/native/${path}`, { headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers }, ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }) });
const fixture: any = async (): Promise<any> => {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  for (const path of ['0007_accounts.sql', '0008_native_accounts.sql']) sqlite.exec(readFileSync(new URL(`../../migrations/${path}`, import.meta.url), 'utf8'));
  let failInsert = false;
  const db: any = {
    prepare(sql?: any): any {
      let args: any[] = [];
      return { bind(...values: any[]): any { args = values; return this; }, async all(): Promise<any> { if (failInsert && sql.startsWith('INSERT INTO account_native_sessions')) throw new Error('injected_session_failure'); return { results: sqlite.prepare(sql).all(...args) }; }, async run(): Promise<any> { return sqlite.prepare(sql).run(...args); } };
    },
    async batch(statements?: any): Promise<any> {
      // Serialize concurrent simulated requests exactly as D1 batch transactions do.
      const previous = this.tail || Promise.resolve();
      let unlock: any;
      this.tail = new Promise((resolve?: any): any => { unlock = resolve; });
      await previous;
      sqlite.exec('BEGIN');
      try { const results: any[] = []; for (const statement of statements) results.push(await statement.all()); sqlite.exec('COMMIT'); return results; }
      catch (error: any) { sqlite.exec('ROLLBACK'); throw error; }
      finally { unlock(); }
    },
  };
  const env: any = { ...baseEnv, DB: db };
  const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const jwk = { ...await crypto.subtle.exportKey('jwk', pair.publicKey), kid: crypto.randomUUID(), alg: 'RS256', use: 'sig' };
  const sign = async (claims?: any): Promise<any> => { const payload = `${b64(JSON.stringify({ alg: 'RS256', kid: jwk.kid }))}.${b64(JSON.stringify(claims))}`; return `${payload}.${b64(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(payload)))}`; };
  const oldFetch = globalThis.fetch, oldNow = Date.now;
  let currentTime = time, currentClaims: any, exchangeBody: any, googleFailure = false, exchanges = 0;
  Date.now = (): any => currentTime * 1000;
  globalThis.fetch = async (url?: any, options?: any): Promise<any> => {
    if (url === 'https://www.googleapis.com/oauth2/v3/certs') return Response.json({ keys: [jwk] });
    assert.equal(url, 'https://oauth2.googleapis.com/token');
    exchanges++; exchangeBody = new URLSearchParams(options.body);
    return googleFailure ? new Response('{}', { status: 400 }) : Response.json({ id_token: await sign(currentClaims) });
  };
  const call: any = (path?: any, body?: any, headers?: any): any => routeNativeAccount(request(path, body, headers), env);
  const start = async (): Promise<any> => {
    const verifier = b64(crypto.getRandomValues(new Uint8Array(32))), state = b64(crypto.getRandomValues(new Uint8Array(32)));
    const response = await call('start', { codeChallenge: await challenge(verifier), state, redirectId: REDIRECT_ID });
    assert.equal(response.status, 200); assert.equal(response.headers.get('set-cookie'), null);
    const started = await response.json();
    assert.equal(started.expiresAt, currentTime + 600); assert.match(started.attemptId, /^[a-f0-9]{64}$/);
    return { ...started, verifier, state };
  };
  const authorize = async (attempt?: any, sub: any = 'google-sub-A', email: any = 'test@example.invalid'): Promise<any> => {
    const response: any = await routeNativeAccount(new Request(attempt.url), env);
    assert.equal(response.status, 303);
    const google: any = new URL(response.headers.get('location'));
    currentClaims = { iss: 'https://accounts.google.com', aud: env.GOOGLE_CLIENT_ID, exp: currentTime + 3600, iat: currentTime, sub, email, email_verified: true, nonce: google.searchParams.get('nonce') };
    assert.equal(google.origin, 'https://accounts.google.com'); assert.equal(google.searchParams.get('scope'), 'openid email'); assert.equal(google.searchParams.get('redirect_uri'), env.GOOGLE_REDIRECT_URI); assert.equal(google.searchParams.get('code_challenge_method'), 'S256');
    assert.match(google.searchParams.get('state'), /^n_[a-f0-9]{64}$/); assert.notEqual(google.searchParams.get('state'), attempt.state);
    return { ...attempt, google, cookie: response.headers.getSetCookie()[0].split(';')[0] };
  };
  const finish = (attempt?: any, suffix: any = '&code=ephemeral-provider-code', cookie: any = attempt.cookie): any => worker.fetch(new Request(`${env.GOOGLE_REDIRECT_URI}?state=${attempt.google.searchParams.get('state')}${suffix}`, { headers: { cookie } }), env);
  const issue = async (sub?: any, email?: any): Promise<any> => {
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
  const exchange = (attempt?: any, patch: any = {}): any => call('exchange', { code: attempt.code, codeVerifier: attempt.verifier, state: attempt.state, redirectId: REDIRECT_ID, ...patch });
  const cancel = (attempt?: any, patch: any = {}): any => call('cancel', { attemptId: attempt.attemptId, codeVerifier: attempt.verifier, state: attempt.state, redirectId: REDIRECT_ID, ...patch });
  return { env, sqlite, call, start, authorize, finish, issue, exchange, cancel, get exchanges(): any { return exchanges; }, get exchangeBody(): any { return exchangeBody; }, setClaims(patch?: any): any { currentClaims = { ...currentClaims, ...patch }; }, setTime(value?: any): any { currentTime = value; }, failGoogle(): any { googleFailure = true; }, failInsert(value?: any): any { failInsert = value; }, close(): any { globalThis.fetch = oldFetch; Date.now = oldNow; sqlite.close(); } };
};
const withFixture = (fn?: any): any => async (): Promise<any> => { const f = await fixture(); try { await fn(f); } finally { f.close(); } };
const auth = (token?: any): any => ({ authorization: `Bearer ${token}` });


export { ORIGIN, REDIRECT, REDIRECT_ID, time, baseEnv, request, fixture, withFixture, auth, challenge, digest };

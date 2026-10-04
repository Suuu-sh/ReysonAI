// Native transport is intentionally separate from browser-cookie authentication.
import { accountTransport, allowedData, digest, verifyGoogleToken, type AccountEnv } from './account.ts';

type Result<T> = { results: T[] };
type Statement = { bind(...values: unknown[]): Statement; all<T>(): Promise<Result<T>>; run(): Promise<unknown> };
type DB = { prepare(sql: string): Statement; batch<T>(statements: Statement[]): Promise<Result<T>[]> };
type NativeEnv = AccountEnv & { AUTH_NATIVE_ENABLED?: string };
type User = { id: string; email: string };
type Attempt = { attempt_hash: string; code_challenge: string; app_state: string; redirect_id: string; expires_at: number };
const REDIRECT_ID = 'reysonai-mobile';
const REDIRECT_URI = 'reysonai://auth/callback';
const STATE_COOKIE = '__Host-reysonai-native-oauth';
const ATTEMPT_SECONDS = 600;
const CODE_SECONDS = 60;
const SESSION_SECONDS = 604800;
const encoder = new TextEncoder();
const random = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
const sha256url = async (value: string) => btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const nowSeconds = () => Math.floor(Date.now() / 1000);
const isState = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{43,128}$/.test(value);
const isVerifier = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9._~-]{43,128}$/.test(value);
const isRandom = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const publicUser = (user: User) => ({ id: user.id, email: user.email, verified: true });
const reply = (body: unknown, status = 200, cookies: string[] = []) => {
  const headers = new Headers({ 'content-type': 'application/json', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'" });
  for (const value of cookies) headers.append('set-cookie', value);
  return new Response(JSON.stringify(body), { status, headers });
};
function redirect(location: string, cookies: string[] = []) {
  const response = reply(null, 303, cookies);
  response.headers.set('location', location);
  return response;
}
// Never echo a supplied URL, code, token, verifier, email or raw provider error.
function appRedirect(state: string, code?: string, cookies: string[] = []) {
  const url = new URL(REDIRECT_URI);
  url.search = new URLSearchParams(code ? { code, state } : { error: 'google', state }).toString();
  return redirect(url.toString(), cookies);
}
async function readBody(request: Request, max: number): Promise<Record<string, unknown> | Response> {
  if (!/^application\/json(?:;|$)/i.test(request.headers.get('content-type') || '')) return reply({ error: 'invalid_content_type' }, 415);
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader) while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > max) { await reader.cancel(); return reply({ error: 'payload_too_large' }, 413); }
    chunks.push(part.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    const body: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    return body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : reply({ error: 'invalid_json' }, 400);
  } catch { return reply({ error: 'invalid_json' }, 400); }
}
const exactKeys = (body: Record<string, unknown>, keys: string[]) => Object.keys(body).every(key => keys.includes(key));
export function isNativeAccountRequest(url: URL): boolean {
  return url.pathname.startsWith('/v1/account/native/') || url.pathname === '/v1/account/google/callback' && (url.searchParams.get('state') || '').startsWith('n_');
}
export async function routeNativeAccount(request: Request, env: NativeEnv): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname === '/v1/account/google/callback' ? 'callback' : url.pathname.slice('/v1/account/native/'.length);
  const browser = path === 'authorize' || path === 'callback';
  // Origin is not evidence of a native client. Ambient browser authority is refused.
  if (!browser && (request.headers.has('cookie') || request.headers.has('origin'))) return reply({ error: 'native_transport_required' }, 403);
  if (path === 'config' && request.method === 'GET') return reply({ enabled: env.AUTH_ENABLED === 'true' && env.AUTH_NATIVE_ENABLED === 'true', redirectId: REDIRECT_ID, redirectUri: REDIRECT_URI });
  if (env.AUTH_ENABLED !== 'true' || env.AUTH_NATIVE_ENABLED !== 'true') return reply({ error: 'native_accounts_not_enabled' }, 503);
  if (!env.DB || !env.AUTH_APP_URL || !env.AUTH_RATE_LIMIT_KEY || !env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REDIRECT_URI) return reply({ error: 'accounts_not_configured' }, 503);
  const origins = (env.ALLOWED_ORIGIN || '').split(',').map(value => value.trim()).filter(value => value && value !== '*');
  const transport = accountTransport(url, new URL('/analyze/ranges', env.AUTH_APP_URL), new URL(env.GOOGLE_REDIRECT_URI), origins, env.AUTH_LOCAL_DEV);
  // Native account credentials are HTTPS-only, including development builds.
  if (!transport || url.protocol !== 'https:' || env.AUTH_LOCAL_DEV === 'true') return reply({ error: 'accounts_not_configured' }, 503);
  if (!(request.method === 'GET' && ['authorize', 'callback', 'session', 'data'].includes(path) || request.method === 'POST' && ['start', 'exchange', 'cancel', 'logout', 'data'].includes(path))) return reply({ error: 'not_found' }, 404);
  // Native inputs never use query parameters, except the server-issued browser handoff.
  if (!browser && url.search) return reply({ error: 'invalid_request' }, 400);
  const db = env.DB as DB;
  const query = async <T>(sql: string, ...args: unknown[]) => (await db.prepare(sql).bind(...args).all<T>()).results;
  const now = nowSeconds();
  const key = await crypto.subtle.importKey('raw', encoder.encode(env.AUTH_RATE_LIMIT_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const ipHash = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(request.headers.get('cf-connecting-ip') || 'local')))));
  const limit = ['session', 'data', 'logout'].includes(path) ? 300 : 30;
  const bucket = `native:${path}:${Math.floor(now / 900)}:${ipHash}`;
  const counts = await query<{ count: number }>('INSERT INTO account_rate_limits(bucket,count,expires_at) VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1 RETURNING count', bucket, now + 900);
  if (counts[0].count > limit) { const response = reply({ error: 'rate_limited' }, 429); response.headers.set('retry-after', String(900 - now % 900)); return response; }
  // No raw URL, token, verifier, code, state, IP or account data enters application logs.
  await db.batch([
    db.prepare('DELETE FROM account_rate_limits WHERE expires_at < ?').bind(now),
    db.prepare('DELETE FROM account_native_oauth_states WHERE expires_at < ?').bind(now),
    db.prepare('DELETE FROM account_native_attempts WHERE expires_at < ?').bind(now),
    db.prepare('DELETE FROM account_native_sessions WHERE expires_at < ?').bind(now),
  ]);
  const clearCookie = transport.cookie(STATE_COOKIE, '', 0);
  if (path === 'authorize') {
    const attemptId = url.searchParams.get('attempt');
    if (!isRandom(attemptId) || [...url.searchParams.keys()].some(key => key !== 'attempt') || url.searchParams.getAll('attempt').length !== 1) return reply({ error: 'invalid_attempt' }, 400);
    const state = `n_${random()}`, verifier = random(), nonce = random();
    const attemptHash = await digest(attemptId), stateHash = await digest(state);
    const results = await db.batch<Attempt>([
      db.prepare("UPDATE account_native_attempts SET status='authorizing',oauth_state_hash=? WHERE attempt_hash=? AND status='pending' AND expires_at>? RETURNING *").bind(stateHash, attemptHash, now),
      db.prepare("INSERT INTO account_native_oauth_states(state_hash,attempt_hash,verifier,nonce_hash,expires_at) SELECT ?,attempt_hash,?,?,expires_at FROM account_native_attempts WHERE attempt_hash=? AND status='authorizing' AND oauth_state_hash=?").bind(stateHash, verifier, await digest(nonce), attemptHash, stateHash),
    ]);
    if (!results[0].results.length) return reply({ error: 'invalid_attempt' }, 400);
    const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    auth.search = new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, redirect_uri: env.GOOGLE_REDIRECT_URI, response_type: 'code', scope: 'openid email', state, nonce, code_challenge: await sha256url(verifier), code_challenge_method: 'S256', prompt: 'select_account' }).toString();
    return redirect(auth.toString(), [transport.cookie(STATE_COOKIE, state, ATTEMPT_SECONDS)]);
  }
  if (path === 'callback') {
    const state = url.searchParams.get('state');
    const cookies = (request.headers.get('cookie') || '').split(';').map(value => value.trim()).filter(value => value.startsWith(`${STATE_COOKIE}=`));
    if (!state || !/^n_[a-f0-9]{64}$/.test(state) || cookies.length !== 1 || cookies[0].slice(STATE_COOKIE.length + 1) !== state || url.searchParams.getAll('state').length !== 1) return reply({ error: 'invalid_oauth_state' }, 400, [clearCookie]);
    // First atomically consume browser state; application binding comes only from D1.
    const states = await query<{ attempt_hash: string; verifier: string; nonce_hash: string }>('DELETE FROM account_native_oauth_states WHERE state_hash=? AND expires_at>? RETURNING attempt_hash,verifier,nonce_hash', await digest(state), now);
    if (!states[0]) return reply({ error: 'invalid_oauth_state' }, 400, [clearCookie]);
    const attempts = await query<Attempt>("SELECT * FROM account_native_attempts WHERE attempt_hash=? AND status='authorizing' AND oauth_state_hash=? AND expires_at>?", states[0].attempt_hash, await digest(state), now);
    const attempt = attempts[0];
    if (!attempt || attempt.redirect_id !== REDIRECT_ID) return reply({ error: 'invalid_attempt' }, 400, [clearCookie]);
    const fail = async () => {
      await db.prepare("UPDATE account_native_attempts SET status='cancelled' WHERE attempt_hash=? AND status='authorizing'").bind(attempt.attempt_hash).run();
      return appRedirect(attempt.app_state, undefined, [clearCookie]);
    };
    const code = url.searchParams.get('code');
    if (url.searchParams.has('error') || !code || code.length > 4096 || url.searchParams.getAll('code').length !== 1) return fail();
    let claims;
    try {
      const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: env.GOOGLE_REDIRECT_URI, grant_type: 'authorization_code', code, code_verifier: states[0].verifier }), signal: AbortSignal.timeout(15000) });
      if (!response.ok) return fail();
      const tokens = await response.json() as { id_token?: string };
      if (typeof tokens.id_token !== 'string') return fail();
      claims = await verifyGoogleToken(tokens.id_token, env.GOOGLE_CLIENT_ID, states[0].nonce_hash, nowSeconds());
    } catch { return fail(); }
    await db.prepare('INSERT INTO account_users(id,google_sub,email,created_at) VALUES (?,?,?,?) ON CONFLICT(google_sub) DO UPDATE SET email=excluded.email').bind(crypto.randomUUID(), claims.sub, claims.email, nowSeconds()).run();
    const user = (await query<User>('SELECT id,email FROM account_users WHERE google_sub=?', claims.sub))[0];
    const appCode = random(), issuedAt = nowSeconds();
    const issued = await query("UPDATE account_native_attempts SET status='code',user_id=?,code_hash=?,code_expires_at=? WHERE attempt_hash=? AND status='authorizing' AND expires_at>? RETURNING attempt_hash", user.id, await digest(appCode), issuedAt + CODE_SECONDS, attempt.attempt_hash, issuedAt);
    return issued.length ? appRedirect(attempt.app_state, appCode, [clearCookie]) : reply({ error: 'invalid_attempt' }, 400, [clearCookie]);
  }
  let body: Record<string, unknown> = {};
  if (request.method === 'POST') {
    const parsed = await readBody(request, path === 'data' ? 500000 : 4096);
    if (parsed instanceof Response) return parsed;
    body = parsed;
  }
  if (path === 'start') {
    if (!exactKeys(body, ['codeChallenge', 'state', 'redirectId']) || typeof body.codeChallenge !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(body.codeChallenge) || !isState(body.state) || body.redirectId !== REDIRECT_ID) return reply({ error: 'invalid_request' }, 400);
    const attemptId = random(), expiresAt = now + ATTEMPT_SECONDS;
    await db.prepare("INSERT INTO account_native_attempts(attempt_hash,code_challenge,app_state,redirect_id,status,expires_at) VALUES (?,?,?,?,'pending',?)").bind(await digest(attemptId), body.codeChallenge, body.state, REDIRECT_ID, expiresAt).run();
    const authorize = new URL('/v1/account/native/authorize', env.GOOGLE_REDIRECT_URI);
    authorize.search = new URLSearchParams({ attempt: attemptId }).toString();
    return reply({ url: authorize.toString(), attemptId, expiresAt });
  }
  if (path === 'cancel') {
    if (!exactKeys(body, ['attemptId', 'codeVerifier', 'state', 'redirectId']) || !isRandom(body.attemptId) || !isVerifier(body.codeVerifier) || !isState(body.state) || body.redirectId !== REDIRECT_ID) return reply({ error: 'invalid_request' }, 400);
    const attemptHash = await digest(body.attemptId), challenge = await sha256url(body.codeVerifier);
    // Cancel and revoke are one transaction, including a token from a racing exchange.
    await db.batch([
      db.prepare("UPDATE account_native_attempts SET status='cancelled' WHERE attempt_hash=? AND code_challenge=? AND app_state=? AND redirect_id=?").bind(attemptHash, challenge, body.state, REDIRECT_ID),
      db.prepare("DELETE FROM account_native_oauth_states WHERE attempt_hash IN (SELECT attempt_hash FROM account_native_attempts WHERE attempt_hash=? AND status='cancelled')").bind(attemptHash),
      db.prepare("DELETE FROM account_native_sessions WHERE attempt_hash IN (SELECT attempt_hash FROM account_native_attempts WHERE attempt_hash=? AND status='cancelled')").bind(attemptHash),
    ]);
    return reply({ ok: true });
  }
  if (path === 'exchange') {
    if (!exactKeys(body, ['code', 'codeVerifier', 'state', 'redirectId']) || !isRandom(body.code) || !isVerifier(body.codeVerifier) || !isState(body.state) || body.redirectId !== REDIRECT_ID) return reply({ error: 'invalid_grant' }, 400);
    const exchangeNow = nowSeconds();
    const token = `rn1_${random()}`, tokenHash = await digest(token), expiresAt = exchangeNow + SESSION_SECONDS;
    // D1 batch is a transaction: claim and session creation commit or roll back together.
    const results = await db.batch<{ user_id: string }>([
      db.prepare("UPDATE account_native_attempts SET status='consumed',session_token_hash=? WHERE code_hash=? AND code_challenge=? AND app_state=? AND redirect_id=? AND status='code' AND code_expires_at>? AND expires_at>? RETURNING user_id").bind(tokenHash, await digest(body.code), await sha256url(body.codeVerifier), body.state, REDIRECT_ID, exchangeNow, exchangeNow),
      db.prepare("INSERT INTO account_native_sessions(token_hash,user_id,token_type,attempt_hash,expires_at) SELECT session_token_hash,user_id,'native',attempt_hash,? FROM account_native_attempts WHERE session_token_hash=? AND status='consumed'").bind(expiresAt, tokenHash),
    ]);
    if (!results[0].results.length) return reply({ error: 'invalid_grant' }, 400);
    const user = (await query<User>('SELECT id,email FROM account_users WHERE id=?', results[0].results[0].user_id))[0];
    return reply({ token, expiresAt, user: publicUser(user) });
  }
  const auth = request.headers.get('authorization') || '';
  if (!/^Bearer rn1_[a-f0-9]{64}$/.test(auth)) return reply({ error: 'sign_in_required' }, 401);
  const tokenHash = await digest(auth.slice(7));
  const user = (await query<User & { expires_at: number }>("SELECT u.id,u.email,s.expires_at FROM account_users u JOIN account_native_sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.token_type='native' AND s.expires_at>?", tokenHash, nowSeconds()))[0];
  if (!user) return reply({ error: 'sign_in_required' }, 401);
  if (path === 'session') return reply({ user: publicUser(user), expiresAt: user.expires_at });
  if (path === 'logout') {
    if (!exactKeys(body, [])) return reply({ error: 'invalid_request' }, 400);
    await db.prepare("DELETE FROM account_native_sessions WHERE token_hash=? AND token_type='native'").bind(tokenHash).run();
    return reply({ ok: true });
  }
  if (request.method === 'GET') {
    const row = (await query<{ data_json: string; version: number }>('SELECT data_json,version FROM account_data WHERE user_id=?', user.id))[0];
    return reply({ data: row ? JSON.parse(row.data_json) : {}, version: row?.version || 0 });
  }
  if (!exactKeys(body, ['data', 'version', 'importLocal', 'consent']) || !allowedData(body.data) || !Number.isSafeInteger(body.version) || Number(body.version) < 0) return reply({ error: 'invalid_data_or_ranked_data' }, 400);
  if (body.importLocal && body.consent !== true) return reply({ error: 'explicit_import_consent_required' }, 400);
  await db.prepare('INSERT OR IGNORE INTO account_data(user_id) VALUES (?)').bind(user.id).run();
  const rows = await query<{ version: number }>('UPDATE account_data SET data_json=?,version=version+1 WHERE user_id=? AND version=? RETURNING version', JSON.stringify(body.data), user.id, body.version);
  return rows.length ? reply({ ok: true, version: rows[0].version }) : reply({ error: 'data_conflict' }, 409);
}

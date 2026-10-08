import type { McpEnv } from './config.ts';

const encoder = new TextEncoder();
const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
const sha256 = async (text: string) => hex(await crypto.subtle.digest('SHA-256', encoder.encode(text)));
export type BrowserSession = Readonly<{ userId: string; email: string; proofKey: string }>;

/** Reuse the existing HTTPS API-origin web session for consent only. Never pass it to MCP or Google. */
export async function browserSession(request: Request, env: McpEnv): Promise<BrowserSession | null> {
  const cookies = (request.headers.get('cookie') ?? '').split(';').map(value => value.trim()).filter(value => value.startsWith('__Host-reysonai='));
  if (cookies.length !== 1) return null;
  const raw = cookies[0].slice('__Host-reysonai='.length);
  if (!/^[a-f0-9]{64}$/.test(raw)) return null;
  const result = await env.DB.prepare('SELECT u.id,u.email FROM account_users u JOIN account_sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.expires_at>?')
    .bind(await sha256(raw), Math.floor(Date.now() / 1000)).all<{ id: string; email: string }>();
  const user = result.results[0];
  if (!user || !/^[A-Za-z0-9_-]{1,128}$/.test(user.id)) return null;
  return { userId: user.id, email: user.email, proofKey: raw };
}
export async function accountExists(env: McpEnv, userId: string): Promise<boolean> {
  return (await env.DB.prepare('SELECT id FROM account_users WHERE id=?').bind(userId).all<{ id: string }>()).results.length === 1;
}

/** Bind the reviewed consent/revoke form to this exact browser session, including account switches. */
export async function sessionProof(session: BrowserSession, purpose: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(session.proofKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, encoder.encode(`reysonai-mcp-v1:${session.userId}:${purpose}`)));
}
export async function validSessionProof(session: BrowserSession, purpose: string, proof: string): Promise<boolean> {
  if (!/^[a-f0-9]{64}$/.test(proof)) return false;
  const key = await crypto.subtle.importKey('raw', encoder.encode(session.proofKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const bytes = Uint8Array.from(proof.match(/../g)!, pair => Number.parseInt(pair, 16));
  return crypto.subtle.verify('HMAC', key, bytes, encoder.encode(`reysonai-mcp-v1:${session.userId}:${purpose}`));
}

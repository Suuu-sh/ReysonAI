export const SECURITY_HEADERS = {
  'cache-control': 'private, no-store',
  'pragma': 'no-cache',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
};

export function privateResponse(response: Response): Response {
  const result = new Response(response.body, response);
  const preserveFormReferrerPolicy = result.headers.get('content-type')?.toLowerCase().startsWith('text/html')
    && result.headers.get('referrer-policy')?.trim().toLowerCase() === 'strict-origin';
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    if (name === 'referrer-policy' && preserveFormReferrerPolicy) continue;
    result.headers.set(name, value);
  }
  return result;
}
export function errorResponse(error: string, status: number): Response {
  return Response.json({ error }, { status, headers: SECURITY_HEADERS });
}
export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => `&#${character.charCodeAt(0)};`);
const PAGE_STYLES = `<style>
:root{color-scheme:dark;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#f4f4f5;background:#09090b;font-synthesis:none;text-rendering:optimizeLegibility}
*{box-sizing:border-box}
body{min-width:320px;min-height:100vh;margin:0;padding:32px 20px 48px;background:radial-gradient(80% 460px at 50% -190px,rgba(194,45,103,.19),transparent 78%),#09090b;color:#f4f4f5;font-size:16px;line-height:1.65}
.page-shell{width:min(100%,680px);margin:0 auto}
.masthead{display:flex;align-items:center;gap:10px;margin:0 0 18px 4px;color:#fafafa;font-size:14px;font-weight:700;letter-spacing:.01em}
.brand-mark{display:grid;width:28px;height:28px;place-items:center;border:1px solid #74304d;border-radius:9px;background:#29131e;color:#ff9bc5;font-size:16px;font-weight:800}
.brand-context{margin-left:auto;color:#a1a1aa;font-size:11px;font-weight:600;letter-spacing:.12em}
main{padding:clamp(24px,5vw,42px);border:1px solid #2b2930;border-radius:24px;background:linear-gradient(155deg,rgba(22,21,26,.98),rgba(15,15,18,.98));box-shadow:0 24px 80px rgba(0,0,0,.36)}
h1{max-width:19ch;margin:0 0 14px;color:#fafafa;font-size:clamp(25px,4.4vw,34px);font-weight:700;letter-spacing:-.035em;line-height:1.2}
p{margin:0 0 18px;color:#c4c4cc}
a{color:#ff9bc5;text-decoration-thickness:1px;text-underline-offset:3px}
a:hover{color:#ffc1d9}
a:focus-visible,button:focus-visible,input:focus-visible{outline:3px solid #ff9bc5;outline-offset:4px}
button{min-height:48px;padding:11px 19px;border:1px solid transparent;border-radius:12px;background:#c52d6c;color:#fff;font:inherit;font-weight:700;line-height:1.2;cursor:pointer}
button:hover{background:#d53c7d}
button[name="decision"][value="deny"]{border-color:#514d57;background:#222127;color:#ededf0}
button[name="decision"][value="deny"]:hover{border-color:#817b88;background:#2d2b32}
.consent-flow .eyebrow,.completion .eyebrow{margin:0 0 10px;color:#ff9bc5;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase}
.account-context{margin:0 0 22px;padding:13px 15px;border:1px solid #34313a;border-radius:12px;background:#17161b;color:#ededf0;overflow-wrap:anywhere}
.account-context strong{color:#fff}
.client-details{display:grid;grid-template-columns:minmax(0,.85fr) minmax(0,1.15fr);gap:12px;margin:0 0 18px}
.client-detail{min-width:0;padding:14px 15px;border:1px solid #34313a;border-radius:13px;background:rgba(9,9,11,.42)}
.client-detail span{display:block;margin-bottom:3px;color:#a1a1aa;font-size:12px;font-weight:600;letter-spacing:.02em}
.client-detail strong,.client-detail code{display:block;color:#f4f4f5;font-size:15px;font-weight:650;overflow-wrap:anywhere}
.client-detail code{font-family:inherit}
.security-note,.loopback-warning{padding:14px 16px;border-radius:12px;font-size:14px;line-height:1.6}
.security-note{margin:0 0 24px;border:1px solid #34313a;background:#17161b;color:#c4c4cc}
.security-note strong{color:#fff}
.loopback-warning{margin:0 0 18px;border:1px solid #7a5b23;background:#251d10;color:#ffe2a0}
.permissions{min-width:0;margin:0 0 20px;padding:0;border:0}
.permissions legend{margin-bottom:10px;color:#f4f4f5;font-size:15px;font-weight:700}
.permission-list{display:grid;gap:9px}
.permission{display:flex;align-items:flex-start;gap:12px;padding:14px;border:1px solid #38353e;border-radius:13px;background:#111114;cursor:pointer}
.permission:has(input:checked){border-color:#75415a;background:#1b1419}
.permission input{flex:0 0 auto;width:19px;height:19px;margin:2px 0 0;accent-color:#e95791}
.permission-copy{display:grid;gap:3px;color:#f4f4f5;font-size:14px;line-height:1.5}
.permission-copy small{color:#a9a8b0;font-size:12px;line-height:1.5}
.permission-optional .permission-copy>span{font-weight:650}
.consent-actions{display:flex;flex-wrap:wrap;gap:10px;margin:0 0 17px}
.consent-actions button{min-width:132px}
.manage-link{margin:0;font-size:14px}
.completion{text-align:center}
.completion-mark{display:grid;width:52px;height:52px;margin:0 auto 18px;place-items:center;border:1px solid #72405a;border-radius:50%;background:#26151e;color:#ff9bc5;font-size:26px;font-weight:700;line-height:1}
.completion h1{max-width:none}
.completion p{max-width:46ch;margin-right:auto;margin-left:auto}
.completion-link{display:inline-flex;min-height:48px;align-items:center;justify-content:center;margin-top:4px;padding:10px 18px;border:1px solid transparent;border-radius:12px;background:#c52d6c;color:white;font-weight:700;text-decoration:none}
.completion-link:hover{background:#d53c7d;color:#fff}
.page-footer{margin:16px 4px 0;color:#7e7c85;font-size:12px;text-align:center}
@media(max-width:520px){body{padding:18px 14px 32px}.masthead{margin:0 0 12px 2px}main{padding:25px 20px;border-radius:19px}.client-details{grid-template-columns:1fr;gap:9px}.consent-actions{display:grid;grid-template-columns:1fr}.consent-actions button{width:100%}}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{scroll-behavior:auto!important;animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}
</style>`;
export function html(body: string, status = 200, supplied?: Headers): Response {
  const headers = new Headers(supplied);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
  headers.set('content-type', 'text/html; charset=utf-8');
  return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>ReysonAI account access</title>${PAGE_STYLES}<body><div class="page-shell"><header class="masthead"><span class="brand-mark" aria-hidden="true">R</span><span>ReysonAI</span><span class="brand-context">ACCOUNT ACCESS</span></header><main>${body}</main><p class="page-footer">Review access carefully. You can revoke connections from your account.</p></div></body></html>`, { status, headers });
}
/** Consent and connection forms need a same-origin Origin header on POST.
 * strict-origin keeps that Origin while limiting Referer to the page origin. */
export function oauthFormHtml(body: string, status = 200, supplied?: Headers): Response {
  const response = html(body, status, supplied);
  response.headers.set('referrer-policy', 'strict-origin');
  return response;
}
/**
 * Show a completed consent decision and let the user follow only the OAuth provider's
 * already-validated callback. Pass completeAuthorization's redirectTo for approval, or
 * denyConsent's Location for denial; never build this destination from request input.
 */
export function consentCompletionHtml(decision: 'approved' | 'denied', redirectTo: string | null, supplied?: Headers): Response {
  const headers = new Headers(supplied);
  headers.delete('location');
  const approved = decision === 'approved';
  const heading = approved ? 'Connection approved' : 'Connection declined';
  const message = approved
    ? 'Access was approved. Continue to the app to finish.'
    : 'No access was granted. You can return to the app.';
  const link = redirectTo
    ? `<a class="completion-link" href="${escapeHtml(redirectTo)}" rel="noreferrer">${approved ? 'Continue to the app' : 'Return to the app'}</a>`
    : '<p>You can close this page.</p>';
  return html(`<section class="completion ${approved ? 'completion-approved' : 'completion-denied'}"><p class="eyebrow">Secure connection</p><span class="completion-mark" aria-hidden="true">${approved ? '✓' : '×'}</span><h1>${heading}</h1><p>${message}</p>${link}</section>`, 200, headers);
}
export async function readBoundedBody(request: Request, limit = 16384): Promise<string> {
  const reader = request.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > limit) { await reader.cancel(); throw new RangeError('payload_too_large'); }
    chunks.push(part.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

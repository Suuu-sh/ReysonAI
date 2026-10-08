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
export function html(body: string, status = 200, supplied?: Headers): Response {
  const headers = new Headers(supplied);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
  headers.set('content-type', 'text/html; charset=utf-8');
  return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>ReysonAI connections</title><body><main>${body}</main></body></html>`, { status, headers });
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
    ? `<p><a href="${escapeHtml(redirectTo)}" rel="noreferrer">${approved ? 'Continue to the app' : 'Return to the app'}</a></p>`
    : '<p>You can close this page.</p>';
  return html(`<h1>${heading}</h1><p>${message}</p>${link}`, 200, headers);
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

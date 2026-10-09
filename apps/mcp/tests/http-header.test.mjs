import test from 'node:test';
import assert from 'node:assert/strict';
import { consentCompletionHtml, errorResponse, html, oauthFormHtml, privateResponse, SECURITY_HEADERS } from '../src/http.ts';

test('OAuth form HTML keeps strict-origin through the private response wrapper', async () => {
  const response = privateResponse(oauthFormHtml('<form method="post"></form>'));

  assert.equal(response.headers.get('content-type'), 'text/html; charset=utf-8');
  assert.equal(response.headers.get('referrer-policy'), 'strict-origin');
  assert.equal(response.headers.get('cache-control'), SECURITY_HEADERS['cache-control']);
  assert.equal(response.headers.get('pragma'), SECURITY_HEADERS.pragma);
  assert.equal(response.headers.get('content-security-policy'), SECURITY_HEADERS['content-security-policy']);
  assert.equal(response.headers.get('x-frame-options'), SECURITY_HEADERS['x-frame-options']);
});

test('ordinary HTML and JSON error responses retain no-referrer', () => {
  assert.equal(privateResponse(html('<p>Sign in</p>')).headers.get('referrer-policy'), 'no-referrer');
  assert.equal(privateResponse(errorResponse('invalid_origin', 403)).headers.get('referrer-policy'), 'no-referrer');
  assert.equal(privateResponse(new Response('{}', {
    headers: { 'content-type': 'application/json', 'referrer-policy': 'strict-origin' },
  })).headers.get('referrer-policy'), 'no-referrer');
});

test('account pages include responsive, keyboard-visible styling without external assets', async () => {
  const response = privateResponse(html('<p>Sign in</p>'));
  const body = await response.text();

  assert.match(body, /<html lang="en">/);
  assert.match(body, /name="viewport" content="width=device-width, initial-scale=1"/);
  assert.match(body, /<style>[\s\S]*@media\(max-width:520px\)/);
  assert.match(body, /a:focus-visible,button:focus-visible,input:focus-visible/);
  assert.match(body, /prefers-reduced-motion:reduce/);
  assert.doesNotMatch(body, /<(?:script|link|img|iframe|source)\b|@import|url\s*\(/i);
  assert.equal(response.headers.get('content-security-policy'), SECURITY_HEADERS['content-security-policy']);
});

test('approved consent completion uses the supplied callback as an escaped ordinary link', async () => {
  const providerHeaders = new Headers();
  providerHeaders.append('set-cookie', 'fixture-consent=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Lax');
  const redirectTo = 'https://client.example/callback?step=approved&source=fixture';
  const response = privateResponse(consentCompletionHtml('approved', redirectTo, providerHeaders));
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('location'), null);
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(response.headers.get('cache-control'), SECURITY_HEADERS['cache-control']);
  assert.equal(response.headers.get('content-security-policy'), SECURITY_HEADERS['content-security-policy']);
  assert.equal(response.headers.get('x-frame-options'), SECURITY_HEADERS['x-frame-options']);
  assert.equal(response.headers.getSetCookie().length, 1);
  assert.match(body, /class="completion-link" href="https:\/\/client\.example\/callback\?step=approved&#38;source=fixture" rel="noreferrer">Continue to the app/);
  assert.match(body, /class="completion completion-approved"/);
  assert.doesNotMatch(body, /<(?:form|script|iframe|img|source|link)\b|\bsrc=/i);
  assert.doesNotMatch(body, /<meta\b[^>]*http-equiv\s*=\s*["']?refresh/i);
});

test('declined consent completion uses only the provider Location and retains its response headers', async () => {
  const providerHeaders = new Headers({ location: 'https://client.example/callback?error=access_denied&source=fixture' });
  providerHeaders.append('set-cookie', 'fixture-consent=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Lax');
  const response = privateResponse(consentCompletionHtml('denied', providerHeaders.get('location'), providerHeaders));
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('location'), null);
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(response.headers.getSetCookie().length, 1);
  assert.match(body, /Connection declined/);
  assert.match(body, /No access was granted/);
  assert.match(body, /class="completion-link" href="https:\/\/client\.example\/callback\?error=access_denied&#38;source=fixture" rel="noreferrer">Return to the app/);
  assert.match(body, /class="completion completion-denied"/);
  assert.doesNotMatch(body, /<(?:form|script|iframe|img|source|link)\b|\bsrc=/i);
  assert.doesNotMatch(body, /<meta\b[^>]*http-equiv\s*=\s*["']?refresh/i);
});

test('declined consent without a provider Location offers no fallback destination', async () => {
  const response = privateResponse(consentCompletionHtml('denied', null));
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.match(body, /You can close this page/);
  assert.doesNotMatch(body, /<a\b/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { errorResponse, html, oauthFormHtml, privateResponse, SECURITY_HEADERS } from '../src/http.ts';

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

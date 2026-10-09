import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizationFailureDetails } from '../src/auth-diagnostics.ts';

test('authorization diagnostics use fixed labels and distinguish request from consent', () => {
  for (const [message, reason] of [
    ['Authorization request was sent to an unconfigured endpoint', 'authorization_endpoint_mismatch'],
    ['client_id is required', 'client_id_missing'],
    ['Invalid client_id', 'client_not_registered'],
    ['Invalid redirect URI', 'redirect_uri_mismatch'],
    ['response_type is required', 'response_type_missing'],
    ['The plain PKCE method is not allowed. Use S256 instead.', 'pkce_invalid'],
    ['PKCE code_challenge is required when code_challenge_method is provided.', 'pkce_invalid'],
    ['Public clients must use PKCE with the authorization code flow.', 'pkce_invalid'],
    ['Missing transaction handle', 'consent_handle_missing'],
    ['This authorization was not started in this browser; start again', 'consent_browser_cookie_missing'],
    ['This authorization belongs to a different browser session; start again', 'consent_browser_mismatch'],
    ['This authorization expired or was already used; start again', 'consent_transaction_unavailable'],
  ]) {
    for (const method of ['GET', 'POST']) assert.deepEqual(authorizationFailureDetails({ code: 'invalid_request', message }, method), {
      error: 'authorization_request_invalid_or_expired', reason,
      stage: method === 'GET' ? 'authorization_request' : 'consent_submission',
    });
  }
});

test('authorization diagnostics never reflect unknown provider or request data', () => {
  const privateValue = 'private-code-state-cookie-token-url';
  for (const [code, reason] of [
    ['invalid_target', 'resource_invalid'], ['invalid_scope', 'scope_invalid'],
    ['unsupported_response_type', 'response_type_unsupported'], ['unauthorized_client', 'response_type_unsupported'],
    [privateValue, 'authorization_validation_failed'],
  ]) {
    const result = authorizationFailureDetails({ code, message: privateValue }, 'GET');
    assert.equal(result.reason, reason);
    assert.equal(JSON.stringify(result).includes(privateValue), false);
  }
  for (const message of ['constructor', '__proto__', 'Invalid client_id private-value']) {
    assert.equal(authorizationFailureDetails({ code: 'invalid_request', message }, 'POST').reason, 'authorization_validation_failed');
  }
});

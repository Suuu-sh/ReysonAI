// Map only known provider failures to fixed public labels. Never reflect request values,
// error descriptions, callback URLs, cookies, codes, tokens or state into a response/log.
const MESSAGE_REASONS = new Map([
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
]);

export function authorizationFailureDetails(error: { code: string; message: string }, method: string) {
  const reason = MESSAGE_REASONS.get(error.message)
    ?? (error.code === 'invalid_target' ? 'resource_invalid'
      : error.code === 'invalid_scope' ? 'scope_invalid'
      : error.code === 'unsupported_response_type' || error.code === 'unauthorized_client' ? 'response_type_unsupported'
      : 'authorization_validation_failed');
  return {
    error: 'authorization_request_invalid_or_expired',
    reason,
    stage: method === 'GET' ? 'authorization_request' : 'consent_submission',
  };
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { entitlementAdapter, validIdentity, RANGE_SCOPE } from '../src/access.ts';
import { sessionProof, validSessionProof, browserSession } from '../src/session.ts';
import { readBoundedBody } from '../src/http.ts';
import { configuration } from '../src/config.ts';
const origin = 'https://api.example.invalid';
const config = { MCP_ENABLED:'true', AUTH_ENABLED:'true', MCP_ACCESS_MODE:'authenticated_free', MCP_ORIGIN:origin, AUTH_APP_URL:'https://app.example.invalid', MCP_ALLOWED_ORIGINS:'https://app.example.invalid', DB:{}, OAUTH_KV:{} };
test('configuration and entitlement fail closed; authenticated-free is explicit', async () => {
 assert.ok(configuration(config));
 for (const patch of [{MCP_ENABLED:'false'},{MCP_ACCESS_MODE:'paid'},{MCP_ACCESS_MODE:undefined},{AUTH_ENABLED:'false'},{MCP_ORIGIN:'https://evil.test/path'},{MCP_ALLOWED_ORIGINS:'*'},{MCP_ALLOWED_ORIGINS:'https://app.example.invalid/'},{DB:null}]) assert.equal(configuration({...config,...patch}), null);
 assert.equal((await entitlementAdapter('authenticated_free').check({userId:'one'})).allowed,true);
 assert.equal((await entitlementAdapter('authenticated_free').check({userId:''})).allowed,false);
 assert.equal((await entitlementAdapter('paid').check({userId:'one'})).allowed,false);
});
test('identity requires expiry audience known scopes and a bounded account id', () => {
 const good = {userId:'one',grantId:'abcdefghijklmnop',clientId:'client',scopes:[RANGE_SCOPE],audience:`${origin}/mcp`,expiresAt:100};
 assert.ok(validIdentity(good,`${origin}/mcp`,99));
 for (const patch of [{expiresAt:99},{expiresAt:NaN},{audience:'https://other/mcp'},{scopes:['admin']},{userId:'one:two'},{clientId:''}]) assert.equal(validIdentity({...good,...patch},`${origin}/mcp`,99),false);
});
test('form proof binds purpose account and exact browser session', async () => {
 const session={userId:'one',proofKey:'a'.repeat(64)};
 const proof=await sessionProof(session,'consent:handle');
 assert.ok(await validSessionProof(session,'consent:handle',proof));
 for(const pair of [[{...session,userId:'two'},'consent:handle'],[{...session,proofKey:'b'.repeat(64)},'consent:handle'],[session,'revoke:handle']]) assert.equal(await validSessionProof(...pair,proof),false);
 assert.equal(await validSessionProof(session,'consent:handle','malformed'),false);
});
test('session bridge rejects bearer/native/ambiguous cookies without reading DB', async () => {
 const env={DB:{prepare(){throw new Error('must not query');}}};
 for(const headers of [{authorization:'Bearer '+ 'a'.repeat(64)},{cookie:'reysonai-dev-session='+'a'.repeat(64)},{cookie:'__Host-reysonai=bad'},{cookie:'__Host-reysonai='+'a'.repeat(64)+'; __Host-reysonai='+'b'.repeat(64)}]) assert.equal(await browserSession(new Request(origin,{headers}),env),null);
});
test('request bodies have hard limits, including streamed bodies', async () => {
 await assert.rejects(readBoundedBody(new Request(origin,{method:'POST',body:'x'.repeat(17)}),16), RangeError);
 assert.equal(await readBoundedBody(new Request(origin,{method:'POST',body:'abc'}),16),'abc');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {accountTransport,routeAccount} from '../src/account.ts';
const url=value=>new URL(value);
const local=()=>accountTransport(url('http://localhost:8787/v1/account/session'),url('http://localhost:5173/app'),url('http://localhost:8787/v1/account/google/callback'),['http://localhost:5173'],'true');
test('explicit same-host loopback guard and separate HTTP dev cookies',()=>{
 const config=local();assert.ok(config);
 assert.equal(config.session,'reysonai-dev-session');assert.equal(config.state,'reysonai-dev-oauth');
 const cookie=config.cookie(config.session,'example');assert.ok(cookie.includes('HttpOnly; SameSite=Lax'));assert.equal(cookie.includes('Secure'),false);
 assert.equal(accountTransport(url('http://localhost:8787'),url('http://localhost:5173'),url('http://localhost:8787/v1/account/google/callback'),['http://localhost:5173'],undefined),null);
 for(const host of ['api.reysonai.com','localhost.evil.invalid','192.168.1.10']) assert.equal(accountTransport(url(`http://${host}:8787`),url(`http://${host}:5173`),url(`http://${host}:8787/v1/account/google/callback`),[`http://${host}:5173`],'true'),null);
 assert.equal(accountTransport(url('http://localhost:8787'),url('http://localhost:5173'),url('http://127.0.0.1:8787/v1/account/google/callback'),['http://localhost:5173'],'true'),null);
 assert.equal(accountTransport(url('http://localhost:8787'),url('http://localhost:5173'),url('http://localhost:8787/v1/account/google/callback'),['http://localhost:5173','https://evil.invalid'],'true'),null);
 const prod=[url('https://api.reysonai.com'),url('https://app.reysonai.com'),url('https://api.reysonai.com/v1/account/google/callback'),['https://app.reysonai.com']];
 assert.equal(accountTransport(...prod,'true'),null);
 assert.equal(accountTransport(...prod,undefined).cookie('__Host-reysonai','example').includes('HttpOnly; Secure; SameSite=Lax'),true);
});
test('local session reads dev cookie only and never grants anonymous privileges',async()=>{
 let reads=0;const env={DB:{prepare(){reads++;throw new Error('unexpected_database_access');}},AUTH_ENABLED:'true',AUTH_LOCAL_DEV:'true',AUTH_APP_URL:'http://localhost:5173',ALLOWED_ORIGIN:'http://localhost:5173',GOOGLE_REDIRECT_URI:'http://localhost:8787/v1/account/google/callback',GOOGLE_CLIENT_ID:'dev-client',GOOGLE_CLIENT_SECRET:'test-only',AUTH_RATE_LIMIT_KEY:'test-only'};
 const response=await routeAccount(new Request('http://localhost:8787/v1/account/session',{headers:{cookie:`__Host-reysonai=${'a'.repeat(64)}`}}),env);
 assert.deepEqual(await response.json(),{user:null});assert.equal(reads,0);
 assert.equal((await routeAccount(new Request('http://localhost:8787/v1/account/data'),env)).status,401);
});

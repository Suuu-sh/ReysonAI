import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import worker from '../src/index.ts';
import { fixture, digest } from '../tests/helpers/native-account-fixture.mjs';
if (!process.argv[2]) throw new Error('Pass a bundled ESM mobile native-account module path');
const { createNativeAccountClient } = await import(pathToFileURL(resolve(process.argv[2])).href);
const f = await fixture();
let stored = null;
try {
 const client = createNativeAccountClient({
  request: async (url, options) => { assert.equal(options.credentials,'omit'); const r = new Request(url, options); assert.equal(r.headers.has('cookie'),false); assert.equal(r.headers.has('origin'),false); return worker.fetch(r,f.env); },
  randomBytes: async () => crypto.getRandomValues(new Uint8Array(32)),
  sha256Hex: digest,
  openAuth: async url => ({type:'success',url:(await f.finish(await f.authorize({url}))).headers.get('location')}),
  dismissAuth(){},
  storage:{async get(){return stored},async set(value){stored=value},async clear(){stored=null}},
  now:()=>Date.now(),
 });
 assert.equal(await client.refresh(),null);
 const signed = await client.signIn(); assert.equal(signed.user.verified,true); assert.equal(signed.version,0);
 assert.equal(await client.save({'reysonai:locale:v1':'ja'},0),1);
 await assert.rejects(client.save({},0), error=>error.code==='conflict');
 const restored = await client.refresh(); assert.equal(restored.user.id,signed.user.id); assert.equal(restored.version,1); assert.equal(restored.data['reysonai:locale:v1'],'ja');
 await client.signOut(); assert.equal(stored,null); assert.equal(await client.refresh(),null);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM account_native_sessions').get().n,0);
 console.log('PASS actual mobile client against actual backend: config, start, browser authorize/callback, exchange, save, conflict, restore, logout');
}finally{f.close()}

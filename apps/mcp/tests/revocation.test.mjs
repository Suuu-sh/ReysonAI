import test from 'node:test';
import assert from 'node:assert/strict';
import { withRevocationGuard } from '../src/revocation.ts';
function fixture() {
 const tombstones=new Set(), kv=new Map();let pause;
 const env={DB:{withSession(mode){assert.equal(mode,'first-primary');return {prepare(sql){return {bind(user,grant){return {async all(){return {results:tombstones.has(`${user}:${grant}`)?[{grant_id:grant}]:[]};},async run(){tombstones.add(`${user}:${grant}`);}};}};}};}},OAUTH_KV:{async get(key){const old=kv.get(key)??null;if(pause)await pause;return old;},async put(key,value){kv.set(key,value);},async delete(key){kv.delete(key);},async list(){return {keys:[...kv.keys()].map(name=>({name})),list_complete:true};}}};
 return {env,tombstones,kv,setPause(p){pause=p;},guard:withRevocationGuard(env).OAUTH_KV};
}
test('provider revocation creates durable tombstones before KV delete and covers stale reads/writes', async()=>{
 const f=fixture(), id='abcdefghijklmnop', grant=`grant:alice:${id}`, token=`token:alice:${id}:hashed-token`;
 f.kv.set(grant,'grant-data');f.kv.set(token,'private-token-data');
 let release;f.setPause(new Promise(resolve=>release=resolve));
 const pending=f.guard.get(token);
 await f.guard.delete(grant);
 assert.ok(f.tombstones.has(`alice:${id}`));
 release();assert.equal(await pending,null);
 // A stale put arriving from a provider invocation that passed an earlier check remains unusable.
 f.kv.set(grant,'stale-grant');f.kv.set(token,'stale-token');
 assert.equal(await f.guard.get(grant),null);assert.equal(await f.guard.get(token),null);
 await assert.rejects(f.guard.put(token,'another-stale-token'),/revoked/);
 assert.equal(await f.guard.get(`client:${id}`),null);
});
test('other users/grants are unaffected; tombstone failure blocks deletion', async()=>{
 const f=fixture(), id='abcdefghijklmnop';f.kv.set(`grant:bob:${id}`,'bob');
 await f.guard.delete(`grant:alice:${id}`);assert.equal(await f.guard.get(`grant:bob:${id}`),'bob');
 const blocked=withRevocationGuard({...f.env,DB:{withSession(){throw new Error('D1 unavailable');}}});
 await assert.rejects(blocked.OAUTH_KV.delete(`grant:bob:${id}`),/D1 unavailable/);assert.equal(f.kv.get(`grant:bob:${id}`),'bob');
});

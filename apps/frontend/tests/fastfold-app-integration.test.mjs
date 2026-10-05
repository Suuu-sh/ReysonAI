import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { JSDOM } from 'jsdom';
import { createRoot } from 'react-dom/client';
import React, { act } from 'react';
import worker from '../../backend/src/index.ts';
import { digest } from '../../backend/src/account.ts';
import { routeFastFold } from '../../backend/src/fastfold.ts';

// Isolated in-memory authenticated integration. No real cookies, users, OAuth,
// production requests, auth bypass, persisted fixtures or deployed ranking.
const buildResult = await build({ stdin: { contents: 'export { TrainerPage } from "./src/trainer/TrainerPage.tsx"; export { refreshAccount } from "./src/account/session.ts";', resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, platform: 'node', format: 'esm', external: ['react', 'react-dom', 'react-dom/client'], jsx: 'automatic', loader: { '.css': 'empty', '.png': 'dataurl', '.webp': 'dataurl' }, define: { 'import.meta.env': JSON.stringify({ DEV: true }), 'import.meta.url': JSON.stringify(new URL('../src/estimated/datasets.ts', import.meta.url).href) } });
const code = buildResult.outputFiles[0].text.replace(/from "(react(?:\/jsx-runtime)?|react-dom(?:\/client)?)"/g, (_, name) => `from "${import.meta.resolve(name)}"`);
const bundlePath = `/tmp/reyson-fastfold-app-test-${process.pid}.mjs`;
writeFileSync(bundlePath, code);
after(() => unlinkSync(bundlePath));
const { TrainerPage, refreshAccount } = await import(pathToFileURL(bundlePath).href);
const DATASETS = ['opening-ranges','preflop-ranges','three-bet-responses','four-bet-responses','five-bet-responses','limp-responses','limp-deep-responses','multiway-responses','squeeze-responses','cold-three-bet-responses'];
async function ephemeralServer() {
  const sqlite = new DatabaseSync(':memory:'); sqlite.exec('PRAGMA foreign_keys=ON');
  for (const file of ['0001_postflop.sql','0003_preflop.sql','0007_accounts.sql','0009_ranked.sql','0010_fastfold.sql']) sqlite.exec(readFileSync(new URL(`../../backend/migrations/${file}`, import.meta.url),'utf8'));
  const DB = { prepare(sql) { let args = []; return { bind(...values) { args=values; return this; }, async all() { return { results: sqlite.prepare(sql).all(...args) }; } }; } };
  const names = [...DATASETS, ...['nit','station','lag','maniac'].flatMap(type => DATASETS.slice(0,7).map(name => `profiles/${type}/villain/${name}`))];
  for (const name of names) { const body=readFileSync(new URL(`../src/estimated/${name}.json`,import.meta.url),'utf8'); sqlite.prepare('INSERT INTO preflop_datasets VALUES (?,?,?,1)').run(name,createHash('sha256').update(body).digest('hex'),Buffer.byteLength(body)); sqlite.prepare('INSERT INTO preflop_dataset_parts VALUES (?,0,?)').run(name,body); }
  const token = 'e'.repeat(64); sqlite.prepare('INSERT INTO account_users VALUES (?,?,?,?)').run('ephemeral','ephemeral','test@example.invalid',Date.now()); sqlite.prepare('INSERT INTO account_sessions VALUES (?,?,?)').run(await digest(token),'ephemeral',Math.floor(Date.now()/1000)+3600);
  const env = { DB,FASTFOLD_ENABLED:'true',AUTH_ENABLED:'true',AUTH_LOCAL_DEV:'true',AUTH_APP_URL:'http://localhost:5173',ALLOWED_ORIGIN:'http://localhost:5173',GOOGLE_REDIRECT_URI:'http://localhost:8787/v1/account/google/callback',AUTH_RATE_LIMIT_KEY:'ephemeral-test-only',GOOGLE_CLIENT_ID:'ephemeral-test-only',GOOGLE_CLIENT_SECRET:'ephemeral-test-only' };
  // Match the runtime binding boundary while retaining real route authentication,
  // server replay, CAS and the isolated SQLite database (no auth bypass).
  env.FASTFOLD_RUNTIME = { getByName() { return { handle: request => routeFastFold(request, env) }; } };
  const calls = [];
  const request = async (url, options = {}) => { calls.push({url,options}); return worker.fetch(new Request(url, { ...options,headers:{...options.headers,origin:env.AUTH_APP_URL,cookie:`reysonai-dev-session=${token}`} }),env); };
  return {sqlite,calls,request};
}

test('actual Trainer ranked entry renders FastFold against authenticated server and preserves all seven ladder tiers',async()=>{
  const server=await ephemeralServer();
  const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost:5173/learn/trainer'});
  const previous={window:globalThis.window,document:globalThis.document,fetch:globalThis.fetch};
  globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.fetch=server.request;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  dom.window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
  dom.window.scrollTo=()=>{}; let root=createRoot(dom.window.document.getElementById('root'));
  let path='/learn/trainer';
  const props={profile:{nickname:'Test',level:'intermediate',updatedAt:new Date().toISOString()},onSectionChange(){},onNavigate(next){path=next;render();}};
  const render=()=>root.render(React.createElement(TrainerPage,{...props,path}));
  const settle=async predicate=>{for(let i=0;i<100&&!predicate();i++)await act(async()=>{await new Promise(resolve=>setTimeout(resolve,10));});assert.ok(predicate(),'UI request did not settle');};
  const click=async selector=>{const button=dom.window.document.querySelector(selector);assert.ok(button,`Missing ${selector}`);await act(async()=>{button.click();});};
  const getSession=async()=>{const response=await server.request('http://localhost:8787/v1/fastfold/profile');assert.equal(response.status,200);return (await response.json()).state.active;};
  try {
    const readiness=await server.request('http://localhost:8787/v1/fastfold/status'); assert.equal(readiness.status,200,await readiness.text());
    await refreshAccount(); await act(async()=>render());
    await settle(()=>dom.window.document.querySelector('.is-ranked')?.textContent.includes('FastFold'));
    assert.match(dom.window.document.body.textContent,/FastFold/);
    assert.equal(dom.window.document.querySelectorAll('.is-ranked .rank-ladder [data-tier]').length,7);
    assert.doesNotMatch(dom.window.document.querySelector('.is-ranked').textContent,/20 questions|3 daily|left today/);
    await click('.is-ranked .mode-primary');
    assert.equal(path,'/learn/trainer/ranked/play');
    await settle(()=>Boolean(dom.window.document.querySelector('.ff-intro input')));
    assert.ok(dom.window.document.querySelector('.ff-arena'));
    assert.equal(dom.window.document.querySelector('.trainer-actions'),null);
    await act(async()=>{dom.window.document.querySelector('.ff-intro input').click();});
    await click('.ff-intro .setup-start');
    await settle(()=>Boolean(dom.window.document.querySelector('.ff-actions button')));
    let session=await getSession(); assert.equal(session.status,'active');
    assert.equal(dom.window.document.querySelectorAll('.ff-opponent').length,5);
    assert.match(dom.window.document.body.textContent,/Postflop uses balanced policy|タイプは実際/);
    // Server-issued Fold settles current hand and immediately provides a new hand.
    for(let i=0;i<3;i++) {
      const oldId=session.hand.id;
      const action=dom.window.document.querySelector('.ff-action-fold')??dom.window.document.querySelector('.ff-actions button');
      await act(async()=>action.click()); await settle(()=>!dom.window.document.querySelector('.ff-actions button')?.disabled); session=await getSession();
      if(action.classList.contains('ff-action-fold')) assert.notEqual(session.hand.id,oldId);
    }
    const handId=session.hand.id;
    await click('.ff-table-top button'); await settle(()=>!dom.window.document.querySelector('.ff-table-top button')?.disabled); session=await getSession(); assert.equal(session.status,'paused');assert.equal(session.hand.id,handId);
    await act(async()=>root.unmount()); root=createRoot(dom.window.document.getElementById('root'));
    await act(async()=>render()); await settle(()=>Boolean(dom.window.document.querySelector('.ff-table-top button'))); assert.match(dom.window.document.body.textContent,/Paused|一時停止中/);
    await click('.ff-table-top button'); await settle(()=>!dom.window.document.querySelector('.ff-table-top button')?.disabled); session=await getSession(); assert.equal(session.status,'active');assert.equal(session.hand.id,handId);
    // The formerly saved quiz result URL must render FastFold and redirect to play.
    path='/learn/trainer/ranked/play/result'; await act(async()=>render()); assert.equal(path,'/learn/trainer/ranked/play'); assert.ok(dom.window.document.querySelector('.ff-arena'));
    assert.ok(server.calls.every(call=>!String(call.url).includes('/v1/ranked/matches')));
    assert.equal(server.sqlite.prepare("SELECT COUNT(*) n FROM ranked_matches").get()?.n??0,0);
  } finally {
    await act(async()=>root.unmount());dom.window.close();Object.assign(globalThis,previous);delete globalThis.IS_REACT_ACT_ENVIRONMENT;server.sqlite.close();
  }
});

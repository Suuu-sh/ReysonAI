import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('standalone on-demand boot is lazy and selected before ProductApp preflop loading',()=>{
 const main=readFileSync(new URL('../src/main.tsx',import.meta.url),'utf8');
 assert.ok(main.includes('lazy(() => import("./estimated/Aiv2OnDemandApp.tsx"))'));
 assert.ok(main.includes('=== "/analyze/ondemand"'));
 const render=main.slice(main.indexOf('createRoot('));
 assert.ok(render.indexOf('{isOnDemandRoute')<render.indexOf(': isProductRoute'));
 assert.ok(render.indexOf('<Aiv2OnDemandApp />')<render.indexOf('<ProductApp />'));
 const app=readFileSync(new URL('../src/estimated/Aiv2OnDemandApp.tsx',import.meta.url),'utf8');
 assert.ok(app.includes('["session","verification"].includes(account.error)?null:account.user'));assert.ok(app.includes('void refreshAccount()'));assert.ok(app.includes('await startGoogleSignIn()'));assert.ok(app.includes('<Aiv2OnDemandWorkspace/>'));assert.ok(app.includes('href="/analyze/ranges"'));
 assert.ok(!app.includes('preloadDatasets('));assert.ok(!app.includes('configureDatasetSource('));assert.ok(!app.includes('saveRangeSource('));assert.ok(!app.includes('importGuestData('));assert.ok(!app.includes('localStorage'));
 const workspace=readFileSync(new URL('../src/estimated/RangeWorkspace.tsx',import.meta.url),'utf8');
 assert.ok(workspace.includes('href="/analyze/ondemand"'));
});


test('standalone layout scopes document flow and gives the matrix an explicit square',()=>{
 const css=readFileSync(new URL('../src/estimated/aiv2-ondemand.css',import.meta.url),'utf8');
 const app=readFileSync(new URL('../src/estimated/Aiv2OnDemandApp.tsx',import.meta.url),'utf8');
 const workspace=readFileSync(new URL('../src/estimated/Aiv2OnDemandWorkspace.tsx',import.meta.url),'utf8');
 assert.ok(app.includes('shell aiv2-ondemand-header'));assert.ok(app.includes('className="aiv2-ondemand-brand"'));
 assert.ok(workspace.includes('shell aiv2-ondemand-workspace'));assert.ok(workspace.includes('import "./aiv2-ondemand.css"'));
 assert.ok(css.includes('aspect-ratio: 1'));assert.ok(css.includes('grid-template-rows: repeat(13, minmax(0, 1fr))'));
 assert.ok(css.includes('min-height: 260px'));assert.ok(css.includes('height: auto'));
 assert.ok(!/^\.matrix(?:\s|\s*\{)/m.test(css));
});

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

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
test('on-demand old address redirects to existing solver, with no second app or navigation link',()=>{
 const main=readFileSync(new URL('../src/main.tsx',import.meta.url),'utf8');
 assert.ok(main.includes('=== "/analyze/ondemand"'));assert.ok(main.includes('window.history.replaceState(null, "", "/analyze/ranges" + window.location.search + window.location.hash)'));
 assert.ok(!main.includes('import("./estimated/Aiv2OnDemandApp.tsx")'));assert.ok(!existsSync(new URL('../src/estimated/Aiv2OnDemandApp.tsx',import.meta.url)));
 const workspace=readFileSync(new URL('../src/estimated/RangeWorkspace.tsx',import.meta.url),'utf8');assert.ok(!workspace.includes('href="/analyze/ondemand"'));assert.ok(!workspace.includes('return <Aiv2OnDemandWorkspace />'));
 const slot=readFileSync(new URL('../src/estimated/Aiv2OnDemandWorkspace.tsx',import.meta.url),'utf8');assert.ok(slot.includes('selection:location'));assert.ok(!slot.includes('<form'));assert.ok(!slot.includes('<nav'));assert.ok(!slot.includes('<input'));assert.ok(!slot.includes('browseActions('));
 assert.ok(workspace.includes('key={JSON.stringify([onDemandNavigation.board,onDemandNavigation.path,account.user?.id])}'));
});
test('inline matrix has a scoped visible square, without global matrix layout changes',()=>{
 const css=readFileSync(new URL('../src/estimated/aiv2-ondemand.css',import.meta.url),'utf8');assert.ok(css.includes('aspect-ratio: 1'));assert.ok(css.includes('grid-template-rows: repeat(13, minmax(0, 1fr))'));assert.ok(css.includes('min-height: 260px'));assert.ok(!/^\.matrix(?:\s|\s*\{)/m.test(css));
});

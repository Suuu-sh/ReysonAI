import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../src/estimated/RangeWorkspace.tsx',import.meta.url),'utf8');
test('bounded preflop rewinds and choices reset postflop and retain range selection contracts',()=>{
 const rewind=source.slice(source.indexOf('function rewindToActionBlock'),source.indexOf('function selectFourBet'));
 const bounded=rewind.slice(rewind.indexOf("setShowFlop(false)"));
 assert.match(bounded,/setShowFlop\(false\)/);
 assert.match(bounded,/setFlopDialogOpen\(false\)/);
 assert.match(bounded,/setFlopActions\(\[\]\)/);
 assert.match(bounded,/setTurnActions\(\[\]\)/);
 assert.match(bounded,/setRiverActions\(\[\]\)/);
 assert.match(bounded,/setSelectedRangeBlock\(current => current === block.key \? null : block.key\)/);
 assert.match(rewind,/const transition = rewindActionBlockTransition[\s\S]*setContinuationActions\(\[\]\)/);
 const choice=source.match(/onBoundedContinuation=\{\(block, action\) => \{([\s\S]*?)\n\s*\}\}/)[1];
 for(const token of ['setShowFlop(false)','setFlopDialogOpen(false)','setFlopActions([])','setTurnActions([])','setRiverActions([])','setSelectedRangeBlock(null)'])assert.ok(choice.includes(token));
});

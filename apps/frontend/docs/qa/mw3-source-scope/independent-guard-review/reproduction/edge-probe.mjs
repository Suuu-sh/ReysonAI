import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const root='/workspace/scratch/08c72b2d7549/mw3_scope_revision_review';
const {sourcePathsFor}=await import(pathToFileURL(root+'/apps/frontend/scripts/postflop-ai/mw3-reviewed-snapshot.mjs'));
const recipe='scripts/data/mw3-co-btn-bb-authored.mjs';
const identity={sourceFiles:[recipe]},file=root+'/apps/frontend/src/estimated/mw3-browser.ts',before=readFileSync(file);
const baseline=sourcePathsFor(identity),results=[];
for(const [name,statement] of [
 ['plain-dynamic',"const probe=import('./Mw3RangeView.tsx');"],
 ['comment-dynamic',"const probe=import(/* UI bridge */ './Mw3RangeView.tsx');"],
 ['template-dynamic','const probe=import(`./Mw3RangeView.tsx`);'],
 ['comment-static',"import/* UI bridge */{ Ui }from'./Mw3RangeView.tsx';"],
 ['plain-static',"import { Ui } from './Mw3RangeView.tsx';"],
]) {
 try {writeFileSync(file,Buffer.concat([before,Buffer.from('\n'+statement+'\n')]));let error=null,paths;try{paths=sourcePathsFor(identity)}catch(e){error=e.message}results.push({name,statement,rejected:!!error,error,unchanged_closure:paths?JSON.stringify(paths)===JSON.stringify(baseline):null});}finally{writeFileSync(file,before)}
}
assert.deepEqual(readFileSync(file),before);console.log(JSON.stringify(results,null,2));

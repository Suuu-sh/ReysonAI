import { writeFileSync } from 'node:fs';
import { capturePilot1755Source } from '../../hu-model11-prefix-key-execution/apps/frontend/scripts/postflop-ai/model11-allboard-lanes.mjs';
const source = capturePilot1755Source();
writeFileSync(new URL('./source-identity.json', import.meta.url), JSON.stringify(source,null,2)+'\n', {flag:'wx'});
console.log(JSON.stringify({identityHash:source.identityHash,numericalGeneration:false}));

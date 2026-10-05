// Synthetic test-only saved-policy fixture. Never publish this policy as reviewed production data.
import source0 from "../../../frontend/src/estimated/opening-ranges.json" with {type:"json"};
import source1 from "../../../frontend/src/estimated/preflop-ranges.json" with {type:"json"};
import source2 from "../../../frontend/src/estimated/three-bet-responses.json" with {type:"json"};
import source3 from "../../../frontend/src/estimated/four-bet-responses.json" with {type:"json"};
import source4 from "../../../frontend/src/estimated/five-bet-responses.json" with {type:"json"};
import source5 from "../../../frontend/src/estimated/limp-responses.json" with {type:"json"};
import source6 from "../../../frontend/src/estimated/limp-deep-responses.json" with {type:"json"};
import source7 from "../../../frontend/src/estimated/multiway-responses.json" with {type:"json"};
import source8 from "../../../frontend/src/estimated/squeeze-responses.json" with {type:"json"};
import source9 from "../../../frontend/src/estimated/cold-three-bet-responses.json" with {type:"json"};
import { playHand, type HumanAction } from '../../../frontend/src/agent/hand.ts';
import { createAgent, makePostflopKit } from '../../../frontend/src/agent/policy.ts';
import { buildInputs, sha } from '../../../frontend/scripts/postflop-ai/browser-inputs.ts';
import { referencePolicyFor } from '../../../frontend/scripts/postflop-ai/policy.ts';
import { referenceLaterPolicy } from '../../../frontend/scripts/postflop-ai/later-policy.ts';
import type { SourceDataset } from '../../../frontend/scripts/postflop-ai/types.ts';
const raw=JSON.stringify({"opening-ranges":source0,"preflop-ranges":source1,"three-bet-responses":source2,"four-bet-responses":source3,"five-bet-responses":source4,"limp-responses":source5,"limp-deep-responses":source6,"multiway-responses":source7,"squeeze-responses":source8,"cold-three-bet-responses":source9});
export const scenarios:Record<string,HumanAction[]>={
 checkdown:['call','check','check','check'], facing:['call','check'],
 callThrough:['call','check','call','check','call','check','call'],
 checkRaise:['call','check','raise'], reRaise:['call','check','raise','raise'], foldFacing:['call','check','fold']
};
export function benchmarkReplay(name:string, clock:()=>number=()=>0){
 const begin=clock();const data=JSON.parse(raw) as Record<string,SourceDataset>;const parsed=clock();
 const inputs=buildInputs('BTN_open_BB_call',data),flop=referencePolicyFor(inputs.spot.tree),later=referenceLaterPolicy();
 const kit=makePostflopKit(inputs.spot.id,data,{policy:flop,metadata:{source_hash:inputs.fingerprint,policy_hash:sha(flop)}},{policy:later,metadata:{source_hash:inputs.fingerprint,flop_policy_hash:sha(flop),policy_hash:sha(later)}});
 if(!kit)throw Error('invalid_benchmark_kit');const prepared=clock();
 const result=playHand({seed:'synthetic-private-test-only',human:'BB',humanActions:scenarios[name],agents:createAgent(),datasets:n=>data[n],postflop:()=>kit,fastFold:true,
 dealt:{hole:{UTG:[0,5],HJ:[8,13],CO:[16,21],BTN:[48,44],SB:[24,29],BB:[36,40]},board:[37,41,12,15,27]},draw:i=>i===3||(name!=='checkdown'&&i>=5)?.99:0});
 const finished=clock();return {status:result.status,board:result.board,pending:result.pending,showdown:result.showdown,returns:result.returns,rake:result.rake,
 timing:{parseMs:parsed-begin,kitMs:prepared-parsed,replayMs:finished-prepared,totalMs:finished-begin}};
}
export default {fetch(request:Request){const name=new URL(request.url).searchParams.get('scenario')??'checkdown';if(!Object.hasOwn(scenarios,name))return new Response('unknown scenario',{status:400});return Response.json(benchmarkReplay(name));}};

import { RANKED_LENGTH } from '../../../shared/ranked-rules.ts';

export type RankedQuestion = { spotId: string; hand: string; mix: Record<string, number> };

const primary = (mix: Record<string, number>) => Object.entries(mix).sort((a,b)=>b[1]-a[1])[0][0];
const grid = [...'AKQJT98765432'];
const hands = grid.flatMap((a,r)=>grid.map((b,c)=>r===c?a+b:r<c?a+b+'s':b+a+'o'));

export function questionPool(source:{spots:Array<{id:string;hands:Array<Record<string,unknown>>}>},kind:string) {
  if (!Array.isArray(source.spots) || !source.spots.length) throw new Error("invalid_ranked_dataset");
  return source.spots.map(spot=>{
    const questions = spot.hands.map(row=>({spotId:spot.id,hand:String(row.hand),mix:Object.fromEntries((kind==='open'?['fold','open']:['fold','call','three_bet']).map(action=>[action,Number(row[action])/100]))}));
    if (questions.length !== 169 || new Set(questions.map(q=>q.hand)).size !== 169 || questions.some(q=>!hands.includes(q.hand) || Object.values(q.mix).some(v=>!Number.isFinite(v)||v<0||v>1) || Object.values(q.mix).reduce((a,b)=>a+b,0)>1.001)) throw new Error('invalid_ranked_dataset');
    // SB may put mass into limp, which this drill does not offer. Condition on the
    // offered choices; all-limp hands have no answer and are never issued.
    const valid = questions.filter(q=>Object.values(q.mix).reduce((a,b)=>a+b,0)>0).map(q=>{
      const total=Object.values(q.mix).reduce((a,b)=>a+b,0);
      return {...q,mix:Object.fromEntries(Object.entries(q.mix).map(([key,value])=>[key,value/total]))};
    });
    if (!valid.length) throw new Error('invalid_ranked_dataset');
    const byHand = new Map(valid.map(q=>[q.hand,q]));
    return valid.map(q=>{
      const index=hands.indexOf(q.hand),r=Math.floor(index/13),c=index%13,main=primary(q.mix);
      const edge=[[-1,0],[1,0],[0,-1],[0,1]].some(([dr,dc])=>r+dr>=0&&r+dr<13&&c+dc>=0&&c+dc<13&&byHand.has(hands[(r+dr)*13+c+dc])&&primary(byHand.get(hands[(r+dr)*13+c+dc])!.mix)!==main);
      return {...q,weight:Math.max(...Object.values(q.mix))<.95?4:edge?3:main==='fold'?.15:.6};
    });
  });
}

export function gradeRanked(questions:RankedQuestion[], actions:unknown) {
  if(!Array.isArray(actions)||actions.length!==RANKED_LENGTH||questions.length!==RANKED_LENGTH) throw new Error('complete_match_required');
  return questions.map((q,index)=>{
    const action=actions[index];
    if(typeof action!=='string'||!Object.hasOwn(q.mix,action)) throw new Error('invalid_action');
    const top=Math.max(...Object.values(q.mix)),freq=q.mix[action];
    return {mix:q.mix,score:freq>=top-.05?1:freq>=.2?.5:0};
  });
}

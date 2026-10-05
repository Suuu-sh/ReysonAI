import { evaluate } from '../../frontend/scripts/lib/equity.ts';

// All accounting is in integer hundredths of a BB. Identity, randomness,
// authentication, clocks and persistence belong to the orchestrator, never here.
export const POSITIONS = ['UTG','HJ','CO','BTN','SB','BB'] as const;
export type Position = typeof POSITIONS[number];
export type Street = 'preflop'|'flop'|'turn'|'river';
export type Seat = { initial: number; stack: number; committed: number; streetBet: number; folded: boolean; actedAt: number|null; checked: boolean; autoFold: boolean };
export type Pot = { amount: number; rake: number; eligible: number[]; winners: number[] };
export type Result = { showdown: boolean; rake: number; payouts: number[]; net: number[]; pots: Pot[]; winners: number[]; scores: Array<number|null> };
export type Entry = { seat: number; street: Street; action: string; to: number; pot: number };
export type MultiplayerHand = { id: string; seats: Seat[]; hole: number[][]; runout: number[]; street: Street; boardCount: number; currentBet: number; minRaise: number; turn: number|null; status: 'playing'|'done'; log: Entry[]; result: Result|null };
export type Action = { type: 'fold'|'check'|'call'|'raise'|'all_in'; to?: number };
export type Option = { key: string; to?: number; amount?: number };
const STREETS: Street[] = ['preflop','flop','turn','river'];
const clone = (hand: MultiplayerHand): MultiplayerHand => JSON.parse(JSON.stringify(hand)) as MultiplayerHand;
const sum = (xs: number[]) => xs.reduce((a,b)=>a+b,0);
const potOf = (h: MultiplayerHand) => sum(h.seats.map(s=>s.committed));
const live = (h: MultiplayerHand) => h.seats.map((s,i)=>!s.folded?i:-1).filter(i=>i>=0);
const active = (h: MultiplayerHand) => live(h).filter(i=>h.seats[i].stack>0);
const need = (h: MultiplayerHand,i:number) => !h.seats[i].folded&&h.seats[i].stack>0&&(h.seats[i].actedAt===null||h.seats[i].streetBet<h.currentBet);
const next = (h: MultiplayerHand,from:number) => { for(let n=1;n<=6;n++){const i=(from+n)%6;if(need(h,i))return i;}return null; };
const integer = (n:number) => Number.isSafeInteger(n)&&n>=0;
const assertSeat = (i:number) => {if(!Number.isInteger(i)||i<0||i>=6)throw Error('invalid_seat');};
function pay(h:MultiplayerHand,i:number,to:number){const s=h.seats[i],amount=to-s.streetBet;if(!integer(to)||amount<0||amount>s.stack)throw Error('invalid_wager');s.stack-=amount;s.committed+=amount;s.streetBet=to;}
function rights(h:MultiplayerHand,i:number){const s=h.seats[i];return s.actedAt===null||h.currentBet-s.actedAt>=h.minRaise;}
function mayRaise(h:MultiplayerHand,i:number){return rights(h,i)&&active(h).some(j=>j!==i)&&h.seats[i].streetBet+h.seats[i].stack>h.currentBet;}
// A unique highest contribution on this street is uncalled, irrespective of
// whether the betting ends by a fold or all-in runout. Return it before sidepots.
function refund(h:MultiplayerHand){
 const ordered=h.seats.map((s,i)=>({i,n:s.streetBet})).sort((a,b)=>b.n-a.n);
 const amount=ordered[0].n-ordered[1].n;if(amount>0){const s=h.seats[ordered[0].i];s.streetBet-=amount;s.committed-=amount;s.stack+=amount;}
}
function finish(h:MultiplayerHand,showdown:boolean){
 refund(h);const contenders=live(h);if(!contenders.length)throw Error('no_contender');
 if(showdown)h.boardCount=5;
 const total=potOf(h),rake=h.boardCount>=3?Math.min(300,Math.floor(total*5/100)):0;
 const scores:Array<number|null>=h.seats.map((s,i)=>showdown&&!s.folded?evaluate([...h.hole[i],...h.runout]):null);
 const pots:Pot[]=[];
 if(!showdown)pots.push({amount:total,rake,eligible:contenders,winners:[contenders[0]]});
 else{
  let previous=0;
  for(const level of [...new Set(h.seats.map(s=>s.committed).filter(n=>n>0))].sort((a,b)=>a-b)){
   const contributors=h.seats.map((s,i)=>s.committed>=level?i:-1).filter(i=>i>=0);
   const eligible=contributors.filter(i=>!h.seats[i].folded);
   if(!eligible.length)throw Error('orphan_side_pot');
   const best=Math.max(...eligible.map(i=>scores[i]!));
   pots.push({amount:(level-previous)*contributors.length,rake:0,eligible,winners:eligible.filter(i=>scores[i]===best)});previous=level;
  }
  // Allocate capped rake proportionally to all pots; largest fractional remainder
  // first (lower pot breaks ties), so no small-stack main pot bears all the rake.
  let allocated=0;for(const p of pots){p.rake=total?Math.floor(p.amount*rake/total):0;allocated+=p.rake;}
  const order=pots.map((p,i)=>({i,remainder:total?p.amount*rake%total:0})).sort((a,b)=>b.remainder-a.remainder||a.i-b.i);
  for(let n=0;n<rake-allocated;n++)pots[order[n].i].rake++;
 }
 const payouts=Array(6).fill(0) as number[];
 for(const p of pots){const available=p.amount-p.rake,share=Math.floor(available/p.winners.length),odd=available%p.winners.length;
  // Dealer is BTN (3): first eligible seat clockwise is SB, then BB, UTG...
  const winners=[...p.winners].sort((a,b)=>(a-4+6)%6-(b-4+6)%6);
  winners.forEach((i,n)=>{payouts[i]+=share+(n<odd?1:0);});
 }
 const net=h.seats.map((s,i)=>payouts[i]-s.committed);
 if(sum(net)!==-rake)throw Error('non_conserving_settlement');
 h.seats.forEach((s,i)=>{s.stack+=payouts[i];});
 h.result={showdown,rake,payouts,net,pots,winners:[...new Set(pots.flatMap(p=>p.winners))],scores};h.status='done';h.turn=null;
}
function progress(h:MultiplayerHand,from:number){
 if(live(h).length===1){finish(h,false);return;}
 const available=active(h);
 // A lone player with chips cannot bet into opponents who are all-in. They
 // must still answer an outstanding wager before a free runout is possible.
 if(available.length<=1&&(!available.length||h.seats[available[0]].streetBet>=h.currentBet)){
  refund(h);finish(h,true);return;
 }
 const pending=next(h,from);
 if(pending!==null){h.turn=pending;return;}
 refund(h);
 if(h.street==='river'){finish(h,true);return;}
 h.street=STREETS[STREETS.indexOf(h.street)+1];h.boardCount=h.street==='flop'?3:h.street==='turn'?4:5;h.currentBet=0;h.minRaise=100;
 h.seats.forEach(s=>{s.streetBet=0;s.actedAt=null;s.checked=false;});
 h.turn=next(h,3); // first live/actionable seat clockwise after BTN
}
function apply(h:MultiplayerHand,i:number,a:Action){
 assertSeat(i);if(h.status!=='playing'||h.turn!==i||!need(h,i))throw Error('not_your_turn');
 const s=h.seats[i],owed=Math.max(0,h.currentBet-s.streetBet),max=s.streetBet+s.stack;
 let type=a.type;if(type==='all_in')type=max<=h.currentBet?'call':'raise';
 if(type==='fold'){s.folded=true;s.actedAt=h.currentBet;s.checked=false;}
 else if(type==='check'){if(owed)throw Error('cannot_check');s.actedAt=h.currentBet;s.checked=true;}
 else if(type==='call'){if(!owed)throw Error('nothing_to_call');pay(h,i,Math.min(max,h.currentBet));s.actedAt=h.currentBet;s.checked=false;}
 else if(type==='raise'){
  const to=a.type==='all_in'?max:a.to;
  if(to==null||!integer(to)||to<=h.currentBet||to>max||!mayRaise(h,i))throw Error('invalid_raise');
  const increment=to-h.currentBet;
  if(increment<h.minRaise&&to!==max)throw Error('raise_below_minimum');
  pay(h,i,to);h.currentBet=to;if(increment>=h.minRaise)h.minRaise=increment;
  s.actedAt=h.currentBet;s.checked=false;
 }else throw Error('invalid_action');
 h.log.push({seat:i,street:h.street,action:a.type,to:s.streetBet,pot:potOf(h)});progress(h,i);
}
// Disconnects are queued for the next legal turn. An all-in player remains in
// showdown; folding them or an out-of-turn aggressor fabricates side-pot rights.
function drain(h:MultiplayerHand){
 for(let n=0;h.status==='playing'&&h.turn!==null&&h.seats[h.turn].autoFold;n++){
  if(n>24)throw Error('invalid_auto_progress');apply(h,h.turn,{type:'fold'});
 }
}
export function createHand({id,deck,serverDeck,stacks=Array(6).fill(10000)}:{id:string;deck?:number[];serverDeck?:number[];stacks?:number[]}):MultiplayerHand{
 const cards=deck??serverDeck;if(typeof id!=='string'||!id||!cards||cards.length!==52||new Set(cards).size!==52||cards.some(c=>!Number.isInteger(c)||c<0||c>=52)||stacks.length!==6||stacks.some(n=>!integer(n)||n<100))throw Error('invalid_deal');
 const h:MultiplayerHand={id,seats:stacks.map(initial=>({initial,stack:initial,committed:0,streetBet:0,folded:false,actedAt:null,checked:false,autoFold:false})),hole:Array.from({length:6},(_,i)=>[cards[i],cards[i+6]]),runout:cards.slice(12,17),street:'preflop',boardCount:0,currentBet:100,minRaise:100,turn:0,status:'playing',log:[],result:null};
 pay(h,4,50);pay(h,5,100);return h;
}
export function legalActions(h:MultiplayerHand,i=h.turn):Option[]{
 if(i===null||h.status!=='playing'||h.turn!==i)return [];assertSeat(i);
 const s=h.seats[i],owed=Math.max(0,h.currentBet-s.streetBet),max=s.streetBet+s.stack;
 const options:Option[]=[{key:'fold'},{key:owed?'call':'check',...(owed?{to:Math.min(owed,s.stack)/100,amount:Math.min(owed,s.stack)}:{})}];
 if(mayRaise(h,i)){
  const minimum=h.currentBet+h.minRaise;
  const proposed=[minimum,h.currentBet+Math.max(h.minRaise,Math.floor((potOf(h)+owed)/2)),h.currentBet+Math.max(h.minRaise,potOf(h)+owed)];
  // Opening sizing uses 2.5BB/3BB; postflop remains min/half-pot/pot.
  if(h.street==='preflop'&&h.currentBet===100)proposed.push(250,300);
  for(const to of [...new Set(proposed)].sort((a,b)=>a-b))if(to>=minimum&&to<max)options.push({key:`raise_${to}`,to:to/100,amount:to});
  options.push({key:'all_in',to:max/100,amount:max});
 }else if(owed&&max<=h.currentBet)options.push({key:'all_in',to:max/100,amount:max});
 return options;
}
export function applyAction(state:MultiplayerHand,i:number,action:string|Action):MultiplayerHand{
 let a:Action;
 if(typeof action!=='string')a=action;
 else if(/^raise_\d+$/.test(action))a={type:'raise',to:Number(action.slice(6))};
 else if(['fold','check','call','all_in'].includes(action))a={type:action as Action['type']};
 else throw Error('invalid_action');
 const h=clone(state);apply(h,i,a);drain(h);return h;
}
export function forfeit(state:MultiplayerHand,i:number):MultiplayerHand{
 assertSeat(i);const h=clone(state);if(h.status==='done'||h.seats[i].folded)return h;
 h.seats[i].autoFold=true;drain(h);return h;
}
export function legalPending(h:MultiplayerHand){return h.turn===null?null:{seat:h.turn,position:POSITIONS[h.turn],street:h.street,pot:potOf(h)/100,toCall:Math.max(0,h.currentBet-h.seats[h.turn].streetBet)/100,options:legalActions(h)};}
export function publicProjection(h:MultiplayerHand,hero?:number){
 if(hero!==undefined)assertSeat(hero);
 const holeCards:Partial<Record<Position,number[]>>={};
 h.seats.forEach((s,i)=>{if(i===hero||h.result?.showdown&&!s.folded)holeCards[POSITIONS[i]]=[...h.hole[i]];});
 return {id:h.id,status:h.status,street:h.street,board:h.runout.slice(0,h.boardCount),holeCards,seats:h.seats.map((s,i)=>({position:POSITIONS[i],stack:s.stack/100,committed:s.committed/100,bet:s.streetBet/100,folded:s.folded,departed:s.autoFold,allIn:!s.folded&&s.stack===0})),pending:legalPending(h),log:h.log.map(entry=>({...entry})),result:h.result?JSON.parse(JSON.stringify(h.result)) as Result:null};
}
export const act=applyAction;
export const legal=legalActions;
export const view=publicProjection;

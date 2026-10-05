import test from 'node:test';
import assert from 'node:assert/strict';
import { createHand, applyAction as act, forfeit, legalActions, publicProjection as view, legalPending } from '../src/multiplayer-engine.ts';
const ordinary=Array.from({length:52},(_,i)=>i);
const royal=[35,39,43,47,51];
const deckWith=(hole=ordinary.slice(0,12),board=royal)=>{const prefix=[...hole,...board];return [...prefix,...ordinary.filter(c=>!prefix.includes(c))];};
const sum=xs=>xs.reduce((a,b)=>a+b,0);
const create=(opts={})=>createHand({id:'test',deck:deckWith(),...opts});
const doAct=(h,action)=>act(h,h.turn,action);
function finishChecks(h){for(let n=0;h.status!=='done';n++){assert.ok(n<60);h=doAct(h,legalActions(h).some(o=>o.key==='check')?'check':'call');}return h;}
const conserved=h=>{assert.equal(sum(h.result.net)+h.result.rake,0);assert.equal(sum(h.seats.map(s=>s.stack)),sum(h.seats.map(s=>s.initial))-h.result.rake);assert.equal(sum(h.result.payouts)+h.result.rake,sum(h.seats.map(s=>s.committed)));};

test('six 100BB seats, exact blinds, UTG first, injected private deck and immutable JSON replay',()=>{
 const h=create();assert.equal(h.turn,0);assert.equal(h.seats.length,6);assert.equal(h.seats[4].stack,9950);assert.equal(h.seats[5].stack,9900);
 assert.equal(legalPending(h).toCall,1);assert.ok(legalActions(h).some(o=>o.key==='raise_250'));
 assert.equal(view(h,0).board.length,0);assert.deepEqual(Object.keys(view(h,0).holeCards),['UTG']);assert.equal(view(h).holeCards.UTG,undefined);
 const before=JSON.stringify(h),next=act(h,0,'call');assert.equal(JSON.stringify(h),before);assert.deepEqual(next,act(JSON.parse(before),0,'call'));
 assert.throws(()=>act(h,1,'call'),/not_your_turn/);assert.throws(()=>doAct(h,'check'),/cannot_check/);
 assert.throws(()=>create({deck:ordinary.map(()=>0)}),/invalid_deal/);assert.throws(()=>create({stacks:[99,100,100,100,100,100]}),/invalid_deal/);
});
test('all fold preserves blind-option player, refunds uncalled BB, no flop no rake',()=>{
 let h=create();for(let i=0;i<5;i++)h=doAct(h,'fold');
 assert.equal(h.status,'done');assert.equal(h.result.showdown,false);assert.equal(h.boardCount,0);assert.equal(h.seats[5].committed,50);
 assert.deepEqual(h.result.net,[0,0,0,0,-50,50]);assert.equal(h.result.rake,0);conserved(h);
 assert.deepEqual(Object.keys(view(h,4).holeCards),['SB']);assert.equal(view(h,4).board.length,0);
});
test('preflop last BB option and each postflop starts first live SB clockwise',()=>{
 let h=create();for(let i=0;i<5;i++)h=doAct(h,'call');assert.equal(h.turn,5);assert.equal(h.street,'preflop');
 h=doAct(h,'check');assert.equal(h.street,'flop');assert.equal(h.turn,4);assert.equal(h.boardCount,3);
 for(let n=0;n<6;n++)h=doAct(h,'check');assert.equal(h.street,'turn');assert.equal(h.turn,4);assert.equal(h.boardCount,4);
 for(let n=0;n<6;n++)h=doAct(h,'check');assert.equal(h.street,'river');assert.equal(h.turn,4);assert.equal(h.boardCount,5);
 for(let n=0;n<6;n++)h=doAct(h,'check');assert.equal(h.result.showdown,true);assert.equal(h.result.rake,30);assert.deepEqual(h.result.net,Array(6).fill(-5));conserved(h);
});
test('full raise updates minimum, illegal non-allin underraise and fractional chips rejected',()=>{
 let h=doAct(create(),'raise_250');assert.equal(h.minRaise,150);assert.equal(h.currentBet,250);
 assert.throws(()=>doAct(h,'raise_399'),/raise_below_minimum/);assert.throws(()=>doAct(h,{type:'raise',to:400.5}),/invalid_raise/);
 h=doAct(h,'raise_400');assert.equal(h.minRaise,150);h=doAct(h,'raise_1000');assert.equal(h.minRaise,600);
 assert.throws(()=>doAct(h,'raise_1599'),/raise_below_minimum/);assert.ok(legalActions(h).some(o=>o.key==='raise_1600'));
});
test('short allin keeps raise size and does not reopen already-acted caller/raiser',()=>{
 let h=create({stacks:[10000,350,400,10000,10000,10000]});h=doAct(h,'raise_300');h=doAct(h,'all_in');h=doAct(h,'all_in');
 assert.equal(h.minRaise,200);for(let n=0;n<3;n++)h=doAct(h,'call');assert.equal(h.turn,0);
 assert.ok(!legalActions(h).some(o=>o.key.startsWith('raise')||o.key==='all_in'));
 assert.throws(()=>doAct(h,'raise_600'),/invalid_raise/);h=doAct(h,'call');assert.equal(h.street,'flop');
 conserved(finishChecks(h));
});
test('cumulative short allins reopen only players facing a full last raise',()=>{
 let h=create({stacks:[10000,400,500,10000,10000,10000]});h=doAct(h,'raise_300');h=doAct(h,'all_in');h=doAct(h,'all_in');for(let n=0;n<3;n++)h=doAct(h,'call');
 assert.equal(h.turn,0);assert.equal(h.minRaise,200);assert.ok(legalActions(h).some(o=>o.key==='raise_700'));h=doAct(h,'raise_700');assert.equal(h.turn,3);
 conserved(finishChecks(h));
});
test('checked seat is not reopened by an incomplete opening allin below one BB',()=>{
 let h=create({stacks:[150,10000,10000,10000,10000,10000]});for(let n=0;n<5;n++)h=doAct(h,'call');h=doAct(h,'check');
 assert.equal(h.turn,4);h=doAct(h,'check');h=doAct(h,'check');assert.equal(h.turn,0);h=doAct(h,'all_in');
 assert.equal(h.currentBet,50);assert.ok(legalActions(h).some(o=>o.key==='raise_150'));
 for(let n=0;n<3;n++)h=doAct(h,'call');assert.equal(h.turn,4);assert.deepEqual(legalActions(h).map(o=>o.key),['fold','call']);
 conserved(finishChecks(h));
});
test('fold skips seat in all remaining streets but hand continues for five real players',()=>{
 let h=doAct(create(),'fold');assert.equal(h.status,'playing');assert.equal(h.turn,1);
 for(let n=0;n<4;n++)h=doAct(h,'call');h=doAct(h,'check');assert.equal(h.turn,4);
 h=finishChecks(h);assert.equal(h.result.net[0],0);assert.equal(h.result.showdown,true);assert.ok(!h.result.pots[0].eligible.includes(0));conserved(h);
});
test('side pots, short allin calls, uncalled excess and capped rake conserve all six stacks',()=>{
 let h=create({stacks:[100,200,300,10000,10000,10000]});h=doAct(h,'all_in');h=doAct(h,'all_in');h=doAct(h,'all_in');h=doAct(h,'fold');h=doAct(h,'fold');h=doAct(h,'call');
 assert.equal(h.status,'done');assert.equal(h.seats[5].committed,300);assert.equal(h.result.rake,47);
 assert.deepEqual(h.result.pots.map(p=>p.amount),[250,200,300,200]);assert.deepEqual(h.result.pots.map(p=>p.eligible),[[0,1,2,5],[0,1,2,5],[1,2,5],[2,5]]);conserved(h);
 // Every seat allin for100BB: max3BB total, not3BB per pot/player.
 h=create();for(let n=0;h.status!=='done';n++){assert.ok(n<6);h=doAct(h,'all_in');}assert.equal(h.result.rake,300);assert.deepEqual(h.result.net,Array(6).fill(-50));conserved(h);
});
test('tied sidepots award indivisible 0.01BB clockwise after BTN, deterministic rake remainder',()=>{
 let h=create({stacks:[101,101,101,10000,10000,10000]});h=doAct(h,'all_in');h=doAct(h,'all_in');h=doAct(h,'all_in');h=doAct(h,'fold');h=doAct(h,'fold');h=doAct(h,'call');
 assert.equal(h.status,'done');const p=h.result.pots.find(p=>p.winners.length===4&&((p.amount-p.rake)%4)>0);assert.ok(p);
 assert.deepEqual(h.result.pots.map(p=>[p.amount,p.rake]),[[250,12],[204,10]]);
 // Each pot leaves two odd pennies: BB then UTG, never HJ/CO.
 assert.deepEqual(h.result.payouts,[109,107,107,0,0,109]);conserved(h);
});
test('unequal hand scores choose best five from seven; weaker short stack cannot win upper sidepot',()=>{
 // Board 2s 3h 4d 8c 9s; UTG AA beats HJ KK, CO QQ, BB JJ.
 const hole=[48,44,40,20,24,36,49,45,41,21,25,37],board=[0,5,10,27,28];
 let h=create({deck:deckWith(hole,board),stacks:[100,200,300,10000,10000,10000]});for(const a of ['all_in','all_in','all_in','fold','fold','call'])h=doAct(h,a);
 assert.equal(h.status,'done');assert.ok(h.result.scores[0]>h.result.scores[1]);assert.deepEqual(h.result.pots.map(p=>p.winners),[[0],[0],[1],[2]]);conserved(h);
});
test('uncalled postflop bet refunded on last fold, flop rake applies only matched money',()=>{
 let h=create();for(const a of ['fold','fold','fold','call','fold','check'])h=doAct(h,a);assert.equal(h.turn,5);
 h=doAct(h,'raise_1000');h=doAct(h,'fold');assert.equal(h.status,'done');assert.equal(h.seats[5].committed,100);assert.equal(h.result.rake,12);assert.equal(h.result.net[5],138);conserved(h);
});
test('offturn departure queues a binding fold, does not remove a live sidepot aggressor prematurely',()=>{
 let h=doAct(create(),'raise_300');const snapshot=JSON.stringify(h);h=forfeit(h,0);assert.equal(h.seats[0].folded,false);assert.equal(h.seats[0].autoFold,true);assert.equal(h.turn,1);assert.equal(JSON.parse(snapshot).seats[0].autoFold,false);
 for(let n=0;n<4;n++)h=doAct(h,'call');h=doAct(h,'raise_600');assert.equal(h.seats[0].folded,true);assert.equal(h.turn,1);conserved(finishChecks(h));
});
test('forfeit on legal turn folds, allin departure stays live and timeout can check',()=>{
 let h=forfeit(create(),0);assert.equal(h.seats[0].folded,true);assert.equal(h.turn,1);h=doAct(h,'all_in');h=forfeit(h,1);assert.equal(h.seats[1].folded,false);
 for(let n=0;h.status!=='done';n++){assert.ok(n<6);h=doAct(h,'call');}assert.equal(h.result.showdown,true);assert.ok(h.result.pots[0].eligible.includes(1));conserved(h);
 assert.deepEqual(forfeit(h,1),h);
});
test('public projection never returns runout/private holes until actual showdown',()=>{
 let h=create();const publicState=view(h,0);assert.ok(!('runout' in publicState));assert.ok(!('hole' in publicState));assert.equal(Object.keys(publicState.holeCards).length,1);
 for(const a of ['call','call','call','call','call','check'])h=doAct(h,a);assert.equal(view(h,0).board.length,3);assert.equal(Object.keys(view(h,0).holeCards).length,1);
 h=finishChecks(h);assert.equal(Object.keys(view(h,0).holeCards).length,6);assert.equal(view(h,0).board.length,5);
});

 test('bounded deterministic six-player action replay terminates, refunds and conserves every chip',()=>{
 let seed=7183;const random=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
 for(let hand=0;hand<160;hand++){
  const deck=[...ordinary];for(let n=51;n>0;n--){const j=random(n+1);[deck[n],deck[j]]=[deck[j],deck[n]];}
  let h=create({deck,stacks:Array.from({length:6},()=>100+random(10000))});
  for(let n=0;h.status!=='done';n++){
   assert.ok(n<160,'bounded hand progress');
   if(random(15)===0)h=forfeit(h,random(6));
   if(h.status==='done')break;
   const options=legalActions(h);assert.ok(options.length>=2);
   h=doAct(h,options[random(options.length)].key);
   if(h.status!=='done')assert.equal(sum(h.seats.map(s=>s.stack+s.committed)),sum(h.seats.map(s=>s.initial)));
  }
  conserved(h);assert.deepEqual(h,JSON.parse(JSON.stringify(h)));
 }
});

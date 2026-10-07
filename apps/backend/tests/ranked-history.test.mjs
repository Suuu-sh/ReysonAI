import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { humanRankFixture } from './fixtures/human-rank.mjs';
import worker from '../src/index.ts';

const api = 'http://localhost:8787/v1/fastfold/human/';
const id = i => `10000000-0000-4000-8000-${String(i).padStart(12,'0')}`;
async function fixture() {
  const f = await humanRankFixture(2);
  for (const file of ['0009_ranked.sql','0010_fastfold.sql']) f.sqlite.exec(readFileSync(new URL('../migrations/'+file, import.meta.url),'utf8'));
  for (let i=0;i<2;i++) {
    f.sqlite.prepare('INSERT INTO human_rank_players(user_id,public_id,public_name) VALUES (?,?,?)').run('U'+i,'public-'+i,'Player '+i);
    f.sqlite.prepare('INSERT INTO ranked_players(user_id,public_name) VALUES (?,?)').run('U'+i,'Player '+i);
    f.sqlite.prepare('INSERT INTO fastfold_players(user_id,public_name) VALUES (?,?)').run('U'+i,'Player '+i);
  }
  const saved = { id:'untrusted-body-id',at:999999,hero:'BTN',netBb:2,ratingEvidenceBb:2,board:['2s','3h','4d'],holeCards:{BTN:['As','Kd'],BB:['Qs','Qh']},showdown:false,log:[{seat:3,street:'preflop',action:'call',private:'HIDDEN'}],seed:'HIDDEN',email:'HIDDEN',user_id:'HIDDEN',private_json:'HIDDEN',futureBoard:['5h','6c'] };
  const insert = (n,user='U0',at=100) => {
    f.sqlite.prepare("INSERT INTO human_rank_tables(id,status,private_json,created_at,expires_at) VALUES (?,'done','{}',1,0)").run(id(n));
    f.sqlite.prepare('INSERT INTO human_rank_results(table_id,user_id,at,net_cents,public_json) VALUES (?,?,?,200,?)').run(id(n),user,at,JSON.stringify(saved));
    f.sqlite.prepare('INSERT INTO fastfold_results(id,user_id,at,net_bb,before_rating,after_rating,public_json) VALUES (?,?,?,2,1000,1001,?)').run(id(n),user,at,JSON.stringify(saved));
    f.sqlite.prepare("INSERT INTO ranked_matches(id,user_id,day,slot,started_at,expires_at,status,questions_json,completed_at,before_rating,after_rating,score) VALUES (?,?,?,1,1,2,'complete','[]',?,1000,1001,15)").run(id(n),user,'test-'+n,at);
  };
  return { ...f,insert };
}
for (const season of ['human-fastfold-v1','fastfold-v1','quiz-v1']) {
  test(`${season}: owner-scoped stable 50-item keyset paging, equal dates, final/empty pages, explicit projection and no writes`, async () => {
    const f=await fixture();try {
      for(let i=1;i<=55;i++)f.insert(i);f.insert(999,'U1',200);
      const before=f.sqlite.prepare('SELECT total_changes() n').get().n;
      const first=await f.call(0,`history?season=${season}`);
      assert.equal(first.season,season);assert.equal(first.items.length,50);assert.equal(first.items[0].id,id(55));assert.equal(first.nextCursor,id(6));
      assert.ok(first.items.every(v=>v.at===100));
      const second=await f.call(0,`history?season=${season}&cursor=${first.nextCursor}`);
      assert.deepEqual(second.items.map(v=>v.id),[5,4,3,2,1].map(id));assert.equal(second.nextCursor,null);
      const end=await f.call(0,`history?season=${season}&cursor=${id(1)}`);assert.deepEqual(end.items,[]);assert.equal(end.nextCursor,null);
      assert.equal(f.sqlite.prepare('SELECT total_changes() n').get().n,before);
      assert.equal(JSON.stringify(first).includes('HIDDEN'),false);assert.equal(JSON.stringify(first).includes('Qs'),false);assert.equal(JSON.stringify(first).includes('futureBoard'),false);
      if(season==='quiz-v1')assert.deepEqual(first.items[0],{id:id(55),at:100,beforeRating:1000,afterRating:1001,answered:20,accuracy:.75});
      else {assert.deepEqual(first.items[0].heroCards,['As','Kd']);assert.deepEqual(first.items[0].log,[{pos:'BTN',street:'preflop',action:'call'}]);}
      await f.call(0,`history?season=${season}&cursor=${id(999)}`,undefined,400);
      await f.call(0,`history?season=${season}&cursor=invalid`,undefined,400);
      assert.equal((await f.call(1,`history?season=${season}`)).items.length,1);
    }finally{f.close();}
  });
}
test('empty history; invalid season/cursor/owner; unauthenticated and expired identity fail closed without exposing records',async()=>{
  const f=await fixture();try{
    const page=await f.call(0,'history');assert.deepEqual(page.items,[]);assert.equal(page.nextCursor,null);
    for(const query of ['season=unknown','cursor=','user_id=U1','limit=500','season=human-fastfold-v1&cursor='+id(404)])await f.call(0,'history?'+query,undefined,400);
    let response=await worker.fetch(new Request(api+'history'),f.env);assert.equal(response.status,401);assert.ok(!('items' in await response.json()));
    f.sqlite.prepare('UPDATE account_sessions SET expires_at=0').run();response=await worker.fetch(new Request(api+'history',{headers:{cookie:'reysonai-dev-session='+f.tokens[0]}}),f.env);assert.equal(response.status,401);
  }finally{f.close();}
});

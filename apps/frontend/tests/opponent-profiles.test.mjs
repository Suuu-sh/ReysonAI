import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, mkdtempSync, copyFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { OPPONENT_PROFILES as profiles, OPPONENT_PROFILE_DATASETS as names, auditOpponentProfiles, opponentProfileReach } from "../src/estimated/opponent-profiles.ts";
import { dataset, loadDataset, datasetNames, opponentProfileDatasetName } from "../src/estimated/datasets.ts";
import { loadOpponentProfileBundles, profileSourceFindings } from "../scripts/lib/opponent-profile-build.mjs";
import { isBlockingAuditFinding } from "../src/estimated/audit.ts";
import { localDatasetsMiddleware } from "../scripts/local-datasets.mjs";
import { routePreflopDatasets } from "../../backend/src/preflop-datasets.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const published = join(root,"src/estimated");
const read = p => JSON.parse(readFileSync(p,"utf8"));
const balanced = Object.fromEntries(names.map(n => [n,read(join(published,`${n}.json`))]));
const bundles = loadOpponentProfileBundles(published);
const errors = data => auditOpponentProfiles(data,balanced).findings.filter(isBlockingAuditFinding);
const row = (data,p,n,id,h) => data[p][n].spots.find(s=>s.id===id).hands.find(r=>r.hand===h);
const clone = () => structuredClone(bundles);
const sha = p => createHash("sha256").update(readFileSync(p)).digest("hex");
function allBalancedFiles(dir=published) {
  return readdirSync(dir,{withFileTypes:true}).flatMap(e => e.name === "profiles" ? [] : e.isDirectory()
    ? allBalancedFiles(join(dir,e.name)) : e.name.endsWith(".json") ? [join(dir,e.name)] : []);
}

test("all 4 × 7 villain datasets, 169 rows per spot and bilingual metadata pass structural audit", () => {
  assert.deepEqual(errors(bundles),[]);
  assert.deepEqual(profileSourceFindings(bundles,published),[]);
  assert.equal(profiles.flatMap(p=>names.flatMap(n=>bundles[p][n].spots)).length,280);
  for(const p of profiles) for(const n of names) {
    const d=bundles[p][n];
    assert.equal(d.spots.length,balanced[n].spots.length);
    assert.equal(d.entry_count,d.spot_count*169);
    for(const s of d.spots) assert.equal(new Set(s.hands.map(r=>r.hand)).size,169);
  }
});

test("generator is deterministic and leaves every balanced dataset and reason byte-identical", () => {
  const originals=Object.fromEntries(allBalancedFiles().map(p=>[p,sha(p)]));
  const dest=mkdtempSync(join(tmpdir(),"opponent-profiles-test-"));
  try {
    for(const n of names) copyFileSync(join(published,`${n}.json`),join(dest,`${n}.json`));
    const source=Object.fromEntries(names.map(n=>[n,sha(join(dest,`${n}.json`))]));
    for(let iteration=0;iteration<2;iteration++) {
      execFileSync("python3",[join(root,"scripts/generate-opponent-profiles.py")],{env:{...process.env,ESTIMATES_DIR:dest},stdio:"pipe"});
      const made=loadOpponentProfileBundles(dest);
      assert.deepEqual(made,bundles);
      assert.deepEqual(errors(made),[]);
      for(const n of names) assert.equal(sha(join(dest,`${n}.json`)),source[n]);
    }
    for(const [p,hash] of Object.entries(originals)) assert.equal(sha(p),hash,p);
    assert.throws(()=>execFileSync("python3",[join(root,"scripts/generate-opponent-profiles.py")],{env:{...process.env,ESTIMATES_DIR:published},stdio:"pipe"}));
  } finally { rmSync(dest,{recursive:true,force:true}); }
});

test("audit rejects coverage, frequency, size, source, stale fact, role and range-flow defects", () => {
  const cases = [
    ["profile-coverage",d=>d.nit["opening-ranges"].spots.pop()],
    ["profile-hand-coverage",d=>d.station["preflop-ranges"].spots[0].hands.pop()],
    ["profile-frequency",d=>row(d,"lag","opening-ranges","BTN_open","AA").open=101],
    ["profile-frequency",d=>row(d,"lag","opening-ranges","BTN_open","AA").open=99.5],
    ["profile-sizing-context",d=>row(d,"maniac","preflop-ranges","BB_vs_BTN","AA").three_bet_size_bb=999],
    ["profile-sizing-context",d=>d.nit["four-bet-responses"].spots[0].source_response_id="missing"],
    ["profile-uncomputed-facts",d=>row(d,"station","five-bet-responses","UTG_vs_HJ_five_bet","AA").equity_vs_shove_pct=83.7],
    ["profile-meta",d=>d.nit.meta.role="exploit"],
    ["profile-meta",d=>delete d.nit.meta.datasets["opening-ranges"].en],
    ["profile-metadata",d=>d.nit["preflop-ranges"].metadata.call_ev_policy={}],
    ["profile-range-flow",d=>{
      const r=row(d,"nit","three-bet-responses","UTG_vs_HJ_three_bet","72o");r.call=10;r.fold=90;
    }],
    ["profile-range-flow",d=>{
      const r=row(d,"nit","limp-deep-responses","BB_vs_SB_limp_five_bet","72o");r.call=10;r.fold=90;
    }],
  ];
  for(const [check,mutate] of cases) { const d=clone(); mutate(d); assert.ok(errors(d).some(f=>f.check===check),check); }
  const stale=clone();stale.nit.meta.balanced_source_sha256["opening-ranges"]="stale";
  assert.equal(profileSourceFindings(stale,published)[0].check,"profile-source");
});

test("archetype mistakes remain authored assumptions, while strength inversions only warn", () => {
  // These wide low-hand calls are deliberate behavioral errors, not candidates
  // for call-EV autofill, a negative-EV gate, or a silent normal-strategy fallback.
  assert.equal(row(bundles,"station","preflop-ranges","BB_vs_BTN","72o").call,65);
  assert.ok(row(bundles,"maniac","four-bet-responses","BB_vs_BTN_four_bet","72o").all_in>0);
  const d=clone(), r=row(d,"nit","opening-ranges","UTG_open","22");r.open=100;r.fold=0;r.open_size_bb=2.5;
  const findings=auditOpponentProfiles(d,balanced).findings;
  assert.ok(findings.some(f=>f.check==="profile-strength-order"&&f.severity==="warn"));
  assert.deepEqual(findings.filter(isBlockingAuditFinding),[]);
});

test("positional contraction never turns premium open responses into accidental folds", () => {
  for (const p of profiles) for (const s of bundles[p]["preflop-ranges"].spots) {
    for (const h of ["AA", "KK", "QQ", "AKs", "AKo"]) {
      const r=s.hands.find(r=>r.hand===h);
      assert.ok(r.fold <= (p === "nit" ? 10 : 0), `${p}/${s.id}/${h}`);
    }
    if (p!=="nit") for (const h of ["JJ", "TT", "AQs", "AQo"]) assert.equal(s.hands.find(r=>r.hand===h).fold,0);
  }
});

test("reach uses the actor's profile, multiplying all its own earlier actions", () => {
  const b=bundles.lag;
  const s=b["five-bet-responses"].spots.find(s=>s.id==="BTN_vs_BB_five_bet");
  const open=row(bundles,"lag","opening-ranges","BTN_open","A5s").open/100;
  const four=row(bundles,"lag","three-bet-responses","BTN_vs_BB_three_bet","A5s").four_bet/100;
  assert.equal(opponentProfileReach(b,"five-bet-responses",s,"A5s"),open*four);
  const l=b["limp-deep-responses"].spots.find(s=>s.id==="SB_vs_BB_limp_four_bet");
  assert.equal(opponentProfileReach(b,"limp-deep-responses",l,"A5s"),
    (row(bundles,"lag","opening-ranges","SB_open","A5s").limp/100) * (row(bundles,"lag","limp-responses","SB_vs_BB_iso","A5s").raise/100));
});

test("dataset registry supports lazy nested villain data without changing standard datasets", async () => {
  const before=dataset("preflop-ranges");
  for(const p of profiles) for(const n of [...names,"meta"]) {
    const key=opponentProfileDatasetName(p,n);
    assert.deepEqual(await loadDataset(key),bundles[p][n]);
    assert.ok((await datasetNames()).includes(key));
  }
  assert.equal(dataset("preflop-ranges"),before);
  assert.throws(()=>opponentProfileDatasetName("unknown","opening-ranges"));
  assert.throws(()=>opponentProfileDatasetName("nit","../opening-ranges"));
});

function local(path) {
  let status=200, body;
  const res={setHeader(){},writeHead(code){status=code;return res;},end(text){body=JSON.parse(text);}};
  localDatasetsMiddleware({url:`/v1/preflop/datasets/${path}`},res,()=>{status=404;});
  return {status,body};
}
test("local and backend routes accept only the bounded profile namespace and reject traversal/invalid encoding", async () => {
  const key="profiles/station/villain/preflop-ranges", text=JSON.stringify(bundles.station["preflop-ranges"]);
  const db={prepare(sql){return {bind(name){return {async all(){return {results:name!==key?[]:sql.includes("dataset_parts")?[{part:0,body:text}]:[{content_hash:"hash",parts:1}]};}};}};}};
  assert.equal(local(key).status,200);
  assert.deepEqual(local(key).body,bundles.station["preflop-ranges"]);
  const api=await routePreflopDatasets(db,`/v1/preflop/datasets/${key}`);
  assert.equal(api.status,200);assert.equal(api.text,text);
  for(const bad of ["profiles/nit/exploit/opening-ranges","profiles/unknown/villain/opening-ranges","profiles/nit/villain/missing","profiles/nit/villain/..%2Fsecret","..%2Fsecret","%ZZ"]) {
    assert.equal(local(bad).status,400,bad);
    assert.equal((await routePreflopDatasets(db,`/v1/preflop/datasets/${bad}`)).status,400,bad);
  }
  assert.equal((await routePreflopDatasets(db,"/v1/preflop/datasets/profiles/nit/villain/opening-ranges")).status,404);
});

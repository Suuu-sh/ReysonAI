// Fresh independent source-context receipts. Run only after all independent review gates pass.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
const [repo,out]=process.argv.slice(2),install=join(out,'install');
const prefix='apps/frontend/docs/qa/mw3-source-scope/independent-guard-review';
const load=name=>import(pathToFileURL(join(repo,'apps/frontend/scripts/postflop-ai',name)));
const {jsonBytes,sha256}=await load('mw3-reviewed-archive.mjs');
const {verifyMw3Snapshot}=await load('mw3-reviewed-snapshot.mjs');
const {clearMw3ContractCache}=await load('mw3-artifacts.mjs');
const {prepareMw3SnapshotDeliveries,mw3DeliveryPins,assertMw3IndependentReceipt,buildMw3DeliverySql}=await load('mw3-reviewed-delivery.mjs');
const readJson=name=>JSON.parse(readFileSync(join(out,name)));
const preservation=readJson('preservation.json'),mutations=readJson('mutation-review.json'),tests=readJson('test-results.json'),codeReview=readJson('code-review.json'),remote=readJson('remote-source-identity.json');
for(const gate of [preservation,mutations,tests,codeReview])assert.equal(gate.status,'PASS');
assert.equal(execFileSync('git',['diff','--name-only'],{cwd:repo,encoding:'utf8'}),'');
assert.equal(execFileSync('git',['diff','--cached','--name-only'],{cwd:repo,encoding:'utf8'}),'');
assert.equal(execFileSync('git',['rev-parse','HEAD^{tree}'],{cwd:repo,encoding:'utf8'}).trim(),preservation.source_tree);
assert.equal(remote.tree,preservation.source_tree);assert.equal(remote.commit,preservation.source_commit);
assert.equal(preservation.subjects.length,16);assert.equal(preservation.joint_warnings,561);
const record=(path,bytes)=>({path,bytes:bytes.length,sha256:sha256(bytes)});
const put=(path,bytes)=>{mkdirSync(dirname(path),{recursive:true});writeFileSync(path,bytes,{flag:'wx'});};
const proofs=[];
for(const name of ['remote-source-identity.json','prior-hash-ledger.json','source-impact.json','preservation.json','mutation-review.json','test-results.json','code-review.json','excluded-inventory-verification.json','escape-probe.json']){
 const bytes=readFileSync(join(out,name));put(join(install,prefix,name),bytes);proofs.push(record(`${prefix}/${name}`,bytes));
}
for(const name of ['collect-independent.mjs','mutation-review.mjs','issue-independent-receipts.mjs','collection.log','frontend-tests-node22.log','backend-tests-node22.log','memory-fixture-node22.log','typecheck.log','edge-probe.mjs','edge-probe-final.json','escape-probe.mjs','initial-review-findings.json','edge-probe.json','absolute-specifier-probe.json'])put(join(install,prefix,'reproduction',name),readFileSync(join(out,name)));
const reviewer='/root/verify_mw3_guard_revision',author='/root/fix_mw3_review_guard',reviewedAt=new Date().toISOString();
const scope=`Independent source-context-only renewal for source commit ${preservation.source_commit}, tree ${preservation.source_tree}. source 範囲を数値生成・検証・配信コードに限定する変更。UI ファイル（.tsx/.css）は対象外。 Renewed protected-to-excluded dependency-edge guard and source-inventory documentation. Original scope reduction removes 96 paths per subject:23 TSX,6 CSS,67 others(59 TS,3 d.mts,3 mjs,1 JSON,1 PNG); removed non-UI application modules are not claimed to be presentation-only. Newly added verification/parser dependencies, if any, are listed in the independent source-impact proof. Retained numerical generation, verification, delivery, browser validation and MW3 Agent execution closure stays bound, including conservative type/declaration and required JSON dependencies. Legitimate UI-only changes preserve numerical acceptance; protected dependencies into excluded UI fail closed under the reviewed syntax contract. All16 subjects,112 saved numerical files/235515283 bytes,16 original canonical gzip archives,32 pins,recipe/profile/input bytes,inherited evidence,561 joint warnings and seven limitations remain unchanged. A distinct actual gpt-6-astra reviewer independently checked code, official saved-byte collection/verification, source closure, mutation negatives, contracts and typechecks. Authorizes installation of these exact manifests, receipts and receipt-derived SQL comments followed by final committed-inventory verification/CI. No strategy generation or renewed quantitative quality decision, no new simulation, actual-D1 execution, live-auth/browser E2E, merge, main change or production operation. Historical quantitative/D1/browser evidence remains historical.`;
const subjects=[];
for(const subject of preservation.subjects){try{
 const manifestBytes=readFileSync(join(out,subject.manifest)),manifest=JSON.parse(manifestBytes),slug=manifest.spot.slug;
 const receiptPath=`configs/mw3-${slug}.review.json`,manifestPath=`artifacts/postflop/mw3-${slug}.manifest.json`,sqlPath=`artifacts/postflop/mw3-${slug}.sql`;
 const priorBytes=readFileSync(join(repo,receiptPath)),prior=JSON.parse(priorBytes);assert.equal(sha256(priorBytes),subject.prior_receipt.sha256);
 const snapshot=verifyMw3Snapshot(manifestBytes,readFileSync(join(repo,manifest.archive.path))),deliveries=await prepareMw3SnapshotDeliveries(snapshot),pins=mw3DeliveryPins(snapshot,deliveries);
 assert.deepEqual(pins,prior.deliveries);assert.deepEqual(snapshot.evidence,prior.evidence);assert.deepEqual(snapshot.evidence.limitations,prior.accepted_limitations);
 for(const key of ['retained_quality_review','compatibility_review'])assert.equal(sha256(readFileSync(join(repo,prior[key].path))),prior[key].sha256);
 const receipt={schema_version:1,kind:'mw3-independent-acceptance',status:'independently-reviewed',strategy_type:'ai_estimate_not_gto',author_model:'gpt-6-astra',reviewer_model:'gpt-6-astra',reviewer_task:reviewer,author_task:prior.author_task,source_tree:manifest.source_tree,scope,
 manifest_sha256:sha256(manifestBytes),archive_sha256:manifest.archive.sha256,content_sha256:manifest.content_sha256,sources_sha256:manifest.sources_sha256,inputs_sha256:manifest.inputs_sha256,spot:manifest.spot.id,
 deliveries:pins,evidence:snapshot.evidence,accepted_limitations:prior.accepted_limitations,retained_quality_review:prior.retained_quality_review,compatibility_review:prior.compatibility_review,raw_artifact_records:prior.raw_artifact_records,historical_receipt:prior.historical_receipt,
 prior_source_context_receipt:{commit:'5478e49ac5281485dea308902449a6a6f69ccf61',...record(receiptPath,priorBytes),source_tree:prior.source_tree,reviewer_task:prior.reviewer_task,provenance:'Exact prior acceptance remains in Git; see the compact prior-hash ledger. No full historical receipt or manifest copies added.'},
 current_context_review:{reviewer_model:'gpt-6-astra',reviewer_task:reviewer,implementation_author_task:author,source_commit:preservation.source_commit,proofs,findings:codeReview.findings,inherited_quality_unchanged:true,numerical_generation:false,new_d1_execution:false,new_live_auth_e2e:false,historical_evidence:'Prior quantitative/D1/browser evidence is preserved through Git provenance, not re-certified for this source head.'},reviewed_at:reviewedAt};
 assert.notEqual(reviewer,author);assertMw3IndependentReceipt(receipt,snapshot,deliveries);
 assert.throws(()=>assertMw3IndependentReceipt({...receipt,manifest_sha256:'0'.repeat(64)},snapshot,deliveries),/Separate matching/);
 for(let changed=0;changed<pins.length;changed++)assert.throws(()=>assertMw3IndependentReceipt({...receipt,deliveries:pins.map((x,i)=>i===changed?{...x,deliveryHash:'0'.repeat(64)}:x)},snapshot,deliveries),/Separate matching/);
 const receiptBytes=jsonBytes(receipt),sql=Buffer.from(buildMw3DeliverySql(snapshot,receipt,deliveries)),oldSql=readFileSync(join(repo,sqlPath));
 const statementBody=b=>b.toString('utf8').split('\n').slice(2).join('\n');assert.equal(statementBody(sql),statementBody(oldSql));assert.equal(sql.toString('utf8').split('\n')[0],oldSql.toString('utf8').split('\n')[0]);
 put(join(install,manifestPath),manifestBytes);put(join(install,receiptPath),receiptBytes);put(join(install,sqlPath),sql);
 subjects.push({spot:subject.spot,manifest:record(manifestPath,manifestBytes),receipt:record(receiptPath,receiptBytes),sql:record(sqlPath,sql),sql_statements_sha256:sha256(Buffer.from(statementBody(sql))),sql_statement_body_unchanged:true,archive:manifest.archive,source_records:manifest.sources.length,sources_sha256:manifest.sources_sha256,content_sha256:manifest.content_sha256,inputs_sha256:manifest.inputs_sha256,receipt_and_pin_mutation_rejected:true});console.log(`Fresh independent protected-edge receipt issued: ${subject.spot}`);
}finally{clearMw3ContractCache();globalThis.gc();}}
const report={schema_version:1,kind:'independent-mw3-protected-edge-acceptance',status:'PASS',reviewer_model:'gpt-6-astra',reviewer_task:reviewer,implementation_author_task:author,reviewed_at:reviewedAt,source_commit:preservation.source_commit,source_tree:preservation.source_tree,scope,proofs,subjects,blocking_findings:[],qualifications:codeReview.qualifications,
preservation:{raw_files:112,raw_bytes:235515283,original_compressed_archives:16,pins:32,joint_warnings:561,accepted_limitations_per_subject:7,sql_statement_bodies_unchanged:true},
install_plan:[`Verify all protected sources match reviewed source tree ${preservation.source_tree}.`,'Install exact files under install/ only, with no archive, registry, input, recipe, profile or source replacement.','Commit on existing PR96 branch and keep Draft with PR44 target.','Run final committed-inventory restore/verify,32-pin parity,frontend/backend contracts,typechecks and UI/protected mutations.','Verify final remote CI for the exact published head; no merge, main, production D1 or deployment.'],remaining_gates:['Final committed-inventory verification after installation','Final remote PR96 CI']};
put(join(out,'review-summary.json'),jsonBytes(report));put(join(install,prefix,'review-summary.json'),jsonBytes(report));
console.log(JSON.stringify({status:'PASS',receipts:16,output:install,summary_sha256:sha256(jsonBytes(report))}));

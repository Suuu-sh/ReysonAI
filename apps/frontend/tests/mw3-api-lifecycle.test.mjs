// Synthetic localhost API controller fixtures only. No Wrangler, real SQL,
// real strategy authoring, acceptance receipt or remote resource is executed.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { assertApiInputLedger } from '../scripts/ci/mw3-api-oracle.mjs';
import { assertCompletedCommand, runSupervisedCommand } from '../scripts/ci/mw3-local-command.mjs';
import { assertApiCompletion, bundleCapturedApiControl, localConfig, runCapturedApiPhase, writeCapturedSources } from '../scripts/ci/mw3-local-d1-oracle.mjs';
import { prepareMw3SnapshotDeliveries } from '../scripts/postflop-ai/mw3-reviewed-delivery.mjs';
import { MW3_TIERS } from '../scripts/postflop-ai/mw3-hand-features.mjs';
import { sha256, jsonBytes } from '../scripts/postflop-ai/mw3-reviewed-archive.mjs';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const record = (path, bytes) => ({ path, bytes: bytes.length, sha256: sha256(bytes) });
function capturedControl() {
  const files = new Map();
  function visit(path) {
    if (files.has(path)) return;
    const body = readFileSync(join(root, path)); files.set(path, body);
    if (!/\.(mjs|js|ts)$/.test(path)) return;
    for (const match of body.toString().matchAll(/(?:\bimport\s+(?:[^;]*?\s+from\s+)?|\bexport\s+[^;]*?\s+from\s+)["']([^"']+)["']/g)) {
      if (match[1].startsWith('.')) visit(relative(root, resolve(root, dirname(path), match[1])));
    }
  }
  visit('apps/frontend/scripts/ci/mw3-api-oracle.mjs');
  visit('apps/frontend/scripts/ci/postflop-command-supervisor.py');
  return { files, records: [...files].map(([path, body]) => ({ ...record(path, body), provenance: 'synthetic_control_capture_fixture' })) };
}
async function syntheticPrepared() {
  const candidates = {};
  for (const [kind, streets] of [['candidate', ['flop']], ['laterCandidate', ['turn', 'river']]]) {
    const policy = { version: 3, kind: 'ai_estimate_not_gto', spot_id: 'HJ_open_BTN_call_BB_call', streets,
      rules: streets.flatMap(street => MW3_TIERS.map(tier => ({ node: `mw3_${street}_first_first`, tier, priority: 0,
        when: { line: 'any', texture: 'any', players: 'any', position: 'any', response: 'any', price: 'any', spr: 'any' },
        mix: { check: 100, bet33: 0, bet75: 0, bet125: 0 } }))) };
    candidates[kind] = { policy, metadata: { spot: policy.spot_id, source_hash: 'a'.repeat(64), implementation_hash: 'b'.repeat(64),
      policy_hash: sha256(JSON.stringify(policy)), author_task: 'synthetic-api-fixture-never-real-policy' } };
  }
  const snapshot = { manifest: { source_tree: 'c'.repeat(40), spot: { id: 'HJ_open_BTN_call_BB_call', source_hash: 'a'.repeat(64), implementation_hash: 'b'.repeat(64),
    flop_policy_hash: candidates.candidate.metadata.policy_hash, later_policy_hash: candidates.laterCandidate.metadata.policy_hash },
    archive: { sha256: 'd'.repeat(64) }, content_sha256: 'e'.repeat(64) }, candidates };
  return { snapshot, deliveries: await prepareMw3SnapshotDeliveries(snapshot) };
}
function fakeWorkerSource(fault = '') {
  return `import {createServer} from 'node:http';import {readFileSync,writeFileSync,appendFileSync} from 'node:fs';import {createHash} from 'node:crypto';
const expected=JSON.parse(readFileSync('api.expected.json','utf8')),sha=s=>createHash('sha256').update(s).digest('hex');
const port=Number(process.argv[process.argv.indexOf('--port')+1]);
const served=[];const server=createServer((req,res)=>{
const url=new URL(req.url,'http://127.0.0.1');res.once('finish',()=>{const record={index:served.length+1,worker_pid:process.pid,method:req.method,path:url.pathname,delivery:url.searchParams.get('delivery'),part:url.searchParams.get('part'),status:res.statusCode};served.push(record);appendFileSync('fake-http.finished.jsonl',JSON.stringify(record)+'\\n')});const json=(status,body,headers={})=>{res.writeHead(status,{'content-type':'application/json',...headers});res.end(JSON.stringify(body))};
if(url.pathname==='/__mw3_verify_health')return json(200,{local_only:true,registry_entries:0});
if(!url.pathname.startsWith('/__mw3_local_oracle/'))return json(404,{error:'unpublished_delivery'});
if(req.method!=='GET'){
const final=expected.deliveries.at(-1),lastPost=req.method==='POST'&&url.pathname==='/__mw3_local_oracle/v1/mw3/manifest'&&url.searchParams.getAll('delivery').length===1&&url.searchParams.get('delivery')===final.deliveryHash;
if(lastPost&&['last-response-nonzero','last-response-signal'].includes(${JSON.stringify(fault)}))res.once('finish',()=>{
writeFileSync('fake-http.final-fault.json',JSON.stringify({fault:${JSON.stringify(fault)},worker_pid:process.pid,final_delivery:final.deliveryHash,response_index:served.length,finished:served}),{flag:'wx'});
if(${JSON.stringify(fault)}==='last-response-nonzero')process.exit(7);else process.kill(process.pid,'SIGKILL');});
return json(405,{error:'method_not_allowed'},{allow:'GET'});}
if(url.searchParams.getAll('delivery').length!==1)return json(400,{error:'bad_query'});
const delivery=expected.deliveries.find(row=>row.deliveryHash===url.searchParams.get('delivery'));
if(!delivery)return json(404,{error:'unpublished_delivery'});
let text,etag;
if(url.pathname.endsWith('/manifest')){text=delivery.headerText;etag='"'+delivery.deliveryHash+'"';}
else {const part=delivery.parts[Number(url.searchParams.get('part'))];if(!part)return json(404,{error:'part_not_found'});text=JSON.stringify({part:part.part,body:part.body});etag='"'+sha(text)+'"';}
if(req.headers['if-none-match']?.replace(/^W\\//,'')===etag){res.writeHead(304,{etag});res.end();return;}
res.writeHead(200,{etag,'cache-control':'private, must-revalidate','x-content-type-options':'nosniff','content-type':'application/json'});
res.end(${JSON.stringify(fault)}==='bad-body'?text+' ':text);
});if(${JSON.stringify(fault)}==='graceful')process.on('SIGTERM',()=>server.close(()=>process.exit(0)));process.on('SIGUSR2',()=>process.exit(7));server.listen(port,'127.0.0.1');console.error('synthetic API worker warning retained');`;
}
function retain(directory, passed) {
  if (passed) rmSync(directory, { recursive: true, force: true });
  else process.stderr.write(`Retained synthetic API lifecycle evidence: ${directory}\n`);
}
function captureError(action) {
  let error; try { action(); } catch (caught) { error = caught; }
  assert.ok(error?.commandOutcome); return error;
}
test('captured controller restores exact fake HTTP routes and completes two independent owned restart phases', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'mw3-api-restart-')); let passed = false;
  try {
    const prepared = await syntheticPrepared(), capture = capturedControl(); writeCapturedSources(directory, capture);
    writeFileSync(join(directory, 'wrangler.json'), JSON.stringify(localConfig()));
    writeFileSync(join(directory, 'worker.bundle.mjs'), '// synthetic worker bundle identity only\n');
    const wrangler = join(directory, 'fake-wrangler.mjs'); writeFileSync(wrangler, fakeWorkerSource());
    const pins = { entry: wrangler, esbuild_entry: process.env.MW3_TEST_ESBUILD_ENTRY ?? createRequire(import.meta.url).resolve('esbuild') };
    const control = bundleCapturedApiControl({ directory, pins, capture });
    let prior;
    for (const restart of [0, 1]) {
      const rows = runCapturedApiPhase({ directory, pins, capture, prepared, restart, control });
      assert.equal(rows.length, 2);
      const id = `api-phase-${restart}`, outcome = JSON.parse(readFileSync(join(directory, id, 'outcome.json')));
      const completion = JSON.parse(readFileSync(join(directory, `${id}.complete.json`)));
      assert.equal(outcome.parent_cleanup.complete, true); assert.equal(outcome.resource.actual_returncode, 0);
      assert.ok(['descendant-leak', 'owned-descendant-interrupted'].includes(outcome.resource.classification));
      assert.equal(completion.controller_identity.pid, outcome.resource.child_pid);
      assert.ok(!readFileSync(join(directory, id, 'stderr.log'), 'utf8').includes('CLOUDFLARE_API_TOKEN'));
      assert.match(readFileSync(join(directory, id, 'stderr.log'), 'utf8'), /synthetic API worker warning retained/);
      if (prior) { assert.deepEqual(rows, prior.rows); assert.notDeepEqual(completion.worker_identity, prior.worker_identity); }
      prior = { rows, worker_identity: completion.worker_identity };
      // Reload full retained logs rather than hash summaries for classifier tests.
      outcome.stdout = readFileSync(join(directory, id, 'stdout.log'), 'utf8'); outcome.stderr = readFileSync(join(directory, id, 'stderr.log'), 'utf8');
      const ledgerBytes = readFileSync(join(directory, `${id}.input-ledger.json`));
      for (const mutate of [o => { o.resource.child_signal_name = 'SIGKILL'; }, o => { o.resource.timed_out = true; },
        o => { o.wrapper.error = { code: 'ENOBUFS' }; }, o => { o.resource.streams.stderr.seen_bytes++; },
        o => { o.resource.cleanup_history[0].ownership_conflicts.push({ pid: 300, expected_start_ticks: 30, observed_start_ticks: 31 }); },
        o => { o.parent_cleanup.ownership_discovery_complete = false; }, o => { o.lease.final_cleanup.group_start_ticks++; },
        o => { o.resource.classification = 'normal-exit'; o.resource.normal_exit = true; },
        o => { for (const record of o.resource.cleanup_history) for (const reaped of record.reaped) if (reaped.pid === completion.worker_identity.pid) reaped.returncode = 7; },
        o => { for (const record of o.resource.cleanup_history) { record.term_pids = record.term_pids.filter(pid => pid !== completion.worker_identity.pid); record.kill_pids = record.kill_pids.filter(pid => pid !== completion.worker_identity.pid); } },
        o => { o.resource.classification = 'ownership-birth-conflict'; }]) {
        const changed = structuredClone(outcome); mutate(changed); assert.throws(() => assertApiCompletion(changed, completion, ledgerBytes, rows));
      }
      assertApiCompletion(outcome, completion, ledgerBytes, rows);
      assert.throws(() => assertCompletedCommand(outcome), 'API intentional teardown must remain outside ordinary SQL completion');
      for (const mutate of [c => { c.success = false; }, c => { c.controller_identity.start_ticks++; }, c => { c.worker_identity.start_ticks++; },
        c => { c.live_worker_before_completion.state = 'Z'; }, c => { c.rows.pop(); }, c => { c.input_ledger.sha256 = '0'.repeat(64); }, c => { c.command_id = 'api-phase-other'; }]) {
        const changed = structuredClone(completion); mutate(changed); assert.throws(() => assertApiCompletion(outcome, changed, ledgerBytes, rows));
      }
      const ledger = JSON.parse(ledgerBytes); assertApiInputLedger(directory, ledger);
      const changed = structuredClone(ledger); changed.files[0].sha256 = '0'.repeat(64); assert.throws(() => assertApiInputLedger(directory, changed));
    }
    passed = true;
  } finally { retain(directory, passed); }
});
test('API-only intentional teardown never accepts controller SQL failure, signal, timeout or overflow', () => {
  const directory = mkdtempSync(join(tmpdir(), 'mw3-api-abnormal-')); let passed = false;
  try {
    const prefix = "import os,signal,sys,time;print('NOT NULL constraint failed: mw3_policy_parts.body',file=sys.stderr,flush=True);";
    for (const mode of ['normal-nonzero', 'signal', 'inner-timeout', 'outer-timeout', 'output-limit', 'supervisor-signal']) {
      const code = prefix + (mode === 'normal-nonzero' ? 'sys.exit(1)' : mode === 'signal' ? 'os.kill(os.getpid(),signal.SIGKILL)' :
        mode === 'output-limit' ? "print('x'*10000,flush=True);time.sleep(3)" : mode === 'supervisor-signal' ? 'os.kill(os.getppid(),signal.SIGTERM);time.sleep(3)' : 'time.sleep(3)');
      const error = captureError(() => runSupervisedCommand({ directory, commandId: `api-${mode}`, command: 'python3', args: ['-c', code],
        timeoutMs: mode === 'inner-timeout' ? 300 : 3000, outerTimeoutMs: mode === 'outer-timeout' ? 400 : 5000,
        outputBytes: mode === 'output-limit' ? 2048 : 8192, cleanupMs: 200, apiTeardown: true }));
      assert.equal(error.commandOutcome.parent_cleanup.complete, true);
      assert.throws(() => assertCompletedCommand(error.commandOutcome, { apiTeardown: true }));
      assert.throws(() => assertApiCompletion(error.commandOutcome, { success: true }, Buffer.from('{}'), []));
    }
    passed = true;
  } finally { retain(directory, passed); }
});
test('API teardown accepts a normal zero controller with a fast closed-stream double-fork only after owned reaping', () => {
  const directory = mkdtempSync(join(tmpdir(), 'mw3-api-detached-')); let passed = false;
  try {
    const code = `import os,time
r,w=os.pipe()
if os.fork()==0:
    os.close(r);os.setsid()
    if os.fork()!=0:os._exit(0)
    null=os.open('/dev/null',os.O_RDWR)
    for fd in (0,1,2):os.dup2(null,fd)
    os.close(null);os.write(w,b'1');os.close(w)
    while True:time.sleep(1)
os.close(w);assert os.read(r,1)==b'1';os.close(r)
os._exit(0)`;
    const outcome = runSupervisedCommand({ directory, commandId: 'api-detached', command: 'python3', args: ['-c', code], timeoutMs: 3000, cleanupMs: 300, apiTeardown: true });
    assertCompletedCommand(outcome, { apiTeardown: true });
    assert.ok(outcome.resource.cleanup_history.some(row => row.reaped.length > 0));
    assert.equal(outcome.parent_cleanup.ownership_discovery_complete, true);
    assert.throws(() => assertCompletedCommand(outcome));
    assert.throws(() => assertApiCompletion(outcome, null, Buffer.from('{}'), []), 'No completion record means no API proof');
    passed = true;
  } finally { retain(directory, passed); }
});

test('a captured API controller rejects wrong HTTP body and retains worker cleanup and missing-completion evidence', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'mw3-api-bad-body-')); let passed = false;
  try {
    const prepared = await syntheticPrepared(), capture = capturedControl(); writeCapturedSources(directory, capture);
    writeFileSync(join(directory, 'wrangler.json'), JSON.stringify(localConfig()));
    writeFileSync(join(directory, 'worker.bundle.mjs'), '// synthetic worker bundle identity only\n');
    const wrangler = join(directory, 'fake-wrangler.mjs'); writeFileSync(wrangler, fakeWorkerSource('bad-body'));
    const pins = { entry: wrangler, esbuild_entry: process.env.MW3_TEST_ESBUILD_ENTRY ?? createRequire(import.meta.url).resolve('esbuild') };
    const control = bundleCapturedApiControl({ directory, pins, capture });
    const error = captureError(() => runCapturedApiPhase({ directory, pins, capture, prepared, restart: 0, control }));
    assert.equal(error.commandOutcome.purpose, 'api-oracle');
    assert.equal(error.commandOutcome.resource.actual_returncode, 1);
    assert.equal(error.commandOutcome.parent_cleanup.complete, true);
    assert.throws(() => readFileSync(join(directory, 'api-phase-0.complete.json')), /ENOENT/);
    assert.throws(() => assertCompletedCommand(error.commandOutcome, { nonzero: true }));
    assert.match(error.stderr, /AssertionError/);
    passed = true;
  } finally { retain(directory, passed); }
});

async function createApiFixture(directory, fault = '') {
  const prepared = await syntheticPrepared(), capture = capturedControl(); writeCapturedSources(directory, capture);
  writeFileSync(join(directory, 'wrangler.json'), JSON.stringify(localConfig()));
  writeFileSync(join(directory, 'worker.bundle.mjs'), '// synthetic worker bundle identity only\n');
  const wrangler = join(directory, 'fake-wrangler.mjs'); writeFileSync(wrangler, fakeWorkerSource(fault));
  const pins = { entry: wrangler, esbuild_entry: process.env.MW3_TEST_ESBUILD_ENTRY ?? createRequire(import.meta.url).resolve('esbuild') };
  const control = bundleCapturedApiControl({ directory, pins, capture });
  return { prepared, capture, pins, control };
}
test('last-response normal worker failure and external signal never become accepted API lifecycle proof', async () => {
  for (const fault of ['last-response-nonzero', 'last-response-signal']) {
    const directory = mkdtempSync(join(tmpdir(), `mw3-api-${fault}-`));
    const fixture = await createApiFixture(directory, fault); let error;
    try { runCapturedApiPhase({ directory, ...fixture, restart: 0 }); } catch (caught) { error = caught; }
    assert.ok(error, `${fault}: worker failed just after serving the last response`);
    const marker = JSON.parse(readFileSync(join(directory, 'fake-http.final-fault.json')));
    assert.equal(marker.fault, fault); assert.equal(marker.final_delivery, fixture.prepared.deliveries.at(-1).deliveryHash);
    assert.equal(marker.response_index, marker.finished.length);
    assert.deepEqual(marker.finished.at(-1), { index: marker.response_index, worker_pid: marker.worker_pid, method: 'POST',
      path: '/__mw3_local_oracle/v1/mw3/manifest', delivery: marker.final_delivery, part: null, status: 405 });
    for (const delivery of fixture.prepared.deliveries) {
      const finished = marker.finished.filter(row => row.delivery === delivery.deliveryHash);
      assert.equal(finished.length, 6 + 2 * delivery.parts.length, 'Every expected HTTP check finished before the genuinely final response fault');
      assert.equal(finished.filter(row => row.method === 'POST' && row.status === 405).length, 1);
      for (const part of delivery.parts) for (const status of [200, 304]) assert.ok(finished.some(row => row.path.endsWith('/part') && row.part === String(part.part) && row.status === status));
    }
    const outcome = JSON.parse(readFileSync(join(directory, 'api-phase-0/outcome.json')));
    assert.equal(outcome.parent_cleanup.complete, true);
    assert.equal(outcome.parent_cleanup.ownership_discovery_complete, true);
    // Retain the observed race's records even when the negative predicate passes.
    retain(directory, false);
  }
});
test('worker error or external SIGKILL in the final synchronous completion gap is rejected even with a completed success file', async () => {
  for (const fault of ['normal-nonzero', 'external-signal']) {
    const directory = mkdtempSync(join(tmpdir(), `mw3-api-precompletion-${fault}-`)), fixture = await createApiFixture(directory);
    const { prepared, pins } = fixture, expected = { deliveries: prepared.deliveries, snapshot: { candidates: prepared.snapshot.candidates } };
    writeFileSync(join(directory, 'api.expected.json'), jsonBytes(expected));
    const paths = ['api.control.bundle.mjs', 'api.expected.json', 'worker.bundle.mjs', 'wrangler.json', 'captured-source/apps/frontend/scripts/ci/postflop-command-supervisor.py'];
    const ledgerBytes = jsonBytes({ schema_version: 1, command_id: 'api-phase-0', local_only: true, wrangler: pins.entry,
      files: paths.map(path => record(path, readFileSync(join(directory, path)))) });
    const ledgerPath = join(directory, 'api-phase-0.input-ledger.json'); writeFileSync(ledgerPath, ledgerBytes);
    const driver = `import {runApiOracle} from ${JSON.stringify(pathToFileURL(join(directory, 'api.control.bundle.mjs')).href)};import {spawnSync} from 'node:child_process';
runApiOracle(${JSON.stringify(directory)},${JSON.stringify(ledgerPath)},{beforeCompletionForTest({worker_identity}){
const script='import os,signal,sys,time\\npid=int(sys.argv[1]);birth=int(sys.argv[2]);fields=open("/proc/"+str(pid)+"/stat").read().rsplit(")",1)[1].split();assert int(fields[19])==birth;os.kill(pid,'+${fault === 'normal-nonzero' ? '"signal.SIGUSR2"' : '"signal.SIGKILL"'}+');time.sleep(0.2)';
const result=spawnSync('python3',['-c',script,String(worker_identity.pid),String(worker_identity.start_ticks)],{timeout:2000,encoding:'utf8'});if(result.error||result.status!==0)throw new Error(result.stderr);
}}).then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1)});`;
    let outcome, error;
    try { outcome = runSupervisedCommand({ directory, commandId: 'api-phase-0', command: process.execPath,
      args: ['--input-type=module', '-e', driver], timeoutMs: 5000, cleanupMs: 300, apiTeardown: true }); }
    catch (caught) { error = caught; outcome = caught.commandOutcome; }
    assert.ok(outcome); assert.equal(outcome.parent_cleanup.complete, true);
    assert.equal(outcome.resource.actual_returncode, 0, 'Controller completion still occurred before processing the worker notification');
    const completion = JSON.parse(readFileSync(join(directory, 'api-phase-0.complete.json')));
    assert.equal(completion.success, true);
    const rows = prepared.deliveries.map(delivery => ({ stage: delivery.stage, delivery_hash: delivery.deliveryHash,
      restored_policy_sha256: sha256(JSON.stringify(prepared.snapshot.candidates[delivery.stage === 'flop' ? 'candidate' : 'laterCandidate'].policy)), parts: delivery.parts.length }));
    assert.throws(() => assertApiCompletion(outcome, completion, ledgerBytes, rows));
    const statuses = outcome.resource.cleanup_history.flatMap(row => row.reaped).filter(row => row.pid === completion.worker_identity.pid && row.start_ticks === completion.worker_identity.start_ticks);
    assert.equal(statuses.length, 1); assert.equal(statuses[0].returncode, fault === 'normal-nonzero' ? 7 : -9);
    assert.ok(!outcome.resource.cleanup_history.some(row => row.term_pids.includes(completion.worker_identity.pid) || row.kill_pids.includes(completion.worker_identity.pid)), 'Already failed worker has no controlled owner teardown target');
    retain(directory, false);
  }
});
test('a graceful signal-handling worker normal exit zero is accepted only with exact controlled TERM and reaped evidence', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'mw3-api-graceful-')); let passed = false;
  try {
    const fixture = await createApiFixture(directory, 'graceful');
    runCapturedApiPhase({ directory, ...fixture, restart: 0 });
    const outcome = JSON.parse(readFileSync(join(directory, 'api-phase-0/outcome.json'))), completion = JSON.parse(readFileSync(join(directory, 'api-phase-0.complete.json')));
    const worker = completion.worker_identity, history = outcome.resource.cleanup_history;
    assert.ok(history.some(row => row.term_pids.includes(worker.pid)));
    assert.ok(history.some(row => row.reaped.some(reaped => reaped.pid === worker.pid && reaped.start_ticks === worker.start_ticks && reaped.returncode === 0)));
    passed = true;
  } finally { retain(directory, passed); }
});

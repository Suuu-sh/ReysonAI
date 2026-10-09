// Harmless LOCAL process fixtures only, serial in CI. No Wrangler/D1 imports.
// The exact production owner handles detached descendants; test-only containment
// cleans abrupt-owner-loss fixtures without changing their uncertain outcome.
import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertCompletedCommand, expectFinishedFailure, runSupervisedCommand } from '../scripts/ci/mw3-local-command.mjs';
test('stub supervisor accepts genuine SQLite error with normal exits, including normal124/137', () => {
  const directory = mkdtempSync(join(tmpdir(), 'mw3-supervisor-normal-'));
  let passed = false;
  try {
    const success = runSupervisedCommand({ directory, commandId: 'normal-zero', command: process.execPath,
      args: ['-e', "console.log('[{\"success\":true}]'); console.error('retained warning');"], timeoutMs: 2000, cleanupMs: 200 });
    assertCompletedCommand(success);
    assert.match(success.stdout, /success/); assert.match(success.stderr, /retained warning/);
    assert.ok(existsSync(join(success.evidence_directory, 'stdout.log')));
    assert.ok(existsSync(join(success.evidence_directory, 'stderr.log')));
    assert.equal(success.parent_cleanup.complete, true);
    for (const code of [1, 124, 137]) {
      const error = expectFinishedFailure(() => runSupervisedCommand({ directory, commandId: `normal-${code}`, command: process.execPath,
        args: ['-e', `const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(':memory:');
db.exec("CREATE TABLE mw3_policy_parts(body TEXT NOT NULL);INSERT INTO mw3_policy_parts VALUES('accepted');");
console.log('normally completed stdout');try{db.exec("INSERT INTO mw3_policy_parts VALUES(NULL);");process.exit(0)}
catch(error){console.error(error.message);db.close();process.exit(${code})}`],
        timeoutMs: 2000, cleanupMs: 200 }), /NOT NULL constraint failed: mw3_policy_parts\.body/);
      assert.equal(error.commandOutcome.resource.actual_returncode, code);
      assert.equal(error.commandOutcome.resource.classification, 'normal-exit');
      assert.equal(error.commandOutcome.resource.child_signal_number, null);
    }
    passed = true;
  } finally { cleanupLifecycleFixture(directory, passed); }
});
test('expected SQL text followed by SIGKILL/SIGTERM/timeout is never completed rollback evidence', () => {
  const directory = mkdtempSync(join(tmpdir(), 'mw3-supervisor-signal-'));
  let passed = false;
  try {
    for (const name of ['SIGKILL', 'SIGTERM']) {
      const error = captureCommandError(() => runSupervisedCommand({ directory, commandId: name.toLowerCase(), command: process.execPath,
        args: ['-e', `console.error('NOT NULL constraint failed: mw3_policy_parts.body');process.kill(process.pid,'${name}');`],
        timeoutMs: 2000, cleanupMs: 200 }));
      assert.match(error.stderr, /NOT NULL constraint failed/);
      assert.ok(error.commandOutcome.resource.actual_returncode < 0);
      assert.equal(error.commandOutcome.resource.child_signal_name, name);
      assert.throws(() => expectFinishedFailure(() => { throw error; }, /NOT NULL constraint failed/));
      assert.equal(error.commandOutcome.parent_cleanup.complete, true);
    }
    const timeout = captureCommandError(() => runSupervisedCommand({ directory, commandId: 'inner-timeout', command: process.execPath,
      args: ['-e', "console.error('malformed JSON');setInterval(()=>{},1000);"], timeoutMs: 300, cleanupMs: 200 }));
    assert.match(timeout.stderr, /malformed JSON/);
    assert.equal(timeout.commandOutcome.resource.timed_out, true);
    assert.equal(timeout.commandOutcome.resource.classification, 'timeout');
    assert.ok(timeout.commandOutcome.resource.actual_returncode < 0);
    assert.throws(() => expectFinishedFailure(() => { throw timeout; }, /malformed JSON/));
    passed = true;
  } finally { cleanupLifecycleFixture(directory, passed); }
});
function cleanupLifecycleFixture(directory, passed, cleaned = true) {
  if (passed && cleaned) rmSync(directory, { recursive: true, force: true });
  else process.stderr.write(`Retained lifecycle evidence: ${directory}\n`);
}
function captureCommandError(action) {
  let error; try { action(); } catch (caught) { error = caught; }
  assert.ok(error?.commandOutcome, 'Require the production helper structured failure, not an unrelated throw');
  return error;
}
function assertPidGone(pid) {
  assert.equal(existsSync(`/proc/${pid}`), false, `Owned grandchild ${pid} must be terminated and reaped`);
}
test('inner/outer deadlines and output overflow clean owned child and grandchild, preserving diagnostics', () => {
  const directory = mkdtempSync(join(tmpdir(), 'mw3-supervisor-grandchild-'));
  let passed = false;
  try {
    for (const mode of ['inner-timeout', 'outer-timeout', 'output-limit']) {
      const pidFile = join(directory, `${mode}.pid`);
      const script = `const {spawn}=require('node:child_process');const {writeFileSync}=require('node:fs');
const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});writeFileSync(${JSON.stringify(pidFile)},String(child.pid));
console.error('NOT NULL constraint failed: mw3_policy_parts.body');
${mode === 'output-limit' ? "setTimeout(()=>process.stdout.write('x'.repeat(100000)),100);" : ''}
setInterval(()=>{},1000);`;
      const error = captureCommandError(() => runSupervisedCommand({ directory, commandId: mode, command: process.execPath, args: ['-e', script],
        timeoutMs: mode === 'inner-timeout' ? 400 : 3000, outerTimeoutMs: mode === 'outer-timeout' ? 500 : 5000,
        outputBytes: mode === 'output-limit' ? 2048 : 8192, cleanupMs: 300 }));
      assert.match(error.stderr, /NOT NULL constraint failed/, `${mode}: original child diagnostic retained`);
      assert.equal(error.commandOutcome.parent_cleanup.complete, true, mode);
      const pid = Number(readFileSync(pidFile, 'utf8')); assertPidGone(pid);
      assertPidGone(error.commandOutcome.resource.child_pid);
      if (mode === 'outer-timeout') {
        assert.equal(error.originalExecutionError.code, 'ETIMEDOUT');
        assert.ok(error.commandOutcome.resource.interrupted_signal);
      } else assert.equal(error.commandOutcome.resource.classification, mode === 'inner-timeout' ? 'timeout' : mode);
      assert.throws(() => expectFinishedFailure(() => { throw error; }, /NOT NULL constraint failed/));
      assert.ok(existsSync(join(error.commandOutcome.evidence_directory, 'outcome.json')));
    }
    passed = true;
  } finally { cleanupLifecycleFixture(directory, passed); }
});
test('spawn/measurement/cleanup/resource failures retain original outcomes and never become SQL failures', () => {
  const directory = mkdtempSync(join(tmpdir(), 'mw3-supervisor-metric-'));
  let passed = false;
  try {
    const launcher = captureCommandError(() => runSupervisedCommand({ directory, commandId: 'launcher-missing', command: process.execPath,
      args: ['-e', "console.error('NOT NULL constraint failed');process.exit(1)"], python: join(directory, 'missing-python'), timeoutMs: 1000, cleanupMs: 100 }));
    assert.equal(launcher.originalExecutionError.code, 'ENOENT');
    assert.ok(launcher.secondaryCauses.some(cause => cause.type === 'measurement-invalid-or-missing'));
    assert.throws(() => expectFinishedFailure(() => { throw launcher; }, /NOT NULL constraint failed/));
    const spawn = captureCommandError(() => runSupervisedCommand({ directory, commandId: 'child-missing', command: join(directory, 'missing-child'),
      timeoutMs: 1000, cleanupMs: 100 }));
    assert.equal(spawn.commandOutcome.resource.classification, 'spawn-failure');
    assert.equal(spawn.commandOutcome.resource.actual_returncode, null);
    assert.ok(spawn.commandOutcome.resource.secondary_causes.some(cause => cause.type === 'FileNotFoundError'));
    assert.equal(spawn.commandOutcome.resource.child_pid, null);
    assert.equal(spawn.commandOutcome.resource.normal_exit, false);
    assert.equal(spawn.commandOutcome.resource.complete, false);
    assert.match(spawn.commandOutcome.resource.secondary_causes.find(cause => cause.type === 'FileNotFoundError').message, /No such file or directory/);
    assert.equal(spawn.commandOutcome.resource.cleanup.complete, true, 'Live anchor locally found no remaining owned child');
    assert.equal(spawn.commandOutcome.resource.cleanup.ownership_discovery_complete, true);
    assert.equal(spawn.commandOutcome.lease.final_cleanup.complete, true);
    assert.equal(spawn.commandOutcome.lease.supervision_complete, false, 'Launch exception prevents a final parent discovery handoff');
    assert.equal(spawn.commandOutcome.parent_cleanup.complete, false);
    assert.equal(spawn.commandOutcome.parent_cleanup.ownership_discovery_complete, false);
    assert.ok(spawn.secondaryCauses.some(cause => cause.type === 'cleanup-unconfirmed'));
    assert.throws(() => expectFinishedFailure(() => { throw spawn; }, /NOT NULL constraint failed/));
    for (const mode of ['missing', 'malformed', 'partial', 'resource-cap', 'wrapper-mismatch', 'cleanup-mismatch', 'supervisor-error', 'buffer-error']) {
      const error = captureCommandError(() => runSupervisedCommand({ directory, commandId: `metric-${mode}`, command: process.execPath,
        args: ['-e', "console.log('retained normal stdout');console.error('NOT NULL constraint failed: mw3_policy_parts.body');process.exit(1)"],
        timeoutMs: 2000, cleanupMs: 200, onSupervisorComplete(result, evidence) {
          const path = join(evidence, 'resource.json');
          if (mode === 'missing') rmSync(path);
          else if (mode === 'malformed') writeFileSync(path, 'not JSON');
          else if (mode === 'partial') writeFileSync(path, '{"schema_version":1');
          else if (mode === 'wrapper-mismatch') result.status = 137;
          else if (mode === 'supervisor-error') { const cause = new Error('original supervisor interruption'); cause.code = 'EIO'; result.error = cause; }
          else if (mode === 'buffer-error') { const cause = new Error('original wrapper ENOBUFS'); cause.code = 'ENOBUFS'; result.error = cause; }
          else {
            const metric = JSON.parse(readFileSync(path, 'utf8'));
            if (mode === 'resource-cap') metric.max_rss_kib = 4 * 1024 * 1024;
            else metric.cleanup.complete = false;
            writeFileSync(path, JSON.stringify(metric));
          }
        } }));
      assert.match(error.stdout, /retained normal stdout/); assert.match(error.stderr, /NOT NULL constraint failed/);
      assert.throws(() => expectFinishedFailure(() => { throw error; }, /NOT NULL constraint failed/), mode);
      if (mode === 'supervisor-error') assert.equal(error.originalExecutionError.code, 'EIO');
      if (mode === 'buffer-error') assert.equal(error.originalExecutionError.code, 'ENOBUFS');
      assert.equal(error.commandOutcome.parent_cleanup.complete, true, 'Actual owned group remains cleaned despite corrupted telemetry');
    }
    passed = true;
  } finally { cleanupLifecycleFixture(directory, passed); }
});
test('zero child exit without valid JSON success remains outside expected SQL-failure proof', () => {
  const directory = mkdtempSync(join(tmpdir(), 'mw3-supervisor-json-'));
  let passed = false;
  try {
    const outcome = runSupervisedCommand({ directory, commandId: 'invalid-json-zero', command: process.execPath,
      args: ['-e', "console.log('not completed JSON');console.error('NOT NULL constraint failed');"], timeoutMs: 2000, cleanupMs: 200 });
    assertCompletedCommand(outcome);
    assert.throws(() => JSON.parse(outcome.stdout));
    assert.throws(() => expectFinishedFailure(() => { const error = new Error('JSON invalid'); error.commandOutcome = outcome; error.stderr = outcome.stderr; throw error; }, /NOT NULL/));
    for (const mutate of [o => { o.resource.actual_returncode = -9; }, o => { o.resource.timed_out = true; },
      o => { o.resource.child_signal_name = 'SIGKILL'; }, o => { o.resource.complete = false; },
      o => { o.resource.command_id = 'another-command'; }, o => { o.resource.supervisor_pid++; },
      o => { o.resource.normal_exit = false; }, o => { o.wrapper.signal = 'SIGTERM'; },
      o => { o.resource.child_start_ticks++; }, o => { o.lease.child_start_ticks++; },
      o => { o.resource.cleanup.group_start_ticks++; }, o => { o.parent_cleanup.child_start_ticks++; },
      o => { o.lease.supervision_complete = false; }, o => { o.lease.final_cleanup.supervisor_start_ticks++; },
      o => { o.lease.ownership_conflicts.push({ pid: 300, expected_start_ticks: 30, observed_start_ticks: 31 }); },
      o => { o.resource.cleanup.ownership_conflicts.push({ pid: 300, expected_start_ticks: 30, observed_start_ticks: 31 }); },
      o => { o.resource.cleanup_history[0].term_pids = {}; }, o => { o.parent_cleanup.remaining_live = { length: 0 }; },
      o => { o.resource.actual_returncode = 256; }, o => { o.resource.cleanup_history[0].child_start_ticks++; }, o => { o.resource.cleanup_history[0].ownership_conflicts.push({pid: 301, expected_start_ticks: 31, observed_start_ticks: 32}); },
      o => { o.parent_cleanup.remaining_live.push({ pid: 99999 }); }]) {
      const changed = structuredClone(outcome); mutate(changed); assert.throws(() => assertCompletedCommand(changed));
    }
    passed = true;
  } finally { cleanupLifecycleFixture(directory, passed); }
});

const supervisorPath = fileURLToPath(new URL('../scripts/ci/postflop-command-supervisor.py', import.meta.url));
test('pure proc snapshots require birth-matching parents and include the adopted-child supervisor anchor', () => {
  const code = `import importlib.util,json,os,signal
spec=importlib.util.spec_from_file_location('supervisor',${JSON.stringify(supervisorPath)})
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
def row(pid,birth,ppid,pgid=900,sid=900,state='S'):
    return dict(pid=pid,start_ticks=birth,ppid=ppid,pgid=pgid,sid=sid,state=state,rss_kib=1)
def lease():
    return dict(schema_version=1,command_id='snapshot',supervisor_pid=100,supervisor_start_ticks=5,group_id=100,group_start_ticks=5,child_pid=200,child_start_ticks=10,supervision_complete=False,owned=[dict(pid=200,start_ticks=10)])
def inspect(value,table):
    m.processes=lambda:table;m.process_record=lambda pid:table.get(pid)
    signals=[];reaps=[];m.os.kill=lambda pid,number:signals.append(pid)
    m.os.waitpid=lambda pid,flags:(reaps.append(pid) or (0,0))
    live,zombies=m.owned_records(value);m.signal_owned(value,signal.SIGTERM);m.reap_owned(value,None)
    return {r['pid'] for r in live+zombies},signals,reaps
anchor=row(100,5,1,100,100)
stale=lease();ids,signals,reaps=inspect(stale,{100:anchor,200:row(200,20,1),300:row(300,30,200),400:row(400,40,300)})
assert ids==set() and signals==[] and reaps==[]
assert {r['pid'] for r in stale['owned']}=={200}
valid=lease();ids,signals,reaps=inspect(valid,{100:anchor,200:row(200,10,100),300:row(300,30,200),400:row(400,40,300)})
assert ids=={200,300,400} and set(signals)==ids and set(reaps)==ids
adopted=lease();ids,signals,reaps=inspect(adopted,{100:anchor,300:row(300,30,100),400:row(400,40,300,state='Z')})
assert ids=={300,400} and signals==[300] and set(reaps)==ids
assert 100 not in {r['pid'] for r in adopted['owned']} and 100 not in signals+reaps
reused_child=lease();reused_child['owned'].append(dict(pid=300,start_ticks=30))
ids,signals,reaps=inspect(reused_child,{100:anchor,300:row(300,31,1),400:row(400,40,300)})
assert ids==set() and signals==[] and reaps==[]
assert reused_child['ownership_conflicts']==[]
for grouped in (True,False):
    conflict=lease();conflict['owned'].append(dict(pid=300,start_ticks=30))
    table={100:anchor,300:row(300,31,100,100 if grouped else 900,100 if grouped else 900)}
    ids,signals,reaps=inspect(conflict,table)
    assert ids==set() and signals==[] and reaps==[]
    assert conflict['owned']==[dict(pid=200,start_ticks=10),dict(pid=300,start_ticks=30)]
    assert conflict['ownership_conflicts']==[dict(pid=300,expected_start_ticks=30,observed_start_ticks=31,basis='owned-session' if grouped else 'verified-ancestry')]
    m.os.getpid=lambda:100
    cleanup=m.cleanup_owned(conflict,0.001)
    assert not cleanup['complete'] and not cleanup['ownership_discovery_complete'] and not cleanup['no_live_owned_processes']
    assert cleanup['ownership_conflicts']==conflict['ownership_conflicts'] and signals==[] and reaps==[]
    conflict['supervision_complete']=True;conflict['final_cleanup']={**m.cleanup_identity(conflict),'complete':True,'ownership_discovery_complete':True}
    m.process_record=lambda pid:None
    assert not m.completed_discovery(conflict)
try:m.discover_owned(lease(),{100:row(100,6,1,100,100)})
except RuntimeError as error:assert 'PID-reused' in str(error)
else:raise AssertionError('A reused leader must be rejected')
lost=lease();m.process_record=lambda pid:None
assert not m.completed_discovery(lost)
lost['supervision_complete']=True;lost['final_cleanup']={**m.cleanup_identity(lost),'complete':True,'ownership_discovery_complete':True}
assert m.completed_discovery(lost)
lost['final_cleanup']['child_start_ticks']+=1
assert not m.completed_discovery(lost)
print(json.dumps({'stale_parent':True,'stale_child':True,'adopted_anchor':True,'transitive_births':True,'leader_reuse':True,'lost_anchor_uncertain':True,'same_session_birth_conflict':True,'detached_ancestry_birth_conflict':True}))`;
  const result = spawnSync('python3', ['-c', code], { encoding: 'utf8', timeout: 2000, maxBuffer: 16384 });
  assert.equal(result.error, undefined); assert.equal(result.signal, null); assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { stale_parent: true, stale_child: true, adopted_anchor: true, transitive_births: true, leader_reuse: true, lost_anchor_uncertain: true, same_session_birth_conflict: true, detached_ancestry_birth_conflict: true });
});
function detachedStub(pidFile, mode) {
  // The readiness pipe makes the detached double-fork real before the command
  // exits. It closes both diagnostic streams; ancestry, not pipe liveness, owns it.
  return `import json,os,sys,time
r,w=os.pipe()
if os.fork()==0:
    os.close(r);os.setsid()
    if os.fork()!=0:os._exit(0)
    fields=open('/proc/self/stat').read().rsplit(')',1)[1].split()
    with open(${JSON.stringify(pidFile)},'x') as stream:json.dump(dict(pid=os.getpid(),start_ticks=int(fields[19])),stream)
    null=os.open('/dev/null',os.O_RDWR)
    for fd in (0,1,2):os.dup2(null,fd)
    os.close(null);os.write(w,b'1');os.close(w)
    while True:time.sleep(1)
os.close(w);assert os.read(r,1)==b'1';os.close(r)
print('NOT NULL constraint failed: mw3_policy_parts.body',file=sys.stderr,flush=True)
${mode === 'normal-exit' ? 'os._exit(1)' : mode === 'supervisor-kill' ? 'os.kill(os.getppid(),9);os._exit(1)' : 'while True:time.sleep(1)'}`;
}
function processBirth(pid) {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    const fields = stat.slice(stat.lastIndexOf(')') + 1).trim().split(/\s+/);
    return { pid, start_ticks: Number(fields[19]), state: fields[0] };
  } catch (error) { if (error.code === 'ENOENT' || error.code === 'ESRCH') return null; throw error; }
}
function assertBirthGone(identity) {
  const current = processBirth(identity.pid);
  assert.ok(!current || current.start_ticks !== identity.start_ticks, `Exact owned birth ${identity.pid}/${identity.start_ticks} must be terminated and reaped`);
}
test('fast setsid double-fork with closed streams is discovered and reaped on normal/inner/outer completion', () => {
  const directory = mkdtempSync(join(tmpdir(), 'mw3-supervisor-detached-'));
  let passed = false;
  let cleaned = true;
  try {
    for (const mode of ['normal-exit', 'inner-timeout', 'outer-timeout']) {
      const pidFile = join(directory, `${mode}.json`);
      const error = captureCommandError(() => runSupervisedCommand({ directory, commandId: `detached-${mode}`, command: 'python3',
        args: ['-c', detachedStub(pidFile, mode)], timeoutMs: mode === 'inner-timeout' ? 400 : 3000,
        outerTimeoutMs: mode === 'outer-timeout' ? 500 : 5000, cleanupMs: 300 }));
      cleaned &&= error.commandOutcome.parent_cleanup?.complete === true;
      assert.equal(error.commandOutcome.parent_cleanup.complete, true, mode);
      assert.match(error.stderr, /NOT NULL constraint failed/);
      const detached = JSON.parse(readFileSync(pidFile, 'utf8'));
      assertBirthGone(detached);
      assert.ok(error.commandOutcome.lease.owned.some(item => item.pid === detached.pid && item.start_ticks === detached.start_ticks));
      assert.ok(error.commandOutcome.resource.cleanup_history.some(cleanup => cleanup.reaped.some(item => item.pid === detached.pid && item.start_ticks === detached.start_ticks)));
      assertBirthGone({ pid: error.commandOutcome.lease.child_pid, start_ticks: error.commandOutcome.lease.child_start_ticks });
      if (mode === 'normal-exit') {
        assert.equal(error.commandOutcome.resource.actual_returncode, 1);
        assert.ok(['owned-descendant-interrupted', 'descendant-leak'].includes(error.commandOutcome.resource.classification));
      }
      else if (mode === 'inner-timeout') assert.equal(error.commandOutcome.resource.classification, 'timeout');
      else assert.equal(error.originalExecutionError.code, 'ETIMEDOUT');
      assert.throws(() => expectFinishedFailure(() => { throw error; }, /NOT NULL constraint failed/));
    }
    const finished = expectFinishedFailure(() => runSupervisedCommand({ directory, commandId: 'normal-descendant-finished', command: 'python3',
      args: ['-c', `import os,sys
pid=os.fork()
if pid==0:os._exit(0)
assert os.waitpid(pid,0)[1]==0
print('NOT NULL constraint failed: mw3_policy_parts.body',file=sys.stderr,flush=True)
sys.exit(1)`], timeoutMs: 2000, cleanupMs: 300 }), /NOT NULL constraint failed/);
    assert.equal(finished.commandOutcome.resource.classification, 'normal-exit');
    assert.equal(finished.commandOutcome.resource.cleanup.ownership_discovery_complete, true);
    assert.ok(!finished.commandOutcome.lease.owned.some(item => item.pid === finished.commandOutcome.wrapper.pid));
    passed = true;
  } finally { cleanupLifecycleFixture(directory, passed, cleaned); }
});
test('abrupt supervisor SIGKILL rejects SQL and API completion; separate test containment cleans exact births', () => {
  for (const apiTeardown of [false, true]) {
  const directory = mkdtempSync(join(tmpdir(), 'mw3-supervisor-lost-anchor-')), pidFile = join(directory, 'detached.json');
  const controller = `import {runSupervisedCommand,expectFinishedFailure,assertCompletedCommand} from ${JSON.stringify(new URL('../scripts/ci/mw3-local-command.mjs', import.meta.url).href)};
let error;try{runSupervisedCommand({directory:${JSON.stringify(directory)},commandId:'abrupt-supervisor',command:'python3',args:['-c',${JSON.stringify(detachedStub(pidFile, 'supervisor-kill').replace('os._exit(1)', apiTeardown ? 'os._exit(0)' : 'os._exit(1)'))}],timeoutMs:2000,cleanupMs:200,apiTeardown:${apiTeardown}})}catch(caught){error=caught}
if(!error?.commandOutcome||error.commandOutcome.parent_cleanup?.complete!==false||error.commandOutcome.wrapper.signal!=='SIGKILL')throw new Error('Abrupt anchor loss must remain explicit cleanup uncertainty');
let rejected=false;try{expectFinishedFailure(()=>{throw error},/NOT NULL constraint failed/)}catch{rejected=true}
if(!rejected)throw new Error('Abrupt loss became SQL proof');
let apiRejected=false;try{assertCompletedCommand(error.commandOutcome,{apiTeardown:true})}catch{apiRejected=true}
if(!apiRejected)throw new Error('Abrupt loss became API proof');
console.log(JSON.stringify({rejected,parent_cleanup_complete:error.commandOutcome.parent_cleanup.complete,signal:error.commandOutcome.wrapper.signal}));`;
  const driver = `import ctypes,importlib.util,json,os,subprocess,sys
spec=importlib.util.spec_from_file_location('supervisor',${JSON.stringify(supervisorPath)})
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
assert ctypes.CDLL(None).prctl(36,1,0,0,0)==0
birth=m.process_record(os.getpid());assert birth['pid']==birth['pgid']==birth['sid']
lease=dict(schema_version=1,command_id='test-owned-driver',supervisor_pid=birth['pid'],supervisor_start_ticks=birth['start_ticks'],group_id=birth['pid'],group_start_ticks=birth['start_ticks'],supervision_complete=False,owned=[])
child=None;result=None
try:
    child=subprocess.Popen([${JSON.stringify(process.execPath)},'--input-type=module','-e',${JSON.stringify(controller)}],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
    record=m.process_record(child.pid);assert record
    lease.update(child_pid=child.pid,child_start_ticks=record['start_ticks']);lease['owned'].append(dict(pid=child.pid,start_ticks=record['start_ticks']))
    stdout,stderr=child.communicate(timeout=6)
    assert child.returncode==0,stderr
    result=json.loads(stdout)
finally:
    cleanup=m.cleanup_owned(lease,0.5,child)
    assert cleanup['complete'],cleanup
identity=json.load(open(${JSON.stringify(pidFile)}));current=m.process_record(identity['pid'])
assert not current or current['start_ticks']!=identity['start_ticks']
result['test_owned_births_reaped']=True;print(json.dumps(result))`;
  const result = spawnSync('python3', ['-c', driver], { encoding: 'utf8', detached: true, timeout: 10000, maxBuffer: 65536 });
  assert.equal(result.error, undefined); assert.equal(result.signal, null); assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { rejected: true, parent_cleanup_complete: false, signal: 'SIGKILL', test_owned_births_reaped: true });
  rmSync(directory, { recursive: true, force: true });
  }
});

test('a retry uses a fresh command ID while preserving the original completed SQL failure evidence', () => {
  const directory = mkdtempSync(join(tmpdir(), 'mw3-supervisor-retry-')); let passed = false;
  try {
    const original = expectFinishedFailure(() => runSupervisedCommand({ directory, commandId: 'attempt-0', command: 'python3',
      args: ['-c', "import sys;print('NOT NULL constraint failed: mw3_policy_parts.body',file=sys.stderr);sys.exit(1)"], timeoutMs: 2000, cleanupMs: 200 }), /mw3_policy_parts\.body/);
    const retained = readFileSync(join(directory, 'attempt-0', 'outcome.json'));
    assert.throws(() => runSupervisedCommand({ directory, commandId: 'attempt-0', command: 'python3', args: ['-c', 'pass'] }), /EEXIST/);
    const retry = runSupervisedCommand({ directory, commandId: 'attempt-1', command: 'python3', args: ['-c', "print('[{\"success\":true}]')"], timeoutMs: 2000, cleanupMs: 200 });
    assertCompletedCommand(retry); assert.notEqual(retry.wrapper.pid, original.commandOutcome.wrapper.pid);
    assert.deepEqual(readFileSync(join(directory, 'attempt-0', 'outcome.json')), retained);
    passed = true;
  } finally { cleanupLifecycleFixture(directory, passed); }
});

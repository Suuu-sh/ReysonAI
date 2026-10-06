#!/usr/bin/env python3
# Fixed1755 finalizer invocation only. Lifecycle reused from recover-components-bounded.py.
# No numerical worker, checkpoint generation or production action is launched.
# The producer terminal receipt is saved BEFORE independent postflight checks.
import hashlib, json, os, signal, subprocess, sys, time
from pathlib import Path
BASE = Path(__file__).resolve().parent
RECOVERY = BASE.parent / 'co-coldcall-optimized-five-workers'
SPEC = BASE / 'case.json'
SPEC_SHA = '080f5c92891b403f0742a00a33e3d38ebb102adc43bccbd5f4798a789e870fb9'
RUNNER = BASE / 'finalize.mjs'
RUNNER_SHA = '83da0b6feae3a009a97c9da02248c1706eb79a8e1f4d7061e6e6e9e8052a8de9'
REPO = Path('/workspace/scratch/08c72b2d7549/hu-model11-prefix-key-execution')
NODE = Path('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node')
LIMIT_KIB = 900 * 1024
FLOOR_KIB = 2 * 1024 * 1024
MAX_SECONDS = 43200  # Fixed stop ceiling, not a completion estimate.
SAMPLE_SECONDS = 0.05
FINAL = BASE / 'finalized-v1'
SUPERVISION = RECOVERY / 'run/attempts/attempt-d3616663-01b1-46e5-bd95-f0841b2c635b/receipt.json'
def sha(data): return hashlib.sha256(data).hexdigest()
def dump(path, value):
    with path.open('x') as f: f.write(json.dumps(value, indent=2) + '\n')
def check_file(path, size, digest):
    path = Path(path)
    for parent in [path, *path.parents]:
        if parent.is_symlink(): raise RuntimeError('Symlink in pinned path: ' + str(parent))
    data = path.read_bytes()
    if len(data) != size or sha(data) != digest: raise RuntimeError('Pinned bytes changed: ' + str(path))
def pins():
    check_file(SPEC, SPEC.stat().st_size, SPEC_SHA); check_file(RUNNER, RUNNER.stat().st_size, RUNNER_SHA)
    value = json.loads(SPEC.read_text())
    if Path(value['repository']) != REPO: raise RuntimeError('Wrong frozen source root')
    if subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=REPO, text=True).strip() != value['commit']: raise RuntimeError('Source commit drift')
    if subprocess.check_output(['git', 'status', '--porcelain', '--untracked-files=no'], cwd=REPO, text=True).strip(): raise RuntimeError('Tracked source drift')
    for record in [value['plan'], value['prepared'], value['boardReview'], value['caseReview'], value['node']['binary'], *value['adapterPins'], *value['numericalPins']]: check_file(record['path'], record['bytes'], record['sha256'])
    review = json.loads(Path(value['boardReview']['path']).read_text())
    for record in [*review['commonEvidence'], review['pilotScopedAcceptance']['file'], *review['boundedCaseReview']['evidence']]: check_file(record['path'], record['bytes'], record['sha256'])
    check_file(SUPERVISION, SUPERVISION.stat().st_size, SUPERVISION_SHA)
    receipt = json.loads(SUPERVISION.read_text())
    if receipt['kind'] != 'next-hu-five-worker-owned-supervision' or receipt['mode'] != 'boards' or receipt['attempt'] != value['attempt'] or receipt['status'] != 'COMPLETE_NOT_ACCEPTED' or not receipt['sourceUnchanged'] or not receipt['allCreatedChildrenReaped'] or not receipt['allOwnedGroupsGone'] or receipt['errors'] or receipt['stoppedJobs'] or receipt['remainingOwnedMembers'] or receipt['persistedCompleteObjects'] != 1755 or receipt['plan'] != value['plan'] or receipt['review'] != value['boardReview'] or receipt['adapterPins'] != value['adapterPins']: raise RuntimeError('Genuine terminal five-worker1755 production required')
    terminal = json.loads((SUPERVISION.parent / 'terminal.json').read_text()); expected = dict(receipt); del expected['persistedCompleteObjects']; expected['sourceUnchanged'] = False
    if terminal != expected: raise RuntimeError('Producer terminal-before-postflight differs')
    if (RECOVERY / 'run/owner.lock').exists(): raise RuntimeError('Producer owner lock remains; preserve it')
    return value
def available(): return int(next(s.split()[1] for s in Path('/proc/meminfo').read_text().splitlines() if s.startswith('MemAvailable:')))
def members(group):
    result = []
    for path in Path('/proc').glob('[0-9]*'):
        try:
            fields = (path / 'stat').read_text().rsplit(')', 1)[1].split()
            if int(fields[2]) != group: continue
            rows = (path / 'status').read_text().splitlines(); rss = next((int(s.split()[1]) for s in rows if s.startswith('VmRSS:')), 0)
            if fields[0] != 'Z': result.append({'pid': int(path.name), 'startTicks': fields[19], 'rssKiB': rss, 'command': (path / 'cmdline').read_bytes().replace(b'\0', b' ').decode(errors='replace').strip()})
        except (FileNotFoundError, ProcessLookupError, PermissionError): pass
    return result
def stop_owned(process):
    try: os.killpg(process.pid, signal.SIGTERM)
    except ProcessLookupError: pass
    deadline = time.monotonic() + 3
    while (process.poll() is None or members(process.pid)) and time.monotonic() < deadline: time.sleep(SAMPLE_SECONDS)
    if process.poll() is None or members(process.pid):
        try: os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError: pass
    process.wait()
    deadline = time.monotonic() + 3
    while members(process.pid) and time.monotonic() < deadline: time.sleep(SAMPLE_SECONDS)
source = Path(__file__).read_bytes(); source_hash = sha(source)
if len(sys.argv) != 5 or sys.argv[1] != '--reviewed-sha256' or sys.argv[2] != source_hash or sys.argv[3] != '--producer-sha256' or len(sys.argv[4]) != 64 or any(c not in '0123456789abcdef' for c in sys.argv[4]): raise RuntimeError('Exact reviewed supervisor and terminal run SHA required')
SUPERVISION_SHA = sys.argv[4]
COMMAND = [str(NODE), '--max-old-space-size=512', str(RUNNER), '--producer-sha256', SUPERVISION_SHA, '--reviewed-sha256', RUNNER_SHA, '--require-existing', 'all-boards', 'CO_open_BTN_3bet_SB_call_CO_fold']
checked = pins()
if FINAL.exists() or FINAL.is_symlink(): raise RuntimeError('Final attempt destination already exists; preserve it')
initial = available()
if initial < FLOOR_KIB: raise RuntimeError('Less than 2 GiB host memory available')
logs = BASE / 'supervision-v1'; logs.mkdir()
(logs / 'supervisor.source.py').write_bytes(source)
for name, path in [('finalizer.source.mjs', RUNNER), ('recovery-plan.json', SPEC), ('producer-run.json', SUPERVISION)]: (logs / name).write_bytes(path.read_bytes())
dump(logs / 'before.json', {'supervisorSha256': source_hash, 'specSha256': SPEC_SHA, 'runnerSha256': RUNNER_SHA, 'command': COMMAND, 'cwd': str(REPO), 'ownRssLimitKiB': LIMIT_KIB, 'hostFloorKiB': FLOOR_KIB, 'timeoutSeconds': MAX_SECONDS, 'sampleSeconds': SAMPLE_SECONDS, 'preflightHostAvailableKiB': initial, 'producerRunSha256': SUPERVISION_SHA, 'finalRoot': str(FINAL), 'scope': 'CO coldcall1755 producer-verified aggregate/storage only; no fresh semantic replay or policy acceptance'})
def interrupted(signum, frame): raise InterruptedError('Supervisor received signal ' + str(signum))
signal.signal(signal.SIGTERM, interrupted)
signal.signal(signal.SIGINT, interrupted)
start = time.monotonic(); peak = 0; peak_members = []; minimum = initial; stopped = None; supervisor_error = None
process = None; code = None; cleanup = []; start_ticks = None
with (logs / 'stdout.log').open('xb') as stream:
    try:
        process = subprocess.Popen(COMMAND, cwd=REPO, stdout=stream, stderr=subprocess.STDOUT, start_new_session=True)
        start_ticks = Path(f'/proc/{process.pid}/stat').read_text().rsplit(')', 1)[1].split()[19]
        dump(logs / 'running.json', {'pid': process.pid, 'startTicks': start_ticks, 'ownedProcessGroup': process.pid, 'command': COMMAND})
        while process.poll() is None:
            sampled = members(process.pid); rss = sum(row['rssKiB'] for row in sampled)
            if rss > peak: peak = rss; peak_members = sampled
            minimum = min(minimum, available())
            if rss > LIMIT_KIB or minimum < FLOOR_KIB or time.monotonic() - start > MAX_SECONDS:
                stopped = 'own_rss_cap' if rss > LIMIT_KIB else 'host_available_floor' if minimum < FLOOR_KIB else 'timeout'
                stop_owned(process); break
            time.sleep(SAMPLE_SECONDS)
    except BaseException as error:
        stopped = 'supervisor_signal' if isinstance(error, InterruptedError) else 'supervisor_exception'
        supervisor_error = type(error).__name__ + ': ' + str(error)
        signal.signal(signal.SIGTERM, signal.SIG_IGN); signal.signal(signal.SIGINT, signal.SIG_IGN)
        if process is not None: stop_owned(process)
    finally:
        signal.signal(signal.SIGTERM, signal.SIG_IGN); signal.signal(signal.SIGINT, signal.SIG_IGN)
        if process is not None:
            code = process.wait(); remaining = members(process.pid)
            if remaining: stop_owned(process)
            cleanup = members(process.pid)
        terminal = {'kind': 'co-coldcall-producer-verified-aggregate-owned-group-terminal', 'producerExitCode': code, 'stopped': stopped, 'supervisorError': supervisor_error, 'seconds': round(time.monotonic() - start, 3), 'sampledPeakOwnGroupRssKiB': peak, 'peakOwnedMembers': peak_members, 'minimumHostAvailableKiB': minimum, 'ownedPid': process.pid if process else None, 'ownedProcessGroup': process.pid if process else None, 'ownedStartTicks': start_ticks, 'ownedChildReaped': process is not None and code is not None, 'ownedGroupGone': process is not None and not cleanup, 'remainingOwnedMembers': cleanup, 'supervisorSha256': source_hash, 'specSha256': SPEC_SHA, 'runnerSha256': RUNNER_SHA, 'producerRunSha256': SUPERVISION_SHA}
        dump(logs / 'terminal.json', terminal); print(json.dumps(terminal), flush=True)
postflight = {'status': 'PASS', 'finalAcceptance': False, 'fullReplay': False, 'model11Adoption': False}
try:
    pins()
    if sha(Path(__file__).read_bytes()) != source_hash: raise RuntimeError('Supervisor source drift')
    output = FINAL / 'allboard-partitioned.json'
    if code == 0 and (not output.is_file() or output.is_symlink()): raise RuntimeError('Successful finalizer lacks partitioned receipt')
    if output.is_file():
        if output.is_symlink(): raise RuntimeError('Finalizer receipt is a symlink')
        value = json.loads(output.read_text()); result = value['resultHeader']; header = value['receiptHeader']; prepared = json.loads(Path(checked['prepared']['path']).read_text())
        expected_argv = [COMMAND[0], *COMMAND[2:]]
        if COMMAND[1] != '--max-old-space-size=512' or header['command'] != expected_argv: raise RuntimeError('Actual Node argv differs from exact heap-flag projection')
        if value['kind'] != 'model11-all-board-partitioned-execution-receipt' or result['counts']['requestedBoards'] != 1755 or len(value['rowReferences']) != 1755 or header['diagnostics']['operationalProvenance']['finalizer']['sha256'] != RUNNER_SHA or result['bindingHash'] != prepared['bindingHash'] or result['checkpointIdentityHash'] != prepared['checkpointIdentityHash'] or header['exitCode'] != code or header['diagnostics']['operationalProvenance']['producer']['sha256'] != SUPERVISION_SHA: raise RuntimeError('Finalizer output attribution differs')
        component_path = FINAL / 'producer-verified-component.json'; component = json.loads(component_path.read_text())
        if component['kind'] != 'co-coldcall-producer-verified-aggregate' or component['spot'] != checked['spot'] or component['producerVerifiedBoards'] != 1755 or component['semanticEvidenceReused'] is not True or component['freshWholeSetSemanticPasses'] != 0 or component['originalConsumerFreshSemanticReplay'] is not False or component['producerOwnershipTerminated'] is not True or component['partitionedReceipt']['sha256'] != sha(output.read_bytes()): raise RuntimeError('Producer-reuse component attribution differs')
        if code == 0 and component['complete'] is not True: raise RuntimeError('Component did not pass')
        postflight.update({'componentStatus': result['status'], 'componentFullScopePassed': result['fullScopePassed'], 'component': {'path': str(component_path), 'bytes': component_path.stat().st_size, 'sha256': sha(component_path.read_bytes())}, 'output': {'path': str(output), 'bytes': output.stat().st_size, 'sha256': sha(output.read_bytes())}, 'nodeArgvProjectionVerified': True, 'separatePolicyAcceptancePending': True})
except Exception as error: postflight = {'status': 'FAIL', 'error': type(error).__name__ + ': ' + str(error), 'producerTerminalPreserved': True}
dump(logs / 'postflight.json', postflight); print(json.dumps(postflight), flush=True)
sys.exit(0 if code == 0 and stopped is None and not cleanup and postflight['status'] == 'PASS' else 1)

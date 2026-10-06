#!/usr/bin/env python3
"""Single reviewed diagnostic job under the existing birth-bound supervisor."""
import hashlib,json,os,signal,subprocess,sys,time
from pathlib import Path
BASE=Path(__file__).resolve().parent
REPO=BASE.parent.parent/'hu-model11-prefix-key-execution'
SUPERVISOR=REPO/'apps/frontend/scripts/ci/postflop-command-supervisor.py'
NODE=Path('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node')
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def dump(path,value):
 with path.open('x') as stream:json.dump(value,stream,indent=2)
def available():return int(next(row.split()[1] for row in Path('/proc/meminfo').read_text().splitlines() if row.startswith('MemAvailable:')))
def nodes():
 result=[]
 for item in Path('/proc').glob('[0-9]*/comm'):
  try:
   if item.read_text().strip()=='node':result.append(int(item.parent.name))
  except (FileNotFoundError,ProcessLookupError):pass
 return result
if len(sys.argv)!=5:raise RuntimeError('mode cell reviewed-runner-sha reviewed-controller-sha required')
mode,index,runner_sha,controller_sha=sys.argv[1:]
if mode not in ['legacy','current','producer','profile'] or index not in ['1','2','59'] or sha(BASE/'measure.mjs')!=runner_sha or sha(Path(__file__))!=controller_sha:raise RuntimeError('Reviewed source/mode mismatch')
if mode=='producer' and index!='2' or mode=='profile' and index!='59':raise RuntimeError('Fixed diagnostic selector differs')
if nodes():raise RuntimeError('Unexpected concurrent Node process; wait for the assigned lane')
if available()<2*1024*1024:raise RuntimeError('Less than2GiB host memory available')
out=BASE/f'{mode}-{int(index):03d}-supervision'
if out.exists() or (BASE/f'{mode}-{int(index):03d}').exists():raise RuntimeError('Fresh job destination required')
out.mkdir()
command=[sys.executable,str(SUPERVISOR),'--directory',str(out),'--command-id',f'hu-trial-cost-{mode}-{index}','--timeout-ms','120000','--rss-limit-kib',str(900*1024),'--output-bytes',str(4*1024*1024),'--','env','-u','NODE_OPTIONS','-u','NODE_PATH',str(NODE),'--max-old-space-size=512',str(BASE/'measure.mjs'),mode,index,runner_sha]
initial=available(); minimum=initial; stopped=None
dump(out/'request.json',{'command':command,'runnerSha':runner_sha,'controllerSha':controller_sha,'supervisorSha':sha(SUPERVISOR),'hostAvailableKiB':initial,'hostFloorKiB':2*1024*1024})
process=subprocess.Popen(command,cwd=REPO,start_new_session=True)
def stop(signum,frame):
 global stopped
 stopped=f'parent-signal-{signum}';process.send_signal(signal.SIGTERM)
signal.signal(signal.SIGTERM,stop);signal.signal(signal.SIGINT,stop)
while process.poll() is None:
 minimum=min(minimum,available())
 if minimum<2*1024*1024 and stopped is None:stopped='host-memory-floor';process.send_signal(signal.SIGTERM)
 time.sleep(.05)
code=process.wait()
resource=json.loads((out/'resource.json').read_text())
dump(out/'parent-result.json',{'supervisorExit':code,'minimumHostAvailableKiB':minimum,'stopped':stopped,'unexpectedNodesAfter':nodes(),'resource':resource})
if code or stopped or resource['actual_returncode'] or resource['classification']!='normal-exit' or not resource['cleanup']['complete']:raise RuntimeError('Diagnostic failed; preserve all evidence')
print(json.dumps({'mode':mode,'cell':index,'elapsedSeconds':resource['elapsed_seconds'],'peakRssKiB':max(resource['max_rss_kib'],resource['observed_owned_group_rss_kib']),'cleanup':resource['cleanup']['complete']}))

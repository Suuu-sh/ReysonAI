import subprocess,sys,time,json,os,signal,resource
from pathlib import Path
# Own child only: do not infer other sessions from this call's PID namespace.
label=sys.argv[1]; cmd=sys.argv[2:]
root=Path('/workspace/scratch/08c72b2d7549/hu-model11-prefix-key-execution/apps/frontend')
logs=Path('/workspace/scratch/08c72b2d7549/hu-final-recovery/scoped-cache-epoch-audit-20261006/supervision'); logs.mkdir(parents=True,exist_ok=True)
limit_kib=900*1024; max_seconds=900; max_rss=0; stopped=None
def available_kib():
 return int(next(row.split()[1] for row in Path('/proc/meminfo').read_text().splitlines() if row.startswith('MemAvailable:')))
preflight_available=available_kib();minimum_available=preflight_available
assert preflight_available>2*1024*1024, 'Less than 2 GiB host memory available; do not start'
start=time.monotonic()
with (logs/(label+'.log')).open('wb') as out:
 p=subprocess.Popen(cmd,cwd=root,stdout=out,stderr=subprocess.STDOUT,start_new_session=True)
 while p.poll() is None:
  rss=0
  for path in Path('/proc').glob('[0-9]*'):
   try:
    fields=(path/'stat').read_text().rsplit(')',1)[1].split()
    if int(fields[2])!=p.pid:continue
    status=(path/'status').read_text()
    row=next((s for s in status.splitlines() if s.startswith('VmRSS:')),None)
    rss+=int(row.split()[1]) if row else 0
   except (FileNotFoundError,ProcessLookupError,PermissionError):pass
  max_rss=max(max_rss,rss)
  minimum_available=min(minimum_available,available_kib())
  if max_rss>limit_kib or time.monotonic()-start>max_seconds or minimum_available<2*1024*1024:
   stopped='own_rss_cap' if max_rss>limit_kib else 'host_available_floor' if minimum_available<2*1024*1024 else 'timeout'
   os.killpg(p.pid,signal.SIGTERM)
   try:p.wait(timeout=3)
   except subprocess.TimeoutExpired:os.killpg(p.pid,signal.SIGKILL);p.wait()
   break
  time.sleep(.01)
 code=p.wait()
report={'preflight_host_available_kib':preflight_available,'minimum_host_available_kib':minimum_available,'effective_cgroup_limit':'not exposed','label':label,'command':cmd,'exit_code':code,'seconds':round(time.monotonic()-start,3),'sampled_own_process_group_peak_rss_kib':max_rss,'child_rusage_peak_rss_kib':resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss,'rss_stop_limit_kib':limit_kib,'timeout_seconds':max_seconds,'stopped':stopped}
(logs/(label+'.resources.json')).write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report)); print('\n'.join((logs/(label+'.log')).read_text(errors='replace').splitlines()[-28:]))
sys.exit(code if code>=0 else 128-code)

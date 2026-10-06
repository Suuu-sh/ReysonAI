#!/usr/bin/env python3
"""Fixed fresh-case two-stage coldcall whole12 storage; no implicit launch."""
import argparse,hashlib,json,os,signal,subprocess,sys,time
from pathlib import Path
BASE=Path(__file__).resolve().parent
# Exact existing controller helpers: pinned reads, owned lock, birth/session-bound cleanup.
def digest(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def record(path):
 path=Path(path).resolve();return {'path':str(path),'bytes':path.stat().st_size,'sha256':digest(path)}
def dump(path,value):
 with Path(path).open('x') as stream:json.dump(value,stream,indent=2);stream.write('\n')
def verify(pin):
 path=Path(pin['path'])
 if any(p.is_symlink() for p in [path,*path.parents]) or not path.is_file() or record(path)!=pin:raise RuntimeError('Pinned bytes/path changed: '+str(path))
def read_pin(pin):verify(pin);return json.loads(Path(pin['path']).read_text())
def release_owned_lock(path,owned):
 path=Path(path)
 if path.is_symlink() or path.stat().st_ino!=owned['inode'] or record(path)!=owned['pin']:raise RuntimeError('Owned lock changed; preserve replacement')
 path.unlink()
def proc_identity(pid):
 fields=Path(f'/proc/{pid}/stat').read_text().rsplit(')',1)[1].split()
 return {'state':fields[0],'group':int(fields[2]),'session':int(fields[3]),'startTicks':fields[19]}
def members(group):
 rows=[]
 for path in Path('/proc').glob('[0-9]*'):
  try:
   fields=proc_identity(int(path.name))
   if fields['group']!=group or fields['session']!=group or fields['state']=='Z':continue
   rss=next((int(line.split()[1]) for line in (path/'status').read_text().splitlines() if line.startswith('VmRSS:')),0)
   rows.append({'pid':int(path.name),'startTicks':fields['startTicks'],'rssKiB':rss})
  except (FileNotFoundError,ProcessLookupError):pass
 return rows
def available():return int(next(line.split()[1] for line in Path('/proc/meminfo').read_text().splitlines() if line.startswith('MemAvailable:')))
def self_rss():return int(next(line.split()[1] for line in Path('/proc/self/status').read_text().splitlines() if line.startswith('VmRSS:')))

def signal_owned_group(process,start_ticks,sig):
 try:
  if process.poll() is None:
   identity=proc_identity(process.pid)
   if start_ticks is not None and identity['startTicks']!=start_ticks or identity['group']!=process.pid or identity['session']!=process.pid:raise RuntimeError('Owned process identity differs; refuse signal')
   os.killpg(process.pid,sig)
  elif members(process.pid):os.killpg(process.pid,sig)
 except ProcessLookupError:pass

def stop_owned_group(process,start_ticks):
 signal_owned_group(process,start_ticks,signal.SIGTERM)
 deadline=time.monotonic()+3
 while time.monotonic()<deadline and (process.poll() is None or members(process.pid)):time.sleep(.05)
 if process.poll() is None or members(process.pid):signal_owned_group(process,start_ticks,signal.SIGKILL)
 process.wait(timeout=3)
 deadline=time.monotonic()+3
 while members(process.pid) and time.monotonic()<deadline:time.sleep(.05)
 return members(process.pid)

def main():
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument('mode',choices=['produce','validate'])
 parser.add_argument('--plan-sha256',required=True);parser.add_argument('--reviewed-sha256',required=True)
 parser.add_argument('--review',required=True);parser.add_argument('--review-sha256',required=True)
 args=parser.parse_args();selfpin=record(__file__);planpin=record(BASE/'repair-plan.json')
 if args.reviewed_sha256!=selfpin['sha256'] or args.plan_sha256!=planpin['sha256']:raise RuntimeError('Exact reviewed source and plan SHA required')
 p=read_pin(planpin);original=read_pin(p['frozenPlan']);repo=Path(original['repository']);root=Path(p['runRoot']);limits=p['limits']
 reviewpin=record(args.review);review=read_pin(reviewpin)
 if reviewpin['sha256']!=args.review_sha256 or review.get('kind')!='coldcall-whole12-storage-independent-source-review' or review.get('verdict')!='APPROVE_TWO_STAGE_EXECUTION' or review.get('planSha256')!=planpin['sha256'] or review.get('sourcePins')!=p['sourcePins'] or review.get('approvedStages')!=['produce','validate'] or review.get('policyChanged') is not False or review.get('productionAuthorized') is not False:raise RuntimeError('Exact independent two-stage source review required')
 if p['kind']!='coldcall-whole12-two-stage-storage-plan' or p['version']!=1 or root!=BASE/'run' or limits!={'heapMiB':512,'groupRssMiB':900,'aggregateRssMiB':3072,'minimumAvailableMiB':2048,'childSeconds':900,'wholeSeconds':43200,'pollMilliseconds':50} or limits!=original['limits']:raise RuntimeError('Fixed stage/output/resource contract changed')
 original_root=Path(original['runRoot']);worker=record(BASE/'storage-stages.mjs');producer_pin=None
 checks=[planpin,selfpin,reviewpin,p['frozenPlan'],p['prepared'],p['launchReview'],*p['sourcePins'],*p['adapterPins'],original['node']['binary'],*original['sourcePins'],*original['pair'].values(),original['fullPlan']]
 def pins():
  for pin in checks:verify(pin)
  if subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip()!=p['commit'] or subprocess.check_output(['git','status','--porcelain','--untracked-files=no'],cwd=repo,text=True).strip():raise RuntimeError('Frozen source changed')
  if original['commit']!=p['commit'] or original['sourceIdentityHash']!=p['sourceIdentityHash'] or original['policyHashes']!=p['policyHashes']:raise RuntimeError('Source/policy identity mismatch')
 pins()
 if (original_root/'owner.lock').exists() or (original_root.parent/'prepare.lock').exists():raise RuntimeError('Existing numerical owner lock preserved; no overlapping continuation')
 for previous in (original_root/'attempts').iterdir():
  prior=json.loads((previous/'receipt.json').read_text())
  if prior.get('allCreatedChildrenReaped') is not True or prior.get('allOwnedGroupsGone') is not True:raise RuntimeError('Prior numerical ownership is not terminal')
 if args.mode=='validate':
  producer_pin=record(root/'produce'/'receipt.json');produced=read_pin(producer_pin)
  if produced.get('status')!='COMPLETE_NOT_ACCEPTED' or produced.get('mode')!='produce' or produced.get('plan')!=planpin or produced.get('review')!=reviewpin or produced.get('sourceUnchanged') is not True or produced.get('allCreatedChildrenReaped') is not True or produced.get('allOwnedGroupsGone') is not True or produced.get('remainingOwnedMembers') or produced.get('errors'):raise RuntimeError('Validator needs complete, reaped, unchanged producer')
  verify(produced['completion']);checks.extend([producer_pin,produced['completion']])
 for path in [root,*root.parents]:
  if path.is_symlink():raise RuntimeError('Refuse symlink output ancestry')
 root.mkdir(exist_ok=True);out=root/args.mode
 if out.exists():raise RuntimeError('Stage already exists; preserve complete or partial attempt')
 initial=available()
 if initial<limits['minimumAvailableMiB']*1024:raise RuntimeError('Host 2 GiB floor blocks stage')
 out.mkdir()
 lock=original_root/'owner.lock';fd=os.open(lock,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o644)
 owner={'pid':os.getpid(),'startTicks':proc_identity(os.getpid())['startTicks']};lock_bytes=json.dumps({**owner,'controller':selfpin,'repairPlan':planpin,'stage':args.mode}).encode();lock_inode=os.fstat(fd).st_ino
 os.write(fd,lock_bytes);os.close(fd);owned_lock={'inode':lock_inode,'pin':{'path':str(lock),'bytes':len(lock_bytes),'sha256':hashlib.sha256(lock_bytes).hexdigest()}}
 process=None;birth=None;stream=None;completion=None;peak=0;aggregate_peak=0;minimum=initial;start=time.monotonic();errors=[];remaining=[]
 def interrupt(signum,frame):raise InterruptedError('Owned storage stage interrupted')
 handlers={sig:signal.signal(sig,interrupt) for sig in [signal.SIGTERM,signal.SIGINT]}
 try:
  job={'kind':'coldcall-whole12-storage-owned-job','version':1,'mode':args.mode,'plan':planpin,'review':reviewpin,'worker':worker,'owner':owner,'producerReceipt':producer_pin}
  jobpath=out/'job.json';dump(jobpath,job);jobpin=record(jobpath);checks.append(jobpin)
  command=[original['node']['path'],'--max-old-space-size=512',worker['path'],args.mode,str(jobpath),planpin['sha256'],reviewpin['path'],reviewpin['sha256']]
  dump(out/'before.json',{'controller':selfpin,'plan':planpin,'review':reviewpin,'command':command,'limits':limits,'hostAvailableKiB':initial,'owner':owner})
  stream=(out/'stdout.log').open('xb');process=subprocess.Popen(command,cwd=repo,stdout=stream,stderr=subprocess.STDOUT,start_new_session=True)
  birth=proc_identity(process.pid)['startTicks'];dump(out/'launch.json',{'pid':process.pid,'startTicks':birth,'command':command,'job':jobpin})
  while True:
   rss=sum(row['rssKiB'] for row in members(process.pid));peak=max(peak,rss);aggregate_peak=max(aggregate_peak,rss+self_rss());minimum=min(minimum,available())
   if rss>limits['groupRssMiB']*1024:raise RuntimeError('Owned process group exceeded 900 MiB')
   if rss+self_rss()>limits['aggregateRssMiB']*1024 or minimum<limits['minimumAvailableMiB']*1024:raise RuntimeError('Aggregate 3 GiB or host 2 GiB floor reached')
   if time.monotonic()-start>limits['childSeconds']:raise RuntimeError('Stage exceeded unchanged 900 second cap')
   if process.poll() is not None:break
   time.sleep(limits['pollMilliseconds']/1000)
  if process.returncode!=0 or members(process.pid):raise RuntimeError('Stage failed or retained owned descendants')
  completion=record(out/'completed.json');value=read_pin(completion);started=value['started']
  expected_kind='coldcall-whole12-balance-produced-not-validated' if args.mode=='produce' else 'coldcall-whole12-storage-validated-component'
  if value.get('kind')!=expected_kind or value.get('complete') is not True or started['mode']!=args.mode or started['plan']!=planpin or started['job']!=jobpin or started['worker']!=worker or started['review']!=reviewpin or started['process']!={'pid':process.pid,'startTicks':birth} or started['bindingHash']!=p['regressionBindingHash']:raise RuntimeError('Completion does not belong to exact owned stage')
  checks.append(completion)
 except BaseException as error:errors.append(type(error).__name__+': '+str(error))
 finally:
  signal.signal(signal.SIGTERM,signal.SIG_IGN);signal.signal(signal.SIGINT,signal.SIG_IGN)
  if process is not None:
   try:remaining=stop_owned_group(process,birth)
   except BaseException as error:errors.append('Owned cleanup: '+repr(error));remaining=members(process.pid)
  if stream:stream.close()
  receipt={'kind':'coldcall-whole12-storage-owned-supervision','version':1,'status':'COMPLETE_NOT_ACCEPTED' if not errors and not remaining else 'STOPPED','mode':args.mode,'plan':planpin,'controller':selfpin,'review':reviewpin,'process':{'pid':process.pid,'startTicks':birth} if process else None,'producerExitCode':process.returncode if process else None,'completion':completion,'errors':errors,'allCreatedChildrenReaped':process is None or process.returncode is not None,'allOwnedGroupsGone':not remaining,'remainingOwnedMembers':remaining,'peakGroupRssKiB':peak,'aggregatePeakRssKiB':aggregate_peak,'minimumAvailableKiB':minimum,'seconds':time.monotonic()-start,'sourceUnchanged':False,'oldFullReplayPassed':False,'policyAccepted':False}
  dump(out/'terminal.json',receipt) # Ownership evidence survives any later postflight failure.
 try:
  pins();receipt['sourceUnchanged']=True
 except BaseException as error:errors.append('Postflight: '+repr(error));receipt['status']='STOPPED'
 if receipt['allCreatedChildrenReaped'] and receipt['allOwnedGroupsGone']:
  try:release_owned_lock(lock,owned_lock)
  except BaseException as error:errors.append('Owned lock: '+repr(error));receipt['status']='STOPPED'
 dump(out/'receipt.json',receipt)
 for sig,handler in handlers.items():signal.signal(sig,handler)
 print(json.dumps({'receipt':record(out/'receipt.json'),'status':receipt['status'],'mode':args.mode,'errors':errors}))
 return 0 if receipt['status']=='COMPLETE_NOT_ACCEPTED' else 1
if __name__=='__main__':
 try:sys.exit(main())
 except Exception as error:print(type(error).__name__+': '+str(error),file=sys.stderr);sys.exit(1)

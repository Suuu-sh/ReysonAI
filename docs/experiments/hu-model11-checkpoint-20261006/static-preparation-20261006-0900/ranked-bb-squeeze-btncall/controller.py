#!/usr/bin/env python3
"""External fixed next-case supervisor, adapted from pilot1755 interrupted continuation.
Five disjoint lanes; fresh <=8-board processes; reuse only semantically inspected completions.
No implicit start. This file cannot fabricate its independent launch review.
"""
import argparse,hashlib,json,os,signal,subprocess,sys,time,uuid
from pathlib import Path
BASE=Path(__file__).resolve().parent

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
 parser.add_argument('mode',choices=['prepare','run-boards','run-regression','run-whole12','finalize'])
 parser.add_argument('--reviewed-sha256',required=True)
 parser.add_argument('--review');parser.add_argument('--review-sha256')
 parser.add_argument('--producer-receipt');parser.add_argument('--producer-sha256')
 args=parser.parse_args();selfpin=record(__file__)
 if args.reviewed_sha256!=selfpin['sha256']:raise RuntimeError('Exact reviewed controller SHA required')
 planpin=record(BASE/'plan.json');p=read_pin(planpin);root=Path(p['runRoot']);repo=Path(p['repository']);limits=p['limits']
 adapters=[record(BASE/name) for name in ['context.mjs','worker.mjs','regression.mjs','serial.mjs','controller.py']]
 if root!=BASE/'run' or p['lanes']!=5 or p['boardsPerProcess']!=8:raise RuntimeError('Fixed next-case execution contract differs')
 def pins():
  for pin in [planpin,selfpin,*adapters,p['node']['binary'],*p['sourcePins'],*p['pair'].values(),p['fullPlan']]:verify(pin)
  if subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip()!=p['commit'] or subprocess.check_output(['git','status','--porcelain','--untracked-files=no'],cwd=repo,text=True).strip():raise RuntimeError('Frozen source changed')
 pins()
 if (root/'owner.lock').exists():raise RuntimeError('Existing owner lock preserved; no overlapping helper or numerical launch')
 if args.mode=='prepare':
  if args.review or args.review_sha256:raise RuntimeError('Prepare does not consume launch approval')
  if root.exists():raise RuntimeError('Preparation already exists; preserve it')
  prepare_lock=BASE/'prepare.lock';fd=os.open(prepare_lock,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o644);prepare_inode=os.fstat(fd).st_ino;os.close(fd)
  prepare_owned={'inode':prepare_inode,'pin':{'path':str(prepare_lock),'bytes':0,'sha256':hashlib.sha256(b'').hexdigest()}}
  prepare_id=str(uuid.uuid4());log=BASE/('prepare-'+prepare_id+'.log');preflight=None;process=None;stream=None;peak_pre=0;min_pre=available();begin=time.monotonic();failure=None
  def pre_interrupt(signum,frame):raise InterruptedError('Owned preparation interrupted')
  pre_handlers={sig:signal.signal(sig,pre_interrupt) for sig in [signal.SIGTERM,signal.SIGINT]}
  try:
   if min_pre<limits['minimumAvailableMiB']*1024:raise RuntimeError('Host2GiB floor blocks preparation helper')
   stream=log.open('xb');command=[p['node']['path'],'--max-old-space-size=512',str(BASE/'context.mjs'),'describe',planpin['sha256']]
   process=subprocess.Popen(command,cwd=repo,stdout=stream,stderr=subprocess.STDOUT,start_new_session=True)
   preflight={'pid':process.pid,'startTicks':proc_identity(process.pid)['startTicks'],'command':command}
   while process.poll() is None:
    rss=sum(row['rssKiB'] for row in members(process.pid));peak_pre=max(peak_pre,rss);min_pre=min(min_pre,available())
    if rss>limits['groupRssMiB']*1024 or rss+self_rss()>limits['aggregateRssMiB']*1024 or min_pre<limits['minimumAvailableMiB']*1024 or time.monotonic()-begin>60:raise RuntimeError('Preparation helper resource/window stop')
    time.sleep(.05)
   if process.returncode!=0 or members(process.pid):raise RuntimeError('Preparation helper failed or retained descendants')
  except BaseException as error:failure=repr(error)
  finally:
   signal.signal(signal.SIGTERM,signal.SIG_IGN);signal.signal(signal.SIGINT,signal.SIG_IGN)
   if process is not None:
    try:stop_owned_group(process,preflight['startTicks'] if preflight else None)
    except BaseException as error:failure=(failure+'; ' if failure else '')+'owned preparation cleanup: '+repr(error)
   if stream:stream.close()
   remaining_pre=members(process.pid) if process else []
   terminal={'kind':'next-hu-owned-nonnumerical-preparation','process':preflight,'failure':failure,'exitCode':process.returncode if process else None,'allCreatedChildrenReaped':process is None or process.returncode is not None,'allOwnedGroupsGone':not remaining_pre,'remainingOwnedMembers':remaining_pre,'peakGroupRssKiB':peak_pre,'minimumAvailableKiB':min_pre,'seconds':time.monotonic()-begin,'numericalWorkPerformed':False}
   dump(BASE/('prepare-'+prepare_id+'.terminal.json'),terminal)
   if terminal['allCreatedChildrenReaped'] and terminal['allOwnedGroupsGone']:
    try:release_owned_lock(prepare_lock,prepare_owned)
    except BaseException as error:failure=repr(error)
   for sig,handler in pre_handlers.items():signal.signal(sig,handler)
  if failure or remaining_pre:raise RuntimeError('Bounded preparation failed: '+str(failure))
  if log.stat().st_size>2*1024*1024:raise RuntimeError('Preparation output exceeds bound')
  prepared=json.loads(log.read_text())
  if prepared['numericalWorkPerformed'] is not False or prepared['adapterPins']!=adapters:raise RuntimeError('Preparation differs')
  pins();root.mkdir();(root/'attempts').mkdir();dump(root/'prepared.json',prepared)
  print(json.dumps({'prepared':record(root/'prepared.json'),'numericalWorkPerformed':False,'status':'READY_FOR_INDEPENDENT_REVIEW_NOT_LAUNCHED'}));return 0
 if not args.review or not args.review_sha256:raise RuntimeError('Pinned independent review required; no implicit launch')
 if (BASE/'prepare.lock').exists():raise RuntimeError('Preparation owner active/unknown; preserve lock')
 prepared_pin=record(root/'prepared.json');prepared=read_pin(prepared_pin)
 if prepared['numericalWorkPerformed'] is not False or prepared['adapterPins']!=adapters or prepared['plan']!=planpin['sha256']:raise RuntimeError('Prepared identity changed')
 reviewpin=record(args.review)
 if reviewpin['sha256']!=args.review_sha256:raise RuntimeError('Review SHA differs')
 review=read_pin(reviewpin);mode={'run-boards':'boards','run-regression':'regression','run-whole12':'whole12','finalize':'finalize'}[args.mode]
 serial=mode in ['whole12','finalize']
 producer_pin=None
 if mode=='finalize':
  if not args.producer_receipt or not args.producer_sha256:raise RuntimeError('Finalization requires exact terminal producer receipt')
  producer_pin=record(args.producer_receipt)
  if producer_pin['sha256']!=args.producer_sha256:raise RuntimeError('Producer receipt SHA differs')
 elif args.producer_receipt or args.producer_sha256:raise RuntimeError('Unexpected producer receipt')
 if review.get('kind')!='next-hu-independent-launch-review' or review.get('version')!=1 or review.get('verdict')!='APPROVE' or review.get('spot')!=p['spot'] or review.get('planSha256')!=planpin['sha256'] or review.get('adapterPins')!=adapters or review.get('prepared')!=prepared_pin or mode not in review.get('approvedModes',[]) or review.get('policyChanged') is not False or review.get('productionAuthorized') is not False:raise RuntimeError('Exact independent launch review missing')
 evidence=review.get('commonEvidence',[]);pilot=review.get('pilotScopedAcceptance',{})
 if not evidence or pilot.get('status')!='independently-accepted-scoped-evidence' or not pilot.get('file'):raise RuntimeError('Current pilot finalizer and independent scoped acceptance are prerequisites')
 evidence=[*evidence,pilot['file']]
 if mode=='boards':
  bounded=review.get('boundedCaseReview',{})
  if bounded.get('verdict')!='APPROVE_FOR_1755' or bounded.get('bindingHash')!=prepared['bindingHash'] or not bounded.get('evidence'):raise RuntimeError('Own bounded case/quality review has not cleared1755')
  evidence.extend(bounded['evidence'])
 for pin in evidence:verify(pin)
 # Every prior attempt must have terminal ownership evidence. No old lock is removed.
 for previous in (root/'attempts').iterdir():
  terminal=previous/'terminal.json'
  if not terminal.is_file():raise RuntimeError('Prior attempt ownership unknown; preserve and review it')
  prior=json.loads(terminal.read_text())
  if prior.get('allCreatedChildrenReaped') is not True or prior.get('allOwnedGroupsGone') is not True:raise RuntimeError('Prior owned processes not terminal')
 lock=root/'owner.lock';lockfd=os.open(lock,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o644)
 lock_bytes=json.dumps({'pid':os.getpid(),'startTicks':proc_identity(os.getpid())['startTicks'],'controller':selfpin}).encode();lock_inode=os.fstat(lockfd).st_ino
 os.write(lockfd,lock_bytes);os.close(lockfd)
 owned_lock={'inode':lock_inode,'pin':{'path':str(lock),'bytes':len(lock_bytes),'sha256':hashlib.sha256(lock_bytes).hexdigest()}}
 attempt='attempt-'+str(uuid.uuid4());out=root/'attempts'/attempt;out.mkdir();(out/'jobs').mkdir();(out/'logs').mkdir()
 active={};history=[];created=[];errors=[];counts=[0]*5;peak=0;minimum=available();start=time.monotonic();stopped=[];remaining=[]
 board_ids=prepared['boardIds'];board_key=prepared['checkpointIdentityHash'];reg_key=prepared['regressionStoreKey']
 def board_path(lane,index):return root/f'lane-{lane}'/'checkpoints'/board_key/(board_ids[index]+'.json')
 def cell_path(index):return root/'regression'/'cells'/f'{index:03d}'/reg_key/f'{index:03d}.cell.json'
 # All persisted complete objects are assigned fresh semantic inspection before generation.
 assignments={lane:([0] if lane==0 else []) if serial else (list(range(lane,1755,5)) if mode=='boards' else [i for i in range(72) if (i//6)%5==lane]) for lane in range(5)}
 inspect={lane:[] if serial else [i for i in indices if (board_path(lane,i) if mode=='boards' else cell_path(i)).is_file()] for lane,indices in assignments.items()}
 queues={lane:[i for i in indices if i not in inspect[lane]] for lane,indices in assignments.items()}
 phases={lane:'inspect' if inspect[lane] else 'generate' for lane in range(5)}
 def current_total():return self_rss()+sum(sum(row['rssKiB'] for row in members(child['process'].pid)) for child in active.values())
 def check_limits():
  nonlocal peak,minimum
  total=current_total();peak=max(peak,total);minimum=min(minimum,available())
  if total>limits['aggregateRssMiB']*1024 or minimum<limits['minimumAvailableMiB']*1024:raise RuntimeError('Aggregate3GiB or host2GiB floor reached')
  if time.monotonic()-start>limits['wholeSeconds']:raise RuntimeError('Fixed observation window reached; complete checkpoints preserved')
 def launch(lane):
  if phases[lane]=='inspect' and not inspect[lane]:phases[lane]='generate'
  queue=inspect[lane] if phases[lane]=='inspect' else queues[lane]
  if not queue:return
  pins();verify(reviewpin)
  for pin in evidence:verify(pin)
  check_limits();indices=queue[:8 if mode=='boards' else 1];del queue[:len(indices)]
  operation=mode if serial else ('inspect' if phases[lane]=='inspect' else ('batch' if mode=='boards' else 'cell'))
  jobid=f'{mode}-lane{lane}-{counts[lane]:04d}';counts[lane]+=1
  job={'kind':'next-hu-serial-job' if serial else ('next-hu-canonical-job' if mode=='boards' else 'next-hu-regression-job'),'mode':operation,'attempt':attempt,'id':jobid,'lane':lane,'planSha256':planpin['sha256'],'reviewSha256':reviewpin['sha256']}
  if mode=='boards':job['indices']=indices
  elif not serial:job['cellIndex']=indices[0]
  elif mode=='finalize':job['producerReceipt']=producer_pin
  path=out/'jobs'/(jobid+'.json');dump(path,job)
  worker=BASE/('serial.mjs' if serial else ('worker.mjs' if mode=='boards' else 'regression.mjs'))
  command=[p['node']['path'],'--max-old-space-size=512',str(worker),operation,str(path),planpin['sha256'],reviewpin['path'],reviewpin['sha256']]
  if mode=='finalize':command.extend(['all-boards',p['spot']])
  stream=(out/'logs'/(jobid+'.log')).open('xb')
  try:process=subprocess.Popen(command,cwd=repo,stdout=stream,stderr=subprocess.STDOUT,start_new_session=True)
  except BaseException:stream.close();raise
  child={'process':process,'stream':stream,'job':job,'jobPin':record(path),'command':command,'start':time.monotonic(),'peakRssKiB':0,'startTicks':None}
  active[lane]=child;created.append(child)
  # Child is in the owned table before any later operation can fail.
  child['startTicks']=proc_identity(process.pid)['startTicks']
  dump(out/(jobid+'.launch.json'),{'pid':process.pid,'startTicks':child['startTicks'],'job':child['jobPin'],'command':command})
 def interrupt(signum,frame):raise InterruptedError('Owned controller interrupted')
 old_handlers={sig:signal.signal(sig,interrupt) for sig in [signal.SIGTERM,signal.SIGINT]}
 try:
  for lane in range(5):launch(lane)
  while active:
   for lane,child in list(active.items()):
    process=child['process'];sample=members(process.pid);rss=sum(row['rssKiB'] for row in sample);child['peakRssKiB']=max(child['peakRssKiB'],rss)
    if rss>limits['groupRssMiB']*1024:raise RuntimeError('Owned process group exceeded900MiB')
    if time.monotonic()-child['start']>limits['childSeconds']:raise RuntimeError('Short-lived process exceeded900seconds')
    code=process.poll()
    if code is None:continue
    if members(process.pid):raise RuntimeError('Terminal worker retained owned descendants')
    child['stream'].close();done=out/'jobs'/(child['job']['id']+'.completed.json')
    if code!=0 or not done.is_file():raise RuntimeError('Worker failed or completion missing: '+child['job']['id'])
    completion=record(done);value=read_pin(completion);started=value['started']
    if started['plan']!=planpin or started['job']!=child['jobPin'] or started['worker']!=record(BASE/('serial.mjs' if serial else ('worker.mjs' if mode=='boards' else 'regression.mjs'))) or started['review']!=reviewpin or started['process']!={'pid':process.pid,'startTicks':child['startTicks']}:raise RuntimeError('Completion does not belong to exact launched job/process/bytes')
    if mode=='boards':
     if value['kind']!='next-hu-canonical-batch-complete-not-accepted' or started['bindingHash']!=prepared['bindingHash'] or started['checkpointIdentityHash']!=board_key or [r['index'] for r in value['completed']]!=child['job']['indices']:raise RuntimeError('Board completion identity differs')
     for item in value['completed']:
      actual=record(board_path(lane,item['index']));actual['path']=Path(actual['path']).name
      if item['board']!=board_ids[item['index']] or item['checkpoint']!=actual:raise RuntimeError('Persisted completed board differs')
      for pin in item['proofs']:verify({**pin,'path':str(board_path(lane,item['index']).parent/pin['path'])})
     expected_count=len(child['job']['indices']);expected_generated=expected_count if child['job']['mode']=='batch' else 0
     if value['generatedBoards']!=expected_generated or value['inspectedBoards']!=expected_count-expected_generated:raise RuntimeError('Board work accounting differs')
    elif serial:
     if value['kind']!='next-hu-serial-component-complete-not-accepted' or value['mode']!=mode or value['complete'] is not True or started['bindingHash']!=prepared['bindingHash']:raise RuntimeError('Serial component incomplete or foreign')
    else:
     d=value['diagnostic'];index=child['job']['cellIndex']
     if value['kind']!='next-hu-regression-cell-complete-not-accepted' or started['bindingHash']!=prepared['regressionBindingHash'] or d['bindingHash']!=prepared['regressionBindingHash'] or d['cellIndex']!=index or d['cell']!=prepared['cells'][index] or d['complete'] is not True or d['requestedTrials']!=64 or d['unresolved']!=0 or d['completed']+d['provedBaseUnreachableTrials']!=64:raise RuntimeError('Regression incomplete or foreign')
     raw=record(cell_path(index));raw['path']=Path(raw['path']).name
     if d['rawCell']!=raw:raise RuntimeError('Regression marker changed')
     expected_generated=d['attempted'] if child['job']['mode']=='cell' else 0
     if value['generatedTrials']!=expected_generated or value['inspectedTrials']!=d['attempted']-expected_generated:raise RuntimeError('Regression work accounting differs')
    row={'job':child['job'],'pid':process.pid,'startTicks':child['startTicks'],'exitCode':code,'peakRssKiB':child['peakRssKiB'],'seconds':time.monotonic()-child['start'],'completion':completion}
    history.append(row);dump(out/(child['job']['id']+'.terminal.json'),row);del active[lane]
   # Global memory is measured before starting any replacement workers.
   check_limits()
   for lane in range(5):
    if lane not in active:launch(lane)
   time.sleep(limits['pollMilliseconds']/1000)
 except BaseException as error:errors.append(type(error).__name__+': '+str(error))
 finally:
  signal.signal(signal.SIGTERM,signal.SIG_IGN);signal.signal(signal.SIGINT,signal.SIG_IGN)
  def owned_signal(child,sig):
   process=child['process']
   try:
    if process.poll() is None:
     identity=proc_identity(process.pid)
     if child['startTicks'] is not None and identity['startTicks']!=child['startTicks'] or identity['group']!=process.pid or identity['session']!=process.pid:raise RuntimeError('Owned process identity differs; refuse signal')
     os.killpg(process.pid,sig)
    elif members(process.pid):
     # A terminated group leader with live children retains its POSIX group identity.
     os.killpg(process.pid,sig)
   except ProcessLookupError:pass
   except BaseException as error:errors.append('Owned cleanup failure: '+repr(error))
  for child in active.values():owned_signal(child,signal.SIGTERM)
  deadline=time.monotonic()+3
  while time.monotonic()<deadline and any(child['process'].poll() is None or members(child['process'].pid) for child in active.values()):time.sleep(.05)
  for child in active.values():owned_signal(child,signal.SIGKILL)
  for child in created:
   try:child['process'].wait(timeout=3)
   except BaseException as error:errors.append('Reap failed: '+repr(error))
   try:child['stream'].close()
   except BaseException as error:errors.append('Log close failed: '+repr(error))
  remaining=[row for child in created for row in members(child['process'].pid)]
  stopped=[{'job':child['job'],'pid':child['process'].pid,'startTicks':child['startTicks'],'exitCode':child['process'].returncode} for child in active.values()]
  receipt={'kind':'next-hu-five-worker-owned-supervision','version':1,'status':'COMPLETE_NOT_ACCEPTED' if not errors and not remaining else 'STOPPED','mode':mode,'attempt':attempt,'plan':planpin,'controller':selfpin,'review':reviewpin,'adapterPins':adapters,'completedJobs':history,'stoppedJobs':stopped,'errors':errors,'allCreatedChildrenReaped':all(child['process'].returncode is not None for child in created),'allOwnedGroupsGone':not remaining,'remainingOwnedMembers':remaining,'aggregatePeakRssKiB':peak,'minimumAvailableKiB':minimum,'seconds':time.monotonic()-start,'sourceUnchanged':False,'oldFullReplayPassed':False,'policyAccepted':False}
  # Terminal ownership evidence is persisted before the potentially failing postflight.
  dump(out/'terminal.json',receipt)
  if receipt['allCreatedChildrenReaped'] and receipt['allOwnedGroupsGone']:
   try:release_owned_lock(lock,owned_lock)
   except BaseException as error:errors.append(repr(error));receipt['status']='STOPPED'
  for sig,handler in old_handlers.items():signal.signal(sig,handler)
 try:
  pins();verify(reviewpin)
  for pin in evidence:verify(pin)
  receipt['sourceUnchanged']=True
  expected=1 if serial else (1755 if mode=='boards' else 72)
  done=([0] if len(history)==1 else []) if serial else [i for lane,indices in assignments.items() for i in indices if (board_path(lane,i) if mode=='boards' else cell_path(i)).is_file()]
  receipt['persistedCompleteObjects']=len(done)
  visited=[i for row in history for i in ([0] if serial else (row['job']['indices'] if mode=='boards' else [row['job']['cellIndex']]))]
  if not errors and (len(done)!=expected or len(visited)!=expected or sorted(visited)!=list(range(expected))):raise RuntimeError('Exact disjoint coverage/inspection union incomplete')
  if mode=='regression' and not errors:
   diagnostics=sorted([read_pin(row['completion'])['diagnostic'] for row in history],key=lambda d:d['cellIndex'])
   if [d['cellIndex'] for d in diagnostics]!=list(range(72)) or any(d['unresolved'] or not d['complete'] for d in diagnostics):raise RuntimeError('No survivor-only or incomplete regression summary')
   summary={'kind':'model11-per-policy-regression-72x64-summary','version':1,'spot':p['spot'],'bindingHash':prepared['regressionBindingHash'],'requestedStrata':72,'requestedTrials':4608,'actualCompletedTrials':sum(d['completed'] for d in diagnostics),'provedBaseUnreachableTrials':sum(d['provedBaseUnreachableTrials'] for d in diagnostics),'unresolvedTrials':0,'cells':diagnostics,'negativeMeanCellIndices':[d['cellIndex'] for d in diagnostics if d['delta'] is not None and d['delta']['mean']<0],'precision':'low-or-unknown; engineering budget64, not confidence','extensionImplemented':False,'oldFullReplayPassed':False,'policyAccepted':False}
   if summary['actualCompletedTrials']+summary['provedBaseUnreachableTrials']!=4608:raise RuntimeError('Regression trial accounting incomplete')
   dump(out/'regression-summary.json',summary);receipt['regressionSummary']=record(out/'regression-summary.json')
 except BaseException as error:receipt['errors'].append(str(error));receipt['status']='STOPPED'
 dump(out/'receipt.json',receipt);print(json.dumps({'receipt':record(out/'receipt.json'),'status':receipt['status'],'mode':mode,'errors':receipt['errors']}))
 return 0 if receipt['status']=='COMPLETE_NOT_ACCEPTED' else 1
if __name__=='__main__':
 try:sys.exit(main())
 except Exception as error:print(type(error).__name__+': '+str(error),file=sys.stderr);sys.exit(1)

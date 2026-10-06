"""Read existing trial JSON only. No strategy execution, random sampling, or source edits."""
from pathlib import Path
import json, hashlib, collections, math
ROOT=Path('/workspace/scratch/08c72b2d7549')
BASE=ROOT/'hu-final-recovery/co-bb-squeeze-btncall-mc720k-five-workers'
ATT=BASE/'run/attempts/attempt-c7ac14e7-b296-4965-afcf-63edb8cd905a'
OUT=ROOT/'hu-final-recovery/saved-bb-loss-diagnostic-20261006'

def read(p): return json.loads(p.read_text())
def pin(p):
 b=p.read_bytes(); return {'path':str(p),'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()}
def cents(x): return round(x*100)
def stats(ts):
 ds=[cents(t['candidateReturn'])-cents(t['baselineReturn']) for t in ts]; n=len(ts)
 return {'n':n,'candidateMean':sum(cents(t['candidateReturn']) for t in ts)/100/n if n else None,'baselineMean':sum(cents(t['baselineReturn']) for t in ts)/100/n if n else None,'deltaSum':sum(ds)/100,'deltaMean':sum(ds)/100/n if n else None,'negativeCount':sum(x<0 for x in ds),'positiveCount':sum(x>0 for x in ds),'equalCount':sum(x==0 for x in ds),'grossNegativeDelta':-sum(x for x in ds if x<0)/100,'grossPositiveDelta':sum(x for x in ds if x>0)/100}
def example(t,p):
 return {'chunk':pin(p),'trialIndex':t['index'],'candidateReturn':t['candidateReturn'],'baselineReturn':t['baselineReturn'],'delta':(cents(t['candidateReturn'])-cents(t['baselineReturn']))/100,'completionDecisions':[{'request':d['request'],'seat':d['seat'],'node':d['node'],'ownCombo':d['ownCombo'],'randomIndex':d['randomIndex'],'random':d['random'],'label':d['label'],'action':d['action'],'rawMix':d['law']['rawMix'],'lawHash':d['lawHash'],'proofHash':d['proofHash'],'facts':d['law']['provenance']['facts']} for d in t['completionDecisions']]}
summary=read(ATT/'regression-summary.json'); allcells=[]; worst=[]; trialkeys=collections.Counter(); totalNodes=collections.Counter(); mismatches=[]
for c in summary['cells']:
 p=Path(c['rawEvidenceDirectory']); marker=read(p/c['rawCell']['path']); trials=[]; top=[]; comp=[]
 for ref in marker['chunks']:
  q=p/ref['path']; chunk=read(q)
  for t in chunk['trials']:
   trials.append(t); trialkeys[','.join(sorted(t.keys()))]+=1
   for d in t['completionDecisions']: totalNodes[d['node']]+=1
   if c['cellIndex'] in [43,45,47]:
    top.append((t,q))
    if t['completionDecisions']: comp.append((t,q))
 a=stats(trials); withc=[t for t in trials if t['completionDecisions']]; without=[t for t in trials if not t['completionDecisions']]
 if abs(a['deltaMean']-c['delta']['mean'])>1e-8: mismatches.append(c['cellIndex'])
 row={'cellIndex':c['cellIndex'],'cell':c['cell'],'marker':pin(p/c['rawCell']['path']),'all':a,'withCompletion':stats(withc),'withoutCompletion':stats(without),'completionDecisionCount':sum(len(t['completionDecisions']) for t in withc),'completionNodes':dict(collections.Counter(d['node'] for t in withc for d in t['completionDecisions'])),'completionActions':dict(collections.Counter(d['action'] for t in withc for d in t['completionDecisions']))}
 allcells.append(row)
 if c['cellIndex'] in [43,45,47]:
  top.sort(key=lambda pair:(cents(pair[0]['candidateReturn'])-cents(pair[0]['baselineReturn']),pair[0]['index']))
  comp.sort(key=lambda pair:(cents(pair[0]['candidateReturn'])-cents(pair[0]['baselineReturn']),pair[0]['index']))
  negative=[t for t in trials if t['candidateReturn']<t['baselineReturn']]
  bins={}
  for name,lo,hi in [('0to25',0,25),('25to50',25,50),('50to100',50,100),('100plus',100,float('inf'))]:
   group=[t for t in negative if lo<t['baselineReturn']-t['candidateReturn']<=hi]; bins[name]=stats(group)
  patterns=collections.Counter((t['candidateReturn'],t['baselineReturn']) for t in negative)
  patternrows=sorted([{'candidateReturn':k[0],'baselineReturn':k[1],'count':v,'grossNegativeDelta':round((k[1]-k[0])*v,2)} for k,v in patterns.items()],key=lambda x:-x['grossNegativeDelta'])
  loss_types={name:stats([t for t in negative if pred(t)]) for name,pred in [('candidateNonnegative',lambda t:t['candidateReturn']>=0),('candidateNegativeBaselineNonnegative',lambda t:t['candidateReturn']<0<=t['baselineReturn']),('bothNegative',lambda t:t['baselineReturn']<0)]}
  row={**row,'deltaLossBands':bins,'negativeOutcomePartitions':loss_types,'largestLosses':[example(*x) for x in top[:5]],'largestCompletionLosses':[example(*x) for x in comp[:3]],'largestLossPatterns':patternrows[:10], 'worst100GrossLoss':round(sum(t['baselineReturn']-t['candidateReturn'] for t,_ in top[:100]),2)}
  worst.append(row)
 print('CELL',c['cellIndex'],a['deltaMean'],'completion',len(withc),flush=True)
paired=[]
for i in ['001','002','059']:
 b=ROOT/'hu-final-recovery/trial-cost-diagnostic-20261006'; olds=read(b/f'legacy-{i}/trials.json'); news=read(b/f'current-{i}/trials.json'); oldr=read(b/f'legacy-{i}/result.json'); newr=read(b/f'current-{i}/result.json')
 diffs=[{'index':o['index'],'legacy':o['candidateReturn'],'current':n['candidateReturn'],'baseline':n['baselineReturn'],'currentMinusLegacy':round(n['candidateReturn']-o['candidateReturn'],2),'hasCompletion':bool(n['completionDecisions'])} for o,n in zip(olds,news) if o['candidateReturn']!=n['candidateReturn']]
 paired.append({'cell':newr['cell'],'pins':[pin(b/f'{mode}-{i}/{name}.json') for mode in ['legacy','current'] for name in ['result','trials']],'sameFields':{k:oldr[k]==newr[k] for k in ['cell','policyHashes','drawHash','sourceIdentityHash','inputFingerprint']},'drawHash':newr['drawHash'],'allBaselineReturnsEqual':all(o['baselineReturn']==n['baselineReturn'] for o,n in zip(olds,news)),'legacy':stats(olds),'current':stats(news),'changedReturns':diffs,'completionTrials':[t['index'] for t in news if t['completionDecisions']]})
result={'kind':'saved-trial-read-only-bb-diagnosis','sourceSummary':pin(ATT/'regression-summary.json'),'sourceReceipt':pin(ATT/'receipt.json'),'allTrials':sum(c['all']['n'] for c in allcells),'trialKeySets':dict(trialkeys),'completionNodeCounts':dict(totalNodes),'summaryDeltaMismatches':mismatches,'cells':allcells,'worstBoard':worst,'pairedLegacyCurrent':paired,'method':'Integer-cent aggregation of already stored candidate-minus-reference returns; partition by completion presence is descriptive, not causal; no strategy execution/replay and no pass threshold.'}
(OUT/'saved-loss-analysis.json').write_text(json.dumps(result,indent=2)+'\n')
print('OUTPUT',pin(OUT/'saved-loss-analysis.json'))

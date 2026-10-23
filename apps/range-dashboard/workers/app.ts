export interface Lane { active?:boolean; lane:number; board:string|null; path:string[]; status:string; phase:string|null; callInFlight:boolean; elapsedMs:number|null; elapsedSource:string|null }
export interface Snapshot {
 schemaVersion:1; observedAt:string; capacity:number;
 owner:{phase?:'running'|'review_wait'|'ready'|'halted'|null;alive:boolean;bindingAvailable?:boolean;configuredConcurrency:number|null;lastUpdatedAt?:string|null};
 run:{status:string;calls:number;decisions:number;maxCalls:number;maxDecisions:number;active:number;stale:boolean;lastUpdatedAt?:string|null};
 counts:{recordedAt?:string|null;source?:string;queued:number|null;running:number;complete:number;failed:number;uncertain:number};
 lanes:Lane[];
 coverage:{domain:number;root:Coverage;check:Coverage;recordedAt:string|null;stale:boolean};warnings:string[];
}
interface Coverage {saved:number;missing:number;blocked:number;unknown:number;parentPending?:number;zeroReach?:number}
const number=(value:unknown):number=>typeof value==='number'&&Number.isFinite(value)&&value>=0?Math.floor(value):0;
const shown=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)&&value>=0?number(value).toLocaleString('ja-JP'):'—';
export function elapsed(ms:unknown):string {if(typeof ms!=='number'||!Number.isFinite(ms)||ms<0)return '—';const s=Math.floor(ms/1000);return s<60?`${s}秒`:`${Math.floor(s/60)}分 ${s%60}秒`;}
const phases:Record<string,string>={startup:'起動準備',pin_validation:'出所確認',job_validation:'ジョブ確認',lease_heartbeat:'稼働確認',idle_heartbeat:'待機確認',decision_validation:'保存データ検証',completion_validation:'登録前検証',completion_upload:'完了登録',failure_upload:'停止登録',provider_drain:'実行中の応答を待って停止',idle:'待機',claim:'割り当て',claiming:'割り当て',claimed:'準備中',generating:'生成中',provider:'応答待ち',provider_call:'応答待ち',call_in_flight:'応答待ち',validating:'検証中',saving:'保存中',uploading:'登録中',completing:'完了登録',complete:'完了',completed:'完了',failed:'停止・要確認',heartbeat:'状態確認',before_call:'応答準備',after_call:'応答受信',generate:'生成中',upload:'登録中',finish:'完了処理'};
export function laneState(lane:Lane, snapshot:Snapshot):'active'|'complete'|'attention'|'idle' {
 if(['failed','failure_pending','uncertain','uncertain_provider_outcome'].includes(lane.status))return 'attention';
 if(['complete','completed'].includes(lane.status))return 'complete';
 if(snapshot.owner.alive&&snapshot.owner.bindingAvailable!==false&&lane.active!==false&&['running','generating','claimed','active'].includes(lane.status))return 'active';
 if(lane.callInFlight)return 'attention';
 return 'idle';
}
export function boardText(value:unknown):string {return typeof value==='string'&&/^(?:[2-9TJQKA][shdc]){3}$/.test(value)?value:'—';}
export function pathText(path:unknown):string {return Array.isArray(path)&&path.length===0?'BB 初手':Array.isArray(path)&&path.length===1&&path[0]==='check'?'BTN · check後':'その他の保存局面';}
const statusText=(state:string)=>({active:'実行中',complete:'保存完了',attention:'要確認',idle:'待機'}[state]??'未確認');
function el(doc:Document,tag:string,text?:string,cls?:string):HTMLElement {const e=doc.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;}
function set(doc:Document,id:string,text:string){const e=doc.getElementById(id);if(e)e.textContent=text;}
function dateText(value:unknown):string {if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))return '不明';return new Date(value).toLocaleString('ja-JP',{hour12:false});}
export function render(doc:Document,snapshot:Snapshot,filter='all'):void {
 const stale=snapshot.run.stale;const alive=snapshot.owner.alive;
 const connection=doc.getElementById('connection')!;
 const bound=snapshot.owner.bindingAvailable!==false;
 // Only a settled, positively completed batch is a normal exit. Unknown/partial stays warning.
 const batchDone=!alive&&snapshot.run.status==='complete'&&snapshot.run.active===0&&snapshot.counts.queued===0&&snapshot.counts.running===0&&snapshot.counts.failed===0&&snapshot.counts.uncertain===0&&snapshot.counts.complete>0&&snapshot.lanes.length>0&&snapshot.lanes.every(l=>['complete','completed'].includes(l.status)&&!l.callInFlight);
 const waiting=alive&&bound&&snapshot.lanes.some(l=>laneState(l,snapshot)==='active'&&l.callInFlight);
 const reviewWait=!alive&&snapshot.run.active===0&&snapshot.owner.phase==='review_wait';
 const journalTime=dateText(snapshot.run.lastUpdatedAt);
 connection.textContent=reviewWait?'独立検証待ち · 生成は休止中':batchDone?'今回の生成は完了しました · 次のバッチは未起動':!alive?'ワーカー停止 · 最後の記録を表示':!bound?'所有者未確認 · 実行との対応を確認できません':`監視中 · プロセス存在確認${waiting?' / 応答待ち':''}${stale?`（ジョブ記録 ${journalTime}）`:''}`;
 connection.dataset.tone=reviewWait||batchDone||alive&&bound?'live':'warning';
 set(doc,'updated',`最終取得 ${dateText(snapshot.observedAt)}`);
 set(doc,'owner',reviewWait?'生成ワーカーなし・独立検証待ち':batchDone?'バッチ完了・正常終了':alive&&snapshot.owner.bindingAvailable===false?'プロセス検出・実行との対応未確認':alive?`起動設定 ${shown(snapshot.owner.configuredConcurrency)}並列`:'稼働プロセスなし');
 const warning=doc.getElementById('notice')!;
 const needsAttention=number(snapshot.counts.failed)>0||number(snapshot.counts.uncertain)>0;
 warning.hidden=reviewWait||batchDone||!(stale||needsAttention||snapshot.warnings.length>0);
 const journalAge=typeof snapshot.run.lastUpdatedAt==='string'?Date.parse(snapshot.observedAt)-Date.parse(snapshot.run.lastUpdatedAt):NaN;
 warning.dataset.tone=needsAttention||!alive||!bound?'warning':'amber';
 warning.textContent=needsAttention?'停止・結果不確定の記録があります。再試行はしていません。失敗した呼び出しは、受理済み応答数を意味しません。':!alive?'ワーカーは停止しています。最後の記録を保持しています。':!bound?'プロセスと今回の実行の対応は未確認です。':stale?`ジョブ記録は${Number.isFinite(journalAge)?elapsed(Math.max(0,journalAge))+'前':'時刻不明'}。${waiting?'応答待ちの記録・更新なし。':'記録更新待ち。'}稼働数は記録値です。プロバイダーの受理・応答完了は未確認です。`:'一部の情報を取得できません。未確認の項目は「—」で表示します。';
 const metrics=doc.getElementById('metrics')!;metrics.replaceChildren();
 const active=alive?`${shown(snapshot.run.active)}${stale?'（記録値）':''}`:'0';
 for(const [label,value,note] of [['観測した稼働',active,reviewWait?'独立検証待ち・新しい生成は休止中':batchDone?'今回のバッチは完了・次は未起動':!alive?'ワーカー停止・最後の記録':snapshot.owner.bindingAvailable===false?'所有者未確認':stale?'プロセス存在・古いジョブ記録':'現在のプロセスとジョブ記録'],['待機中',shown(snapshot.counts.queued),`記録時点 ${dateText(snapshot.counts.recordedAt)}`],['完了ジョブ（一覧分）',shown(snapshot.counts.complete),'一覧の件数のみ・保存判断数とは別'],['要確認',shown(Math.max(number(snapshot.counts.failed),number(snapshot.counts.uncertain))),'失敗・結果不確定'],['呼び出し試行',`${shown(snapshot.run.calls)} / ${shown(snapshot.run.maxCalls)}`,`保存判断 ${shown(snapshot.run.decisions)} / ${shown(snapshot.run.maxDecisions)} 上限`]]) {
  const item=el(doc,'div',undefined,'metric');item.append(el(doc,'small',label),el(doc,'strong',value),el(doc,'span',note));metrics.append(item);
 }
 set(doc,'capacity',`表示容量 50枠 / 起動設定 ${shown(snapshot.owner.configuredConcurrency)}並列 / 実稼働 ${active}件 · 試行数は受理済み応答数ではありません`);
 const lanes=doc.getElementById('lanes')!;lanes.replaceChildren();
 // Journal lane numbers are cumulative job order, NOT stable worker identities.
 // Display current active work only; completed/failed jobs remain in the history table.
 const current=snapshot.lanes.filter(l=>laneState(l,snapshot)==='active').slice(0,50);
 const configured=typeof snapshot.owner.configuredConcurrency==='number'?Math.min(50,number(snapshot.owner.configuredConcurrency)):null;
 for(let i=1;i<=50;i++) {
  const lane=current[i-1];const state=lane?'active':'idle';
  const vacant=configured===null?'設定未確認':i<=configured?'待機':'設定外';
  const item=el(doc,'article',undefined,`lane ${state}`);const top=el(doc,'div',undefined,'lane-top');top.append(el(doc,'span',String(i).padStart(2,'0')),el(doc,'span',lane?statusText(state):vacant));
  item.append(top,el(doc,'b',lane?boardText(lane.board):'—'));
  item.append(el(doc,'p',lane?pathText(lane.path):i<=(configured??0)?'処理中の記録なし':'—'));
  const phase=lane?(lane.callInFlight?'応答待ち':phases[lane.phase??'']??'状態確認中'):vacant;
  item.append(el(doc,'p',phase,'phase'),el(doc,'p',lane?`${elapsed(lane.elapsedMs)}${lane.elapsedSource==='observation'?' · 観測経過':lane.elapsedSource==='metric'?' · 記録値':''}`:' '));lanes.append(item);
 }
 const jobs=doc.getElementById('jobs')!;jobs.replaceChildren();
 const rows=snapshot.lanes.filter(l=>filter==='all'||(filter==='attention'?laneState(l,snapshot)==='attention':laneState(l,snapshot)===filter));
 for(const lane of rows) {const state=laneState(lane,snapshot);const row=el(doc,'tr');for(const value of [`${boardText(lane.board)} / ${pathText(lane.path)}`,statusText(state),state==='attention'?'結果の確認が必要':state==='complete'?'保存完了':lane.callInFlight?'応答待ち':phases[lane.phase??'']??'状態確認中',elapsed(lane.elapsedMs)])row.append(el(doc,'td',value));jobs.append(row);}
 if(!rows.length){const row=el(doc,'tr');const cell=el(doc,'td','表示対象の記録はありません');cell.setAttribute('colspan','4');row.append(cell);jobs.append(row);}
 const coverage=doc.getElementById('coverage')!;coverage.replaceChildren();
 for(const [label,value] of [['BB 初手',snapshot.coverage.root],['BTN · check後',snapshot.coverage.check]] as const) {const item=el(doc,'div',undefined,'coverage-item');item.append(el(doc,'h3',label),el(doc,'strong',shown(value.saved)),el(doc,'small',' / 22,100 保存済み'));
 const track=el(doc,'div',undefined,'track');const fill=el(doc,'div',undefined,'fill');fill.style.width=`${Math.min(100,number(value.saved)/22100*100)}%`;track.append(fill);item.append(track,el(doc,'p',`未保存 ${shown(value.missing)} · 保留 ${shown(value.blocked)} · 未検証 ${shown(value.unknown)}${value.parentPending!==undefined?` · 親未保存 ${shown(value.parentPending)}`:''}${value.zeroReach!==undefined?` · 到達なし ${shown(value.zeroReach)}`:''}`,'caption'));coverage.append(item);}
 doc.getElementById('coverage-age')!.dataset.tone=snapshot.coverage.stale?'amber':'neutral';
 set(doc,'coverage-age',`オフライン集計 ${dateText(snapshot.coverage.recordedAt)}${snapshot.coverage.stale?' · 更新待ち（ライブ保存数ではありません）':' · キュー操作は行いません'}`);
}
export function showFetchError(doc:Document):void {set(doc,'connection','接続できません · 最後の取得内容を保持');doc.getElementById('connection')!.dataset.tone='warning';const notice=doc.getElementById('notice')!;notice.hidden=false;notice.dataset.tone='warning';notice.textContent='最新の稼働状況は未確認です。通信が回復すると自動で読み取りを再開します。';}
export function start(doc:Document):()=>void {
 let stopped=false;let timer:ReturnType<typeof setTimeout>|undefined;let latest:Snapshot|null=null;let controller:AbortController|null=null;
 const filter=doc.getElementById('filter') as HTMLSelectElement;
 const onFilter=()=>{if(latest)render(doc,latest,filter.value);};filter.addEventListener('change',onFilter);
 async function poll(){if(stopped)return;controller=new AbortController();const timeout=setTimeout(()=>controller?.abort(),4000);try{const response=await fetch('/api/workers',{method:'GET',cache:'no-store',signal:controller.signal});if(!response.ok)throw Error('unavailable');const value=await response.json() as Snapshot;if(value.schemaVersion!==1||!Array.isArray(value.lanes)||!value.owner||!value.run||!value.counts||!value.coverage||!Array.isArray(value.warnings))throw Error('invalid');if(!stopped){latest=value;render(doc,value,filter.value);}}catch{if(!stopped)showFetchError(doc);}finally{clearTimeout(timeout);controller=null;if(!stopped)timer=setTimeout(poll,1000);}}
 void poll();return()=>{stopped=true;clearTimeout(timer);controller?.abort();filter.removeEventListener('change',onFilter);};
}
if(typeof document!=='undefined')start(document);

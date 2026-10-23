import { onDemandReviewWarnings } from "../../../shared/aiv2-ondemand-review-warnings.ts";
import { useEffect, useState } from "react";
import { StrategyMatrix } from "../components/StrategyMatrix.tsx";
import { accountApiBase } from "../account/config.ts";
import { accountSnapshot, subscribeAccount } from "../account/session.ts";
import { productLocale } from "../locale.ts";
import { browseActions, browsePath, onDemandRequest, savedSceneModel, validBoard } from "./aiv2-ondemand-client.ts";
import type { Capability, Job, SavedResult } from "./aiv2-ondemand-client.ts";
import "./ranges.css";
import "./aiv2-ondemand.css";
const storageKey="reysonai:aiv2:ondemand:browse:v1";
function restored(){try{const saved=JSON.parse(sessionStorage.getItem(storageKey)??"null");if(saved&&typeof saved.board==="string"&&Array.isArray(saved.path)){browsePath(saved.board,saved.path);return saved as {board:string;path:string[]};}}catch{}return {board:"As7d2c",path:[] as string[]};}
export function Aiv2OnDemandWorkspace(){
 const ja=productLocale()==="ja",t=(en:string,jp:string)=>ja?jp:en;
 const [location,setLocation]=useState(restored),[draft,setDraft]=useState(location.board),[nextCard,setNextCard]=useState("");
 const [user,setUser]=useState(()=>accountSnapshot().user?.id),[retry,setRetry]=useState(0),[cap,setCap]=useState<Capability|null>(null),[error,setError]=useState("");
 const [loaded,setLoaded]=useState<{key:string;result?:SavedResult;missing?:boolean}>({key:""}),[job,setJob]=useState<Job|null>(null),[submitting,setSubmitting]=useState(false),[hand,setHand]=useState("AA"),[combo,setCombo]=useState("");
 const base=accountApiBase(import.meta.env),key=JSON.stringify(location),jobKey=`${storageKey}:job:${user??"guest"}:${key}`,state=browsePath(location.board,location.path);
 useEffect(()=>subscribeAccount(()=>setUser(accountSnapshot().user?.id)),[]);
 useEffect(()=>{setCap(null);setError("");setLoaded({key:""});setJob(null);const abort=new AbortController();void onDemandRequest<Capability>(base,"status",undefined,abort.signal).then(value=>{if(!value.enabled)throw Error("disabled");if(typeof value.revision!=="string"||typeof value.implementationHash!=="string"||typeof value.sourceHash!=="string"||!value.limits||!Number.isInteger(value.limits.jobsPerUserDay)||!Number.isInteger(value.limits.maxProviderCalls))throw Error("invalid_capability");setCap(value);}).catch(e=>{if(!abort.signal.aborted)setError(e.message);});return()=>abort.abort();},[base,user,retry]);
 useEffect(()=>{try{sessionStorage.setItem(storageKey,key);}catch{}},[key]);
 useEffect(()=>{
  if(!cap)return;const abort=new AbortController();setLoaded({key:""});setJob(null);setError("");
  void onDemandRequest<{status:string;result?:SavedResult}>(base,`scene?board=${encodeURIComponent(location.board)}&path=${encodeURIComponent(JSON.stringify(location.path))}`,undefined,abort.signal).then(value=>{if(!abort.signal.aborted){setLoaded({key,result:value.result,missing:value.status==="not_generated"});if(!value.result){let id="";try{id=sessionStorage.getItem(jobKey)??"";}catch{}if(/^[a-f0-9]{64}$/.test(id))void onDemandRequest<Job>(base,`requests/${id}`,undefined,abort.signal).then(existing=>{if(!abort.signal.aborted){setJob(existing);if(existing.status==="complete"&&existing.result)setLoaded({key,result:existing.result});}},()=>{});}}},e=>{if(!abort.signal.aborted)setError(e.message);});
  return()=>abort.abort();
 },[base,cap,key,jobKey]);
 useEffect(()=>{if(!job)return;try{sessionStorage.setItem(jobKey,job.id);}catch{}},[job,jobKey]);
 useEffect(()=>{
  if(!job||!["queued","running"].includes(job.status))return;const abort=new AbortController();
  const timer=setTimeout(()=>{void onDemandRequest<Job>(base,`requests/${encodeURIComponent(job.id)}`,undefined,abort.signal).then(value=>{if(abort.signal.aborted)return;setJob(value);if(value.status==="complete"){if(value.result)setLoaded({key,result:value.result});else setError("invalid_result");}if(value.status==="failed")setError("generation_failed");},e=>{if(!abort.signal.aborted){setJob(null);setError(e.message);}});},2000);
  return()=>{clearTimeout(timer);abort.abort();};
 },[base,job,key]);
 let model=null,scene=null,invalid=false;
 if(cap&&loaded.key===key&&loaded.result){try{model=savedSceneModel(loaded.result,cap,location.board,location.path);scene=model?loaded.result.snapshot.scene:null;}catch{invalid=true;}}
 const pending=submitting||!!job&&["queued","running"].includes(job.status),cell=scene?.cells.find(c=>c.hand===hand),exact=cell?.overrides.find(row=>row.combo===combo)??cell?.overrides[0];
 const navigate=(path:string[])=>{setJob(null);setError("");setNextCard("");setLocation({...location,path});};
 const generate=async()=>{
  if(!cap||cap.ownerOnline===false||pending)return;setSubmitting(true);setError("");
  try{const value=await onDemandRequest<Job>(base,"requests",{board:location.board,path:location.path,consent:true});setJob(value);if(value.status==="complete"&&value.result)setLoaded({key,result:value.result});if(value.status==="failed")setError("generation_failed");}catch(e){setError(e instanceof Error?e.message:"request_failed");}finally{setSubmitting(false);}
 };
 const errorCopy=error==="sign_in_required"?t("Sign in to use on-demand AIv2.","オンデマンドAIv2を利用するにはログインしてください。"):error==="quota_exceeded"?t("Generation quota reached. No new request was created.","生成上限に達しました。新しい生成は開始していません。"):error==="disabled"?t("On-demand generation is not enabled on this deployment.","この環境ではオンデマンド生成は有効になっていません。"):t("Service unavailable or offline. No substitute is shown. Retry only when ready; no automatic generation retry.","サービスに接続できないか処理に失敗しました。代替表示や生成の自動再試行は行いません。");
 return <main className="shell aiv2-ondemand-workspace"><h1>AIv2 · {t("On-demand postflop","オンデマンド・ポストフロップ")}</h1>
 <p>100BB · BTN open 2.5BB → BB call · SRP · bet 33/66/125% · raise-to 2.5×</p>
 <p>{t("AI estimates, not GTO or solver solutions; strategic explanations are not independently reviewed. BB acts first; no assumed check. Missing decisions never use AI/GTO or the legacy five-board data. Only an explicit generation request can make provider calls.","AIによる近似推定で、GTO・ソルバー解ではありません。戦略説明の独立検証は未完了です。BBから開始し、チェックを仮定しません。未生成の局面はAI/GTOや旧5ボードで代用しません。明示的な生成操作のみ外部生成を開始します。")}</p>
 <form onSubmit={e=>{e.preventDefault();if(validBoard(draft)){setLocation({board:draft,path:[]});setJob(null);setError("");}}}><label>{t("Three-card flop","フロップ3枚")} <input value={draft} onChange={e=>setDraft(e.target.value)} placeholder="As7d2c" aria-invalid={!validBoard(draft)} maxLength={6}/></label> <button disabled={!validBoard(draft)||pending}>{t("Open flop","フロップを開く")}</button>{!validBoard(draft)&&<span role="status">{t("Enter three unique cards, e.g. As7d2c.","重複のない3枚をAs7d2cの形式で入力してください。")}</span>}</form>
 <nav aria-label={t("Action path","アクション履歴")}><button onClick={()=>navigate([])} disabled={pending}>{location.board} · BB</button>{location.path.map((token,i)=><button key={i} disabled={pending} onClick={()=>navigate(location.path.slice(0,i+1))}>{token}</button>)}</nav>
 <p>{state.street} · {state.board} · {state.actor} · {t("Pot","ポット")} {state.pot}BB</p>
 {error&&<div role="alert"><p>{errorCopy}</p><button disabled={pending} onClick={()=>setRetry(retry+1)}>{t("Retry read-only connection","接続を再確認（生成なし）")}</button></div>}
 {!cap&&!error&&<p role="status">{t("Checking availability and sign-in…","利用可否とログインを確認中…")}</p>}
 {cap?.ownerOnline===false&&<p role="status">{t("Generation worker offline. Saved decisions remain available; no new generation can start.","生成ワーカーがオフラインです。保存済み局面は閲覧できますが、新しい生成は開始できません。")}</p>}
 {cap&&<p>{t("Generation limits","生成上限")}: {cap.limits.jobsPerUserDay}{t(" jobs per day / user","件／日・ユーザー")} · {cap.limits.maxProviderCalls}{t(" provider calls per request","呼出／リクエスト")} · {t("Pinned source revision","固定ソース版")}: <code>{cap.revision.slice(0,12)}</code></p>}
 {state.kind==="terminal"?<p role="status">{t("Hand complete. No further decision.","ハンド終了。次の意思決定はありません。")}</p>:state.kind==="chance"?<form onSubmit={e=>{e.preventDefault();if(validBoard(state.board+nextCard,state.board.length/2+1))navigate([...location.path,nextCard]);}}><label>{t("Next card","次のカード")} <input maxLength={2} value={nextCard} onChange={e=>setNextCard(e.target.value)} placeholder="8h"/></label> <button disabled={pending||!validBoard(state.board+nextCard,state.board.length/2+1)}>{t("Deal card","カードを開く")}</button></form>:<div aria-label={t("Legal actions","合法アクション")}>{browseActions(state).map(a=><button disabled={pending} key={a.token} onClick={()=>navigate([...location.path,a.token])}>{a.token}{a.paid>0?` → ${a.to}BB`:""}</button>)}</div>}
 {cap&&state.kind==="decision"&&(!scene||invalid)&&<section className="matrix-panel"><h2>{t("Exact saved decision","正確な保存済み局面")}</h2><p role="status">{pending?`${t("Generation status","生成状態")}: ${submitting?"submitting":job?.status}`:invalid?t("Saved result failed source validation. No fallback.","保存結果のソース検証に失敗しました。代用しません。"):loaded.result?.status==="zero-reach"?t("This action path has zero reach. No policy is generated.","この履歴の到達ウェイトは0です。方針は生成しません。"):loaded.key!==key?t("Reading saved data…","保存データを確認中…"):t("Not generated for this exact path. No substitute is shown. A request may generate missing ancestor decisions first.","この正確な履歴は未生成です。代用はしません。生成依頼では不足する前提局面から生成する場合があります。")}</p>{loaded.key===key&&!invalid&&!scene&&!loaded.result&&<button disabled={pending||cap.ownerOnline===false} onClick={()=>void generate()}>{t("Request AIv2 generation (signed-in account quota)","AIv2生成を依頼（ログイン中アカウントの上限を使用）")}</button>}</section>}
 {scene&&model&&<>{onDemandReviewWarnings(scene.key,scene.provenance.artifact_hash??"").map(note=><aside key={note.id} role="alert" className="review-note"><strong>{t("Unresolved review finding · not independently approved","未解決のレビュー指摘・独立承認なし")}</strong><p translate="no">{ja?note.warning.ja:note.warning.en}</p></aside>)}<p translate="no">{ja?scene.range_reason.ja:scene.range_reason.en}</p><StrategyMatrix node={{actingPosition:scene.hero}} title={`${scene.hero} · ${scene.board.join("")}`} aggregates={model.aggregates} actions={model.actions} selected={hand} onSelect={setHand} boardCards={scene.board.join("")} ariaLabel={t("Saved AIv2 169-hand range","保存済みAIv2・169ハンドレンジ")} unreachableReason={t("Own reach is zero; no recommendation","自身の到達ウェイト0、推奨なし")}/><section className="ai-reason"><h2>{hand}</h2><p translate="no">{ja?cell?.reason.ja:cell?.reason.en}</p>{exact&&<><label>{t("Exact physical combo","正確な物理コンボ")} <select value={exact.combo} onChange={e=>setCombo(e.target.value)}>{cell?.overrides.map(row=><option key={row.combo}>{row.combo}</option>)}</select></label><p>{t("Own reach","自身の到達ウェイト")}: {exact.reach_weight}</p><p>{Object.entries(exact.mix).map(([action,freq])=>`${action} ${freq}%`).join(" · ")}</p><p translate="no">{ja?exact.reason.ja:exact.reason.en}</p></>}</section></>}
 </main>;
}

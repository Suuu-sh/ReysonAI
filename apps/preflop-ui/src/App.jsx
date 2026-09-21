import { useEffect, useState } from "react";
import { Spade, SquaresFour, ChartBar, Database, ArrowClockwise, CaretRight } from "@phosphor-icons/react";
import { SolveaGTOClient, SolveaGTOApiError } from "../../../packages/solveagto-sdk-ts/src/index.ts";
import { hands, pct, label, color, totals, expectedValue, strategyCombos } from "./data.js";

import { OPEN_SIZE_BB, positions, presets, responders, spotModes, spotRequest, spotTitle } from "./spot.js";

const api = new SolveaGTOClient({baseUrl:"/api"});
function Bars({items}) {
  return <div className="bars">{items.map((a,i)=><div className="bar-row" key={a.action}><span><i style={{background:color(a.action,i)}}/>{label(a.action)}</span><div className="track"><div style={{width:pct(a.frequency),background:color(a.action,i)}}/></div><b>{pct(a.frequency)}</b></div>)}</div>;
}
function App(){
  const [solutions,setSolutions]=useState([]),[sid,setSid]=useState("");
  const [spot,setSpot]=useState({mode:"open",opener:"BTN",actor:"BB"});
  const [result,setResult]=useState(null);
  const [selected,setSelected]=useState("AKs"),[filter,setFilter]=useState("all"),[tab,setTab]=useState("結果"),[section,setSection]=useState("プリフロップ");
  const [error,setError]=useState(""),[loading,setLoading]=useState(""),[reload,setReload]=useState(0);
  const [missing,setMissing]=useState(false),[retry,setRetry]=useState(0);
  const queryKey=JSON.stringify([sid,spot]);
  // Never render the previous matchup while a new request is pending.
  const node=result?.key===queryKey?result.node:null;
  let validation="";
  try { spotRequest(sid,spot); } catch(e) { validation=e.message; }

  useEffect(()=>{
    let live=true; setLoading("Solutionを取得中");setSolutions([]);setError("");setResult(null);setSid("");setMissing(false);
    api.preflop.listSolutions().then(v=>{if(live){setSolutions(v);setSid(v[0]?.solutionId??"");setLoading("");}}).catch(e=>{if(live){setError(e.message);setLoading("");}});
    return ()=>{live=false};
  },[reload]);
  useEffect(()=>{
    setResult(null);setMissing(false);setError("");setFilter("all");
    if(!sid||validation) { if(sid)setLoading(""); return; }
    let live=true;
    setLoading("指定局面を取得中");
    const request=spotRequest(sid,spot);
    api.preflop.resolve(request).then(v=>{
      if(!live)return;
      if(v.solutionId!==sid||v.node.actingPosition!==request.heroPosition) {
        throw new Error("取得した局面が選択条件と一致しません。");
      }
      setResult({key:queryKey,node:v.node});
      const available=strategyCombos(v.node);
      setSelected(current=>available.some(c=>c.hand===current)?current:available[0]?.hand??"");
      setMissing(!available.length);
      setLoading("");
    }).catch(e=>{
      if(!live)return;
      if(e instanceof SolveaGTOApiError && (e.status===400||e.status===404))setMissing(true);
      else setError(e.message);
      setLoading("");
    });
    return ()=>{live=false};
  },[queryKey,retry,validation]);

  function changeSpot(next) {
    setSpot(next);
    setResult(null);
    setMissing(false);
  }
  const solution=solutions.find(s=>s.solutionId===sid);
  const combos=strategyCombos(node), chosen=combos.filter(c=>c.hand===selected), mix=totals(combos), chosenMix=totals(chosen), ev=expectedValue(chosen);
  const aggregates=new Map([...new Set(combos.map(c=>c.hand))].map(hand=>{const entries=combos.filter(c=>c.hand===hand);return [hand,{hand,comboCount:entries.length,actions:Object.fromEntries(totals(entries).map(a=>[a.action,a.frequency]))}]}));
  const actions=mix.map(a=>a.action);
  return <div className="shell">
    <aside className="sidebar"><div className="brand"><Spade size={39} weight="fill"/><div>Solvea<span>GTO</span><small>Play Closer to Perfect</small></div></div>
      <nav>{[[SquaresFour,"プリフロップ"],[ChartBar,"ハンド詳細"],[Database,"計算情報"]].map(([Icon,name])=><button key={name} className={section===name?"active":""} onClick={()=>setSection(name)}><Icon size={21}/>{name}</button>)}</nav>
      <div className="side-note"><Spade size={23}/><strong>Preflop Explorer</strong><p>保存済みの計算結果を、<br/>ハンドから読み解く。</p><small>READ-ONLY / v0.1</small></div>
    </aside>
    <main><header><div><h1>より良い判断が、より強いあなたをつくる。</h1><p>局面を選び、戦略の違いをひとつずつ。</p></div><span className="badge">Preflop / 日本語</span></header>
    <div className="notice">実験モデル · GTO精度未検証 <span>表示値は保存済み計算結果です。現行Solverは本来のPoker CFR/DCFRではありません。</span></div>
    <section className="settings panel matchup-settings">
      <div><h3>保存済みSolution</h3><label>計算結果<select aria-label="Solution" value={sid} onChange={e=>{setResult(null);setSid(e.target.value)}} disabled={!solutions.length}>{!solutions.length&&<option>保存済み結果なし</option>}{solutions.map(s=><option key={s.solutionId}>{s.solutionId}</option>)}</select></label><small>APIから取得 · 閲覧時の計算なし</small></div>
      <div className="spot-setting">
        <div className="spot-heading"><h3>局面設定</h3><small>オープンサイズ：{OPEN_SIZE_BB} BB固定</small></div>
        <div className="spot-fields">
          <label>局面タイプ<select aria-label="局面タイプ" value={spot.mode} onChange={e=>changeSpot({...spot,mode:e.target.value})}>{spotModes.map(mode=><option key={mode.id} value={mode.id}>{mode.label}</option>)}</select></label>
          <label>オープン位置<select aria-label="オープン位置" value={spot.opener} onChange={e=>{
            const opener=e.target.value, allowed=responders(opener);
            changeSpot({...spot,opener,actor:allowed.includes(spot.actor)?spot.actor:allowed[0]});
          }}>{positions.slice(0,-1).map(p=><option key={p}>{p}</option>)}</select></label>
          <label>{spot.mode === "open" ? "対応位置" : "3bettor位置"}<select aria-label="相手位置" value={spot.actor} onChange={e=>changeSpot({...spot,actor:e.target.value})}>{responders(spot.opener).map(p=><option key={p}>{p}</option>)}</select></label>
        </div>
        <div className="spot-presets" aria-label="局面プリセット">{presets.map((p,index)=><button key={p.mode+p.opener+p.actor+index} aria-pressed={spot.mode===p.mode&&spot.opener===p.opener&&spot.actor===p.actor} onClick={()=>changeSpot({...spot,...p})}>{p.mode === "open" ? `${p.opener} vs ${p.actor}` : `${p.opener} → ${p.actor} ${p.mode === "three_bet" ? "3bet" : "4bet"}`}</button>)}</div>
      </div>
      <button className="primary" onClick={()=>sid?setRetry(v=>v+1):setReload(v=>v+1)} disabled={!!loading||!!validation}><ArrowClockwise size={17}/>局面を表示</button>
    </section>
    {validation&&<p role="alert" className="state error">{validation}</p>}
    {loading&&<p role="status" className="state">{loading}…</p>}
    {error&&<div role="alert" className="state error">取得できませんでした。APIの起動・保存先を確認してください。<details><summary>エラー詳細</summary>{error}</details><button onClick={()=>sid?setRetry(v=>v+1):setReload(v=>v+1)}>再試行</button></div>}
    {!loading&&!error&&!validation&&(!solutions.length||missing)&&<div className="state" role="status"><h2>{spotTitle(spot)}</h2><p>{!solutions.length?"保存済みSolutionがありません。":"この条件に一致する保存済み戦略データがありません。"}局面設定はできますが、結果は表示しません。</p></div>}
    {!loading&&!error&&!validation&&!missing&&node&&<>
      <div className="tabs">{["結果","Combo別EV"].map(t=><button className={tab===t?"selected":""} key={t} onClick={()=>setTab(t)}>{t}</button>)}<span>{spotTitle(spot)} <CaretRight/> {node.actingPosition} の戦略</span></div>
      {section==="計算情報"?<section className="panel metadata"><h2>計算情報</h2>{Object.entries(solution??{}).map(([k,v])=><p key={k}><span>{k}</span><code>{String(v)}</code></p>)}<p>精度・Exploitability：未検証。EVは実験モデルの推定値。</p></section>:
      !combos.length?<div className="state" role="status">この局面には保存済みの戦略データがありません。</div>:<div className={"results "+(section==="ハンド詳細"?"detail-only ":"")+((tab==="Combo別EV"||section==="ハンド詳細")?"has-combos":"")}>
        {section!=="ハンド詳細"&&<section className="panel matrix-panel"><div className="panel-heading"><h2>{node.actingPosition??"終端"} の戦略</h2><select aria-label="表示アクション" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">すべてのアクション</option>{actions.map(a=><option key={a} value={a}>{label(a)}</option>)}</select></div>
          <div className="matrix-scroll"><div className="matrix" aria-label="169ハンド">{hands.map(hand=>{const h=aggregates.get(hand);return !h?<div className="empty-hand" key={hand}/>:<button key={hand} aria-pressed={selected===hand} aria-label={hand} className={selected===hand?"picked":""} onClick={()=>setSelected(hand)} disabled={!h?.comboCount}><strong>{hand}</strong>{filter!=="all"&&<small>{h?.comboCount&&Number.isFinite(h.actions[filter])?pct(h.actions[filter]):""}</small>}<div className="cell-mix">{actions.map((a,i)=><span key={a} style={{width:pct(h?.actions[a]??0),background:color(a,i),opacity:filter==="all"||filter===a?1:.15}}/>)}</div></button>})}</div></div>
          <div className="legend">{actions.map((a,i)=><span key={a}><i style={{background:color(a,i)}}/>{label(a)}</span>)}</div>
        </section>}
        <div className="summary-column"><section className="panel"><h2>アクション頻度（全Combo）</h2><Bars items={mix}/><small>保存されたComboを等重みで集計。到達レンジ加重ではありません。</small></section><section className="panel"><h2>レンジの概要</h2><dl><dt>保存Combo数</dt><dd>{combos.length} / 1326</dd><dt>ハンドクラス</dt><dd>{[...aggregates.values()].filter(h=>h.comboCount>0).length} / 169</dd><dt>Iterations</dt><dd>{solution?.iterations}</dd></dl></section></div>
        {chosen.length>0&&<div className="detail-column"><section className="panel"><h2>選択ハンドの詳細</h2><div className="hand-title">{selected}<span>{chosen.length} Combos</span></div><dl>{ev!==null&&<><dt>戦略加重EV</dt><dd>{ev.toFixed(3)} BB</dd></>}<dt>評価モデル</dt><dd>実験モデル</dd></dl></section><section className="panel"><h2>このハンドのアクション内訳</h2><Bars items={chosenMix}/></section></div>}
        {chosen.length>0&&(tab==="Combo別EV"||section==="ハンド詳細")&&<section className="panel combo-table"><h2>{selected} · Combo別の頻度とEV</h2><div className="table-scroll"><table><thead><tr><th>Combo</th>{chosen[0]?.actions.map(a=><th key={a.action}>{label(a.action)}<small>頻度 / EV (BB)</small></th>)}</tr></thead><tbody>{chosen.map(c=><tr key={c.combo}><th>{c.combo}</th>{c.actions.map(a=><td key={a.action}>{pct(a.frequency)}{Number.isFinite(a.evBb)&&<> / {a.evBb.toFixed(3)}</>}</td>)}</tr>)}</tbody></table></div></section>}
      </div>}
    </>}
    <footer>SolveaGTO v0.1 <span>保存済みデータ専用 · 実験モデル</span></footer></main>
  </div>;
}
export {App};

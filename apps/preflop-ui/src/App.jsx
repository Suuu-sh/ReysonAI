import { useEffect, useState } from "react";
import { Spade, SquaresFour, ChartBar, Database, ArrowClockwise, CaretRight } from "@phosphor-icons/react";
import { SolveaGTOClient } from "../../../packages/solveagto-sdk-ts/src/index.ts";
import { hands, pct, label, color, history, totals, expectedValue, strategyCombos } from "./data.js";

const api = new SolveaGTOClient({baseUrl:"/api"});
function Bars({items}) {
  return <div className="bars">{items.map((a,i)=><div className="bar-row" key={a.action}><span><i style={{background:color(a.action,i)}}/>{label(a.action)}</span><div className="track"><div style={{width:pct(a.frequency),background:color(a.action,i)}}/></div><b>{pct(a.frequency)}</b></div>)}</div>;
}
function App(){
  const [solutions,setSolutions]=useState([]),[sid,setSid]=useState(""),[nodes,setNodes]=useState([]),[nid,setNid]=useState(""),[node,setNode]=useState(null);
  const [selected,setSelected]=useState("AKs"),[filter,setFilter]=useState("all"),[tab,setTab]=useState("結果"),[section,setSection]=useState("プリフロップ");
  const [error,setError]=useState(""),[loading,setLoading]=useState(""),[reload,setReload]=useState(0);
  useEffect(()=>{
    let live=true; setLoading("Solutionを取得中");setSolutions([]);setError("");setNode(null);setNodes([]);setSid("");setNid("");
    api.preflop.listSolutions().then(v=>{if(live){setSolutions(v);setSid(v[0]?.solutionId??"");setLoading("");}}).catch(e=>{if(live){setError(e.message);setLoading("");}});
    return ()=>{live=false};
  },[reload]);
  useEffect(()=>{
    if(!sid)return;let live=true;setNode(null);setNodes([]);setNid("");setError("");setLoading("保存済み局面を取得中");
    api.preflop.listNodes(sid).then(v=>{if(live){setNodes(v);setNid(v.find(n=>n.hasStrategy)?.nodeId??v[0]?.nodeId??"");setLoading("");}}).catch(e=>{if(live){setError(e.message);setLoading("");}});
    return ()=>{live=false};
  },[sid]);
  useEffect(()=>{
    if(!sid||!nid)return;let live=true;setNode(null);setError("");setLoading("戦略データを取得中");setFilter("all");
    api.preflop.getSolutionNode(sid,nid).then(v=>{if(live){setNode(v);setSelected(strategyCombos(v).some(c=>c.hand===selected)?selected:strategyCombos(v)[0]?.hand??"");setLoading("");}}).catch(e=>{if(live){setError(e.message);setLoading("");}});
    return ()=>{live=false};
  },[sid,nid]);
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
    <section className="settings panel">
      <div><h3>保存済みSolution</h3><label>計算結果<select aria-label="Solution" value={sid} onChange={e=>{setNode(null);setSid(e.target.value)}} disabled={!solutions.length}>{!solutions.length&&<option>保存済み結果なし</option>}{solutions.map(s=><option key={s.solutionId}>{s.solutionId}</option>)}</select></label><small>APIから取得 · 閲覧時の計算なし</small></div>
      <div><h3>ストリート</h3><span className="street">プリフロップ</span><p className="muted">Postflopは対象外</p></div>
      <div className="spot-setting"><h3>局面設定</h3><label>保存されているアクション履歴<select aria-label="局面" value={nid} disabled={!nodes.length} onChange={e=>{setNode(null);setNid(e.target.value)}}>{nodes.map(n=><option key={n.nodeId} value={n.nodeId}>{history(n)} · {n.actingPosition??n.nodeType}</option>)}</select></label><small>{!loading&&!error&&node&&<>手番：{node.actingPosition??"終端"}{Number.isFinite(node.potBb)&&<> / Pot：{node.potBb} BB</>}{Number.isFinite(node.effectiveStackBb)&&<> / 有効スタック：{node.effectiveStackBb} BB</>}</>}</small></div>
      <button className="primary" onClick={()=>setReload(v=>v+1)} disabled={!!loading}><ArrowClockwise size={17}/>結果を再取得</button>
    </section>
    {loading&&<p role="status" className="state">{loading}…</p>}
    {error&&<div role="alert" className="state error">取得できませんでした。APIの起動・保存先を確認してください。<details><summary>エラー詳細</summary>{error}</details><button onClick={()=>setReload(v=>v+1)}>再試行</button></div>}
    {!loading&&!error&&!solutions.length&&<div className="state"><h2>保存済みの計算結果がありません</h2><p>Workerで生成したSolutionをAPIの保存先に配置してください。データが保存されるまで、戦略は表示しません。</p></div>}
    {!loading&&!error&&node&&<>
      <div className="tabs">{["結果","Combo別EV"].map(t=><button className={tab===t?"selected":""} key={t} onClick={()=>setTab(t)}>{t}</button>)}<span>{node.actingPosition??"終端局面"} <CaretRight/> {node.nodeType}</span></div>
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

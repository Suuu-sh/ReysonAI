import { barColor } from "../components/primitives.tsx";
import { label, pct } from "../data.ts";
import "./postflop-hand-ev.css";
import { localized } from "../i18n.ts";

const signed = value => `${value > 0 ? "+" : ""}${value.toFixed(2)}bb`;

// Preflop has a saved model EV for calling, not per-action or policy-mix EV.
// Keep the postflop visual notation without implying that uncomputed actions are zero.
export function PreflopCallEvBars({ items, labels = {}, facts, equityLabel = "勝率" }) {
  const { eqr, equityPct, callEvBb } = facts;
  if (![eqr, equityPct, callEvBb].every(Number.isFinite)) return null;

  return <div className="hand-ev-breakdown preflop-call-ev">
    <dl className="hand-ev-summary">
      <div><dt>EQR（仮定）</dt><dd>{eqr.toFixed(2)}</dd></div>
      <div><dt>{equityLabel}</dt><dd>{equityPct.toFixed(1)}%</dd></div>
      <div><dt>コールEV（推定）</dt><dd className={callEvBb >= 0 ? "ev-positive" : "ev-negative"}>{signed(callEvBb)}</dd></div>
    </dl>
    <div className="bars">
      {items.map((item, index) => <div className="bar-row with-ev" key={item.action} style={{ "--i": index }}>
        <span><i style={{ background: barColor(item.action) }} />{labels[item.action] ?? label(item.action)}</span>
        <div className="track" aria-hidden="true"><div style={{ width: pct(item.frequency), background: barColor(item.action) }} /></div>
        <b>{pct(item.frequency)}</b>
        <em className={item.action === "call" ? (callEvBb >= 0 ? "ev-positive" : "ev-negative") : "ev-unavailable"}>
          {item.action === "call" ? signed(callEvBb) : "—"}
        </em>
      </div>)}
    </div>
    <small className="hand-ev-note">{localized("Only call EV is shown at the right. A dash means not calculated, not zero bb. Call EV is an approximation using saved equity and assumed EQR after subtracting the extra amount needed to call. It is not the policy's average EV, another action's EV, or solver/GTO EV.", "右端はコールのEVのみ表示します。「—」は未計算で、0bbではありません。コールEVはこの判断で追加するコール額を差し引いた、保存済みの勝率と仮定EQRによる概算です。方針全体の平均EVや他の行動のEVではなく、GTO・ソルバーのEVでもありません。")}</small>
  </div>;
}

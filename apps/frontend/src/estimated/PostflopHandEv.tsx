import { useEffect, useState } from "react";
import { barColor } from "../components/primitives.tsx";
import { label, pct } from "../data.ts";
import { postflopUrl } from "./postflop-api.ts";
import { computePostflopHandEvInWorker, isAbortError } from "./postflop-browser.ts";
import { storedFlopHandEvInput } from "./postflop-compute.ts";
import "./postflop-hand-ev.css";

const signed = value => `${value > 0 ? "+" : ""}${value.toFixed(2)}bb`;

// Local-only per-hand action EV and EQR for the flop pilot (AI policy self-play).
// `history` is the flop actions before the decision shown, e.g. ["bet33", "raise"];
// `spot` is the heads-up single-raised-pot id (the server defaults to BTN_open_BB_call).
export function handEvQuery(board, history, hand, spot) {
  return postflopUrl("hand-ev", { ...(spot ? { spot } : {}), board, history: history.join(","), hand });
}

export function useHandEv(board, history = [], hand, spot, options = {}) {
  const url = board && hand ? handEvQuery(board, history, hand, spot) : null;
  const datasets = options.datasets;
  const flopCandidate = options.flopCandidate;
  const laterCandidate = options.laterCandidate;
  const flopBase = options.flopBase;
  const precomputed = Boolean(options.precomputed);
  const key = url && `${url}|${flopCandidate?.metadata?.source_hash ?? ""}|${flopCandidate?.metadata?.policy_hash ?? ""}|${laterCandidate?.metadata?.policy_hash ?? "reference"}`;
  const [state, setState] = useState({ key: null, data: null, error: null });
  useEffect(() => {
    if (!url || !key || !datasets || !flopCandidate) return undefined;
    const controller = new AbortController();
    const load = async () => {
      const stored = storedFlopHandEvInput({ spotId: spot, board, history, hand, datasets, flopCandidate, laterCandidate, flopBase });
      if (stored) { setState({ key, data: stored, error: null }); return; }
      if (precomputed) {
        try {
          const response = await fetch(url, { signal: controller.signal });
          const result = await response.json();
          if (response.ok && result.spot === spot && result.hand === hand && result.row && Number.isFinite(result.row.mix_ev_bb)) {
            setState({ key, data: result, error: null });
            return;
          }
        } catch (error) {
          if (isAbortError(error)) return;
          // Missing or stale representative-board EV falls through to the same pure worker path.
        }
      }
      try {
        const result = await computePostflopHandEvInWorker({ street: "flop", spotId: spot, board,
          history, hand, datasets, flopCandidate, laterCandidate, flopBase }, controller.signal);
        if (controller.signal.aborted) return;
        if (result.kind !== "ai_estimate_not_gto" || result.spot !== spot || result.hand !== hand ||
            result.street !== "flop" || !result.node || result.row && !Number.isFinite(result.row.mix_ev_bb)) {
          throw new Error("EVの局面が選択中の判断と一致しません。");
        }
        setState({ key, data: result, error: null });
      } catch (error) {
        if (!isAbortError(error)) setState({ key, data: null, error: error.message });
      }
    };
    load();
    return () => controller.abort();
  }, [board, datasets, flopBase, flopCandidate, hand, history.join(","), key, laterCandidate, precomputed, spot, url]);
  if (!url || !datasets || !flopCandidate) return { data: null, error: null, loading: false };
  return state.key === key ? { ...state, loading: false } : { data: null, error: null, loading: true };
}

// The expanded action breakdown: frequency bars with each action's EV beside them,
// and the hand's EQR / equity / mix EV above. EV is stored per hand class, so a
// single selected combo shows its own frequencies without EV.
export function HandEvBars({ items, labels = {}, ev, comboSelected = false }) {
  const row = !comboSelected ? ev?.data?.row : null;
  const best = row ? items.reduce((top, item) => row.ev_bb[item.action] > row.ev_bb[top] ? item.action : top, items[0].action) : null;
  const status = comboSelected ? "EVはハンド平均で表示します（「平均」を選ぶと出ます）。"
    : ev?.error ?? (ev?.loading ? "EVを読み込み中…" : ev?.data && !ev.data.row ? "このハンドはこの場面に来ません（前の行動の頻度が0%）。" : null);
  return <div className="hand-ev-breakdown">
    {row && <dl className="hand-ev-summary">
      <div><dt>EQR</dt><dd>{row.eqr === null ? "—" : row.eqr.toFixed(2)}</dd></div>
      <div><dt>勝率</dt><dd>{row.equity_pct.toFixed(1)}%</dd></div>
      <div><dt>平均EV（方針どおり）</dt><dd className={row.mix_ev_bb >= 0 ? "ev-positive" : "ev-negative"}>{signed(row.mix_ev_bb)}</dd></div>
    </dl>}
    <div className="bars">
      {items.map((item, index) => {
        const value = row?.ev_bb[item.action];
        return <div className={`bar-row${row ? " with-ev" : ""}${item.action === best ? " best-ev" : ""}`} key={item.action} style={{ "--i": index }}>
          <span><i style={{ background: barColor(item.action) }} />{labels[item.action] ?? label(item.action)}</span>
          <div className="track" aria-hidden="true"><div style={{ width: pct(item.frequency), background: barColor(item.action) }} /></div>
          <b>{pct(item.frequency)}</b>
          {row && <em className={value >= 0 ? "ev-positive" : "ev-negative"} title={item.action === best ? "EVが最大のアクション" : undefined}>{signed(value)}</em>}
        </div>;
      })}
    </div>
    {status && <p className="hand-ev-status">{status}</p>}
  </div>;
}

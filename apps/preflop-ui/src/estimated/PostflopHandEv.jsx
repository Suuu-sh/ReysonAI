import { useEffect, useState } from "react";
import { barColor } from "../components/primitives.jsx";
import "./postflop-hand-ev.css";

const actionLabels = { check: "Check", bet33: "Bet 33%", bet75: "Bet 75%", fold: "Fold", call: "Call", raise: "Raise 3×" };
const signed = value => `${value > 0 ? "+" : ""}${value.toFixed(2)}bb`;

// Local-only per-hand action EV and EQR for the flop pilot (AI policy self-play).
// `history` is the flop actions before the decision shown, e.g. ["bet33", "raise"].
export function handEvQuery(board, history, hand) {
  return `/local-postflop-hand-ev?${new URLSearchParams({ board, history: history.join(","), hand })}`;
}

export function HandEvView({ data }) {
  const { row, pot_bb: pot } = data;
  if (!row) return <p className="postflop-hand-ev-empty">このハンドはこの場面に来ません（前の行動の頻度が0%）。</p>;
  const actions = Object.keys(row.ev_bb);
  const best = actions.reduce((top, action) => row.ev_bb[action] > row.ev_bb[top] ? action : top, actions[0]);
  return <>
    <dl className="postflop-hand-ev-summary">
      <div><dt>EQR</dt><dd>{row.eqr === null ? "—" : row.eqr.toFixed(2)}</dd></div>
      <div><dt>勝率</dt><dd>{row.equity_pct.toFixed(1)}%</dd></div>
      <div><dt>平均EV（方針どおり）</dt><dd className={row.mix_ev_bb >= 0 ? "ev-positive" : "ev-negative"}>{signed(row.mix_ev_bb)}</dd></div>
    </dl>
    <table className="postflop-hand-ev-table">
      <thead><tr><th>アクション</th><th>頻度</th><th>EV</th></tr></thead>
      <tbody>{actions.map(action => <tr key={action} className={action === best ? "best" : undefined}>
        <td><i style={{ background: barColor(action) }} aria-hidden="true" />{actionLabels[action] ?? action}{action === best && <small>最大</small>}</td>
        <td>{row.mix[action]}%</td>
        <td className={row.ev_bb[action] >= 0 ? "ev-positive" : "ev-negative"}>{signed(row.ev_bb[action])}</td>
      </tr>)}</tbody>
    </table>
    <small className="postflop-hand-ev-note">
      EVはこの判断から先に得るチップ（それまでに入れた分は含めない）。EQR = 平均EV ÷（勝率 × レーキ後ポット {pot}bb）。
      AI方針どうしの自己対戦で、1アクションあたり{data.samples.toLocaleString()}回のシミュレーションから見積もった値です。GTO・ソルバーのEVではありません。
    </small>
  </>;
}

export function PostflopHandEv({ board, history = [], hand }) {
  const url = board && hand ? handEvQuery(board, history, hand) : null;
  const [state, setState] = useState({ url: null, data: null, error: null });
  useEffect(() => {
    if (!url) return undefined;
    const controller = new AbortController();
    fetch(url, { signal: controller.signal })
      .then(async response => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "EVを読み込めません。");
        setState({ url, data: result, error: null });
      })
      .catch(error => { if (error.name !== "AbortError") setState({ url, data: null, error: error.message }); });
    return () => controller.abort();
  }, [url]);
  if (!url) return null;
  const current = state.url === url ? state : { data: null, error: null };
  return <section className="postflop-hand-ev" aria-label="ハンドのEVとEQR">
    <h3>EV・EQR</h3>
    {current.error ? <p className="postflop-hand-ev-empty">{current.error}</p>
      : current.data ? <HandEvView data={current.data} /> : <p className="postflop-hand-ev-empty">読み込み中…</p>}
  </section>;
}

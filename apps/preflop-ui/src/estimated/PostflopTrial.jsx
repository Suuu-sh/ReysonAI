import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "@phosphor-icons/react";
import { ActionBars, barColor, Panel, SectionHeading, StatusState } from "../components/primitives.jsx";
import { StrategyMatrix } from "../components/StrategyMatrix.jsx";
import { HandEvBars, useHandEv } from "./PostflopHandEv.jsx";
import { actionReason, dominantTier, evidenceReason, textureLabels, tierLabels } from "./postflop-reasons.js";
import { flopDecision, recognizedFlop, representativeFlops } from "./postflop-trial.js";
import { isFlopBet } from "../../scripts/postflop-ai/tree.mjs";
import { productLocale } from "../i18n.js";

const baseLabels = { check: "チェック", bet33: "ベット 33%", bet75: "ベット 75%", bet125: "ベット 125%", fold: "フォールド", call: "コール", raise: "3倍チェックレイズ" };
// Raising a lead (ip_vs_*) is a plain raise, not a check-raise.
export const labelsFor = node => node?.startsWith("ip_") ? { ...baseLabels, raise: "3倍レイズ" } : baseLabels;
// btn_* nodes are the in-position player's decisions, bb_* the out-of-position player's.
export const nodeTitle = (node, { ip, oop }) => (productLocale() === "en" ? {
  btn_first: `${ip} · facing ${oop}'s check`, bb_vs_33: `${oop} · facing a 33% bet`,
  bb_vs_75: `${oop} · facing a 75% bet`, bb_vs_125: `${oop} · facing a 125% bet`, btn_vs_raise: `${ip} · facing a check-raise`,
  oop_first: `${oop} · first decision`, ip_vs_33: `${ip} · facing a 33% bet`,
  ip_vs_75: `${ip} · facing a 75% bet`, ip_vs_125: `${ip} · facing a 125% bet`, oop_vs_raise: `${oop} · facing a raise`,
} : {
  btn_first: `${ip} · ${oop}のチェックへの応答`, bb_vs_33: `${oop} · 33%ベットへの応答`,
  bb_vs_75: `${oop} · 75%ベットへの応答`, bb_vs_125: `${oop} · 125%ベットへの応答`, btn_vs_raise: `${ip} · チェックレイズへの応答`,
  oop_first: `${oop} · 最初の判断（先にベットできる）`, ip_vs_33: `${ip} · 33%ベットへの応答`,
  ip_vs_75: `${ip} · 75%ベットへの応答`, ip_vs_125: `${ip} · 125%ベットへの応答`, oop_vs_raise: `${oop} · レイズへの応答`,
})[node];
export const suitLabels = { s: "♠", h: "♥", d: "♦", c: "♣" };

function rangeTotals(node) {
  const totals = Object.fromEntries(node.actions.map(action => [action, 0]));
  let combos = 0;
  for (const row of node.rows) {
    if (!row.reachable || !row.comboCount) continue;
    combos += row.comboCount;
    for (const action of node.actions) totals[action] += (row.mix[action] ?? 0) * row.comboCount;
  }
  return { combos, items: node.actions.map(action => ({ action, frequency: combos ? totals[action] / combos : 0 })) };
}

function BoardCards({ cards }) {
  return <span className="postflop-board-cards">{cards.map((card, index) => card
    ? <span key={index} className={`postflop-card suit-${card[1]}`}>{card[0]}{suitLabels[card[1]]}</span>
    : <span key={index} className="postflop-card empty">?</span>)}</span>;
}

const groupTitles = {
  value: ["バリュー", "こちらが勝率で上回る手がコール"],
  foldBetter: ["降ろせる格上", "勝率で上回られている手が降りる"],
  continueBetter: ["続けてくる格上", "勝率で上回られたまま続行される"],
  ahead: ["有利な相手", "勝率50%以上"],
  behind: ["不利な相手", "勝率50%未満"],
};
const pct0 = value => `${Math.round(value * 100)}%`;

function detailSummary(action, detail, equity) {
  if (productLocale() === "en") {
    if (detail.required != null) return `Equity ${pct0(equity)} ${equity >= detail.required ? "≥" : "<"} required ${pct0(detail.required)}${action === "fold" ? equity >= detail.required ? "; folding gives up equity" : "; calling is unfavorable" : ""}`;
    if (detail.foldShare != null) return `Opponent folds ${pct0(detail.foldShare)} · equity ${pct0(equity)}`;
    return `Equity versus opponent range ${pct0(equity)}`;
  }
  if (detail.required != null) {
    const enough = equity >= detail.required;
    return action === "fold"
      ? `勝率 ${pct0(equity)} ${enough ? "≥" : "<"} 必要勝率 ${pct0(detail.required)}${enough ? "。降りると取り分を捨てます" : "。コールは割に合いません"}`
      : `勝率 ${pct0(equity)} ${enough ? "≥" : "<"} 必要勝率 ${pct0(detail.required)}`;
  }
  if (detail.foldShare != null) return `相手が降りる ${pct0(detail.foldShare)} ・ 勝率 ${pct0(equity)}`;
  return `相手レンジへの勝率 ${pct0(equity)}`;
}

function ActionDetail({ action, explain }) {
  const detail = explain?.actions?.[action];
  if (!detail) return null;
  return <details className="postflop-action-detail">
    <summary>{detailSummary(action, detail, explain.equity)}</summary>
    <dl>
      {detail.groups.filter(group => group.share >= 0.005).map(group => <div key={group.key} className={`group-${group.key}`}>
        <dt><strong>{groupTitles[group.key][0]}</strong><span>{groupTitles[group.key][1]}</span><b>{pct0(group.share)}</b></dt>
        <dd>{group.hands.map(hand => <span key={hand.hand} title={tierLabels[hand.tier]} className={`tier-${hand.tier}`}>{hand.hand}</span>)}</dd>
      </div>)}
    </dl>
  </details>;
}

function HandReasons({ node, hand, actions, texture, explain, labels }) {
  if (!hand.tiers) return null;
  const tier = dominantTier(hand.tiers);
  const shares = Object.entries(hand.tiers).filter(([, share]) => share >= 0.005).sort((a, b) => b[1] - a[1]);
  const pct = value => `${Math.round(value * 100)}%`;
  const english = productLocale() === "en";
  const englishTier = { monster: "two pair or better", strong: "top pair or better", draw: "a draw", medium: "a weak pair", air: "air" };
  const englishTexture = { dry: "Dry board", wet: "Wet board", monotone: "Monotone board", paired: "Paired board" };
  return <div className="postflop-reasons">
    <p className="postflop-reason-tier">
      {english ? shares.length === 1 ? <>On this board, this hand is <strong>{englishTier[tier]}</strong>.</>
        : <>Strength varies by combo: {shares.map(([name, share]) => `${englishTier[name]} ${pct(share)}`).join(", ")}. The explanation uses the most common tier, <strong>{englishTier[tier]}</strong>.</>
        : shares.length === 1 ? <>このボードでは<strong>{tierLabels[tier]}</strong>です。</>
        : <>コンボによって強さが分かれます：{shares.map(([name, share]) => `${tierLabels[name]} ${pct(share)}`).join("・")}。理由は最も多い<strong>{tierLabels[tier]}</strong>で説明します。</>}
      {texture && <span>{english ? englishTexture[texture] : textureLabels[texture]}</span>}
    </p>
    <ul>
      {actions.filter(action => hand.actions[action] >= 0.005).sort((a, b) => hand.actions[b] - hand.actions[a]).map(action =>
        {
          const evidence = evidenceReason(action, explain?.actions?.[action], explain?.equity);
          return <li key={action}><b style={{ "--reason-color": barColor(action) }}>{labels[action]} {pct(hand.actions[action])}</b>
            {evidence ? <><span className="postflop-reason-evidence">{evidence}</span><small className="postflop-reason-general">{actionReason(node, action, tier)}</small></> : actionReason(node, action, tier)}
            <ActionDetail action={action} explain={explain} /></li>;
        })}
    </ul>
  </div>;
}

const suitOrder = ["s", "h", "d", "c"];

function mixGradient(mix, actions) {
  let at = 0;
  const stops = actions.filter(action => mix[action] > 0).map(action => {
    const from = at; at += mix[action] * 100;
    return `${barColor(action)} ${from}% ${at}%`;
  });
  return stops.length ? `linear-gradient(90deg, ${stops.join(", ")})` : undefined;
}

function ComboPicker({ hand, combos, actions, selected, onSelect, labels }) {
  if (!combos?.length) return null;
  const pair = hand[0] === hand[1];
  const byCell = new Map(combos.map(combo => {
    let [first, second] = [combo.cards[1], combo.cards[3]];
    if (pair && suitOrder.indexOf(first) > suitOrder.indexOf(second)) [first, second] = [second, first];
    return [`${first}${second}`, combo];
  }));
  const possible = (row, col) => pair ? suitOrder.indexOf(row) < suitOrder.indexOf(col) : hand.endsWith("s") ? row === col : row !== col;
  const pct = value => `${Math.round(value * 100)}%`;
  return <div className="postflop-suit-picker">
    <div className="postflop-suit-grid" role="group" aria-label="スートの組み合わせ">
      <span />
      {suitOrder.map(suit => <span key={suit} className={`postflop-suit-head suit-${suit}`}>{hand[1]}{suitLabels[suit]}</span>)}
      {suitOrder.map(row => <div key={row} className="postflop-suit-row">
        <span className={`postflop-suit-head suit-${row}`}>{hand[0]}{suitLabels[row]}</span>
        {suitOrder.map(col => {
          const combo = byCell.get(`${row}${col}`);
          if (!possible(row, col)) return <span key={col} className="postflop-suit-cell void" aria-hidden="true" />;
          if (!combo) return <span key={col} className="postflop-suit-cell blocked" title="ボードのカードと重なるため存在しません">×</span>;
          const top = actions.reduce((best, action) => combo.mix[action] > combo.mix[best] ? action : best);
          return <button type="button" key={col} className={`postflop-suit-cell${selected === combo.cards ? " selected" : ""}`}
            style={{ background: mixGradient(combo.mix, actions) }} aria-pressed={selected === combo.cards}
            aria-label={`${hand[0]}${suitLabels[row]} ${hand[1]}${suitLabels[col]}：${tierLabels[combo.tier]}、${labels[top]} ${pct(combo.mix[top])}`}
            title={`${tierLabels[combo.tier]}｜${actions.map(action => `${labels[action]} ${pct(combo.mix[action])}`).join(" / ")}`}
            onClick={() => onSelect(selected === combo.cards ? "all" : combo.cards)}>
            {combo.tier !== "air" && combo.tier !== "medium" && <i className={`postflop-tier-dot tier-${combo.tier}`} />}
          </button>;
        })}
      </div>)}
    </div>
    <div className="postflop-suit-side">
      <button type="button" className={`postflop-suit-all${selected === "all" ? " selected" : ""}`} aria-pressed={selected === "all"} onClick={() => onSelect("all")}>すべて（平均）</button>
      <ul className="postflop-tier-legend">
        <li><i className="postflop-tier-dot tier-monster" />強い役</li>
        <li><i className="postflop-tier-dot tier-strong" />トップペア以上</li>
        <li><i className="postflop-tier-dot tier-draw" />ドロー</li>
        <li><i className="postflop-suit-cell blocked" />ボードと重複</li>
      </ul>
    </div>
  </div>;
}

function matrixFor(node) {
  return new Map(node.rows.map(row => [row.hand, {
    hand: row.hand, comboCount: row.comboCount, unreachable: !row.reachable, actions: row.mix, tiers: row.tiers, combos: row.combos,
  }]));
}

export function FlopCardDialog({ cards, onApply, onClose }) {
  const current = recognizedFlop(cards);
  const dialogRef = useRef(null);
  useEffect(() => {
    dialogRef.current?.focus();
    const onKey = event => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="modal postflop-card-dialog" role="dialog" aria-modal="true" aria-labelledby="flop-card-title" tabIndex={-1} ref={dialogRef}>
      <div className="modal-heading"><h2 id="flop-card-title">フロップを選択</h2>
        <button type="button" className="modal-close" aria-label="閉じる" onClick={onClose}><X size={16} /></button>
      </div>
      <div className="postflop-board-options">
        {representativeFlops.map(board => {
          const boardCards = board.match(/../g);
          return <button type="button" key={board} className={board === current ? "selected" : ""} aria-pressed={board === current}
            aria-label={`フロップ ${boardCards.map(card => card[0] + suitLabels[card[1]]).join(" ")}`} onClick={() => onApply(boardCards)}>
            <BoardCards cards={boardCards} />
          </button>;
        })}
      </div>
      <p className="modal-description">AI推定があるのは、この代表12ボードだけです。</p>
    </div>
  </div>;
}

export function PostflopTrial({ context, cards, actions = [], displayMode = "standard" }) {
  const board = recognizedFlop(cards);
  const [selectedHand, setSelectedHand] = useState("AKo");
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const decision = flopDecision(actions, context);
  const labels = labelsFor(decision.node);
  const spotId = context.spotId;

  useEffect(() => {
    setData(null); setError("");
    if (!context.pilotAvailable || !spotId || !board) { setStatus("idle"); return; }
    const controller = new AbortController();
    setStatus("loading");
    fetch(`/local-postflop?${new URLSearchParams({ spot: spotId, board })}`, { signal: controller.signal })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "ポストフロップ候補を読み込めませんでした。");
        if (body.kind !== "ai_estimate_not_gto" || body.spot !== spotId || body.board !== board || !body.nodes || (context.tree && body.tree !== context.tree)) throw new Error("候補の局面・盤面または形式が一致しません。");
        return body;
      })
      .then(body => { setData(body); setStatus("ready"); })
      .catch(reason => { if (reason.name !== "AbortError") { setError(reason.message); setStatus("error"); } });
    return () => controller.abort();
  }, [board, context.pilotAvailable, spotId]);

  const current = decision.node && data?.board === board && data.spot === spotId && data.nodes[decision.node];
  const aggregates = useMemo(() => current ? matrixFor(current) : null, [current]);
  const totals = useMemo(() => current ? rangeTotals(current) : null, [current]);
  const matrixNode = useMemo(() => current ? { actingPosition: current.seat } : null, [current]);
  const chosen = aggregates?.get(selectedHand);
  const [selectedCombo, setSelectedCombo] = useState("all");
  useEffect(() => { setSelectedCombo("all"); }, [selectedHand, board, decision.node]);
  const combo = chosen?.combos?.find(item => item.cards === selectedCombo);
  const [explain, setExplain] = useState(null);
  const prevBet = actions.find(isFlopBet) ?? "bet33";
  useEffect(() => {
    setExplain(null);
    if (!combo || !board || !decision.node) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ spot: spotId, board, node: decision.node, cards: combo.cards, prev: prevBet });
    fetch(`/local-postflop-explain?${params}`, { signal: controller.signal })
      .then(response => response.ok ? response.json() : null)
      .then(body => { if (body?.spot === spotId && body.cards === combo.cards && body.node === decision.node) setExplain(body); })
      .catch(() => {});
    return () => controller.abort();
  }, [combo?.cards, board, decision.node, prevBet, spotId]);
  const view = selectedCombo === "all" ? chosen : combo ? { ...chosen, actions: combo.mix, tiers: { [combo.tier]: 1 }, combo } : null;
  const handEv = useHandEv(current && !chosen?.unreachable ? board : null, actions, selectedHand, spotId);
  return <div className="postflop-trial" aria-label="ポストフロップ試作">
    {!context.pilotAvailable ? <Panel className="postflop-unavailable"><StatusState title="この局面のポストフロップ方針は未収録">現在のAI試作があるのは、標準設定の2人のポットのうち、シングルレイズポット（オープン→1人がコール）、3betポット、4betポット、SBのリンプから始まるポットだけです。プリフロップの行動ブロックから戻れます。</StatusState></Panel>
      : !cards.every(Boolean) ? <Panel className="postflop-unavailable"><StatusState title="フロップを選択してください">上のアクション列にあるフロップカードを押して、3枚を選んでください。</StatusState></Panel>
      : !board ? <Panel className="postflop-unavailable"><StatusState title="このフロップの方針は未収録">選んだ3枚は代表12ボードに含まれません。未監査のレンジは表示しません。</StatusState></Panel>
      : <>
        {status === "loading" && <Panel><StatusState title="ローカル候補を読み込み中" /></Panel>}
        {status === "error" && <Panel><StatusState title="ローカル候補を表示できません" tone="error">{error}</StatusState></Panel>}
        {!decision.node && <Panel><StatusState title="フロップの判断終了">{decision.result} ターン・リバーの公開用方針はまだありません。</StatusState></Panel>}
        {current && aggregates && <div className="postflop-range-layout">
          <StrategyMatrix node={matrixNode} title={`${nodeTitle(decision.node, context)} · AI推定レンジ`} ariaLabel={`${current.seat}のフロップAI推定レンジ`}
            aggregates={aggregates} actions={current.actions} actionLabels={labels} simplified={displayMode === "simple"}
            selected={selectedHand} onSelect={setSelectedHand} unreachableReason="元のプリフロップ頻度0%またはボードで到達不能、推奨なし" />
          <div className="postflop-side">
          <details className="panel postflop-range-summary">
            <summary>
              <span className="postflop-range-summary-title">レンジ全体</span>
              <span className="postflop-range-summary-bar" style={{ background: mixGradient(Object.fromEntries(totals.items.map(item => [item.action, item.frequency])), current.actions) }}
                aria-label={totals.items.map(item => `${labels[item.action]} ${Math.round(item.frequency * 100)}%`).join("、")} />
            </summary>
            <p>到達可能な {totals.combos}コンボの加重平均です。</p>
            <ActionBars items={totals.items} labels={labels} />
          </details>
          <Panel className="postflop-hand-detail">
            {chosen?.unreachable ? <><SectionHeading title={selectedHand} /><StatusState title="到達不能">元のプリフロップレンジに含まれないか、このボードで組み合わせがありません。</StatusState></>
              : chosen && view && <>
                  <details className="postflop-view-detail">
                    <summary className="postflop-view-line">
                    <h3 className="postflop-view-title">{view.combo ? <>{view.combo.cards.match(/../g).map(card => <span key={card} className={`suit-${card[1]}`}>{card[0]}{suitLabels[card[1]]}</span>)}</> : <>{selectedHand}<small>平均</small></>}</h3>
                    <span className="postflop-view-bar" style={{ background: mixGradient(view.actions, current.actions) }}
                      aria-label={current.actions.map(action => `${labels[action]} ${Math.round(view.actions[action] * 100)}%`).join("、")} />
                    </summary>
                    <HandEvBars items={current.actions.map(action => ({ action, frequency: view.actions[action] }))} labels={labels} ev={handEv} comboSelected={Boolean(view.combo)} />
                  </details>
                <ComboPicker hand={selectedHand} combos={chosen.combos} actions={current.actions} selected={selectedCombo} onSelect={setSelectedCombo} labels={labels} />
                <HandReasons node={decision.node} hand={view} actions={current.actions} texture={data.texture} explain={view.combo ? explain : null} labels={labels} />
              </>}
          </Panel>
          </div>
        </div>}
      </>}
  </div>;
}

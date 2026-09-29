import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "@phosphor-icons/react";
import { ActionBars, barColor, Panel, SectionHeading, StatusState } from "../components/primitives.tsx";
import { StrategyMatrix } from "../components/StrategyMatrix.tsx";
import { HandEvBars, useHandEv } from "./PostflopHandEv.tsx";
import { actionReason, dominantTier, evidenceReason, textureLabels, tierLabels } from "./postflop-reasons.ts";
import { laterActionReason } from "./later-reasons.ts";
import { deck, flopDecision, laterDecision, laterStart, recognizedFlop, replayLater, representativeFlops } from "./postflop-trial.ts";
import { isFlopBet } from "../../scripts/postflop-ai/tree.mjs";
import { postflopUrl } from "./postflop-api.ts";
import { productLocale } from "../i18n.ts";

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
export function laterNodeTitle(node, { ip, oop }, street) {
  const role = node?.split("_")[1];
  const actor = role === "ip" ? ip : oop;
  const english = productLocale() === "en";
  const streetName = english ? (street === "turn" ? "Turn" : "River") : (street === "turn" ? "ターン" : "リバー");
  let action = english ? "first decision" : "最初の判断";
  if (node?.includes("_vs_raise")) action = english ? "facing a raise" : "レイズへの応答";
  else if (node?.includes("_vs_allin")) action = english ? "facing an all-in" : "オールインへの応答";
  else if (node?.includes("_vs_")) {
    const size = node.split("_vs_")[1];
    action = english ? `facing a ${size}% bet` : `${size}%ベットへの応答`;
  }
  return `${actor} · ${streetName} · ${action}`;
}
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

function LaterHandReasons({ street, node, hand, actions, texture, line, explain, loading, error, labels }) {
  if (!hand.tiers) return null;
  const tier = dominantTier(hand.tiers);
  const shownActions = actions.filter(action => hand.actions[action] >= 0.005)
    .sort((a, b) => hand.actions[b] - hand.actions[a]);
  const pct = value => `${Math.round(value * 100)}%`;
  const english = productLocale() === "en";
  const englishTier = { monster: "two pair or better", strong: "top pair or better", draw: "a draw", medium: "a weak pair", air: "air" };
  const englishTexture = { blank: "Blank runout", over: "Overcard runout", pair: "Paired-board runout", straight: "Straight-completing runout", flush: "Flush-threatening runout" };
  const japaneseTexture = { blank: "変化の少ないカード", over: "オーバーカード", pair: "ボードがペアになるカード", straight: "ストレートが近づくカード", flush: "フラッシュが近づく（完成する）カード" };
  return <div className="postflop-reasons">
    <p className="postflop-reason-tier">
      {english ? <>On this runout, this hand is <strong>{englishTier[tier]}</strong>.</>
        : <>このランアウトでは<strong>{tierLabels[tier]}</strong>です。</>}
      <span>{english ? englishTexture[texture] : japaneseTexture[texture]}</span>
    </p>
    <ul>
      {shownActions.map(action => {
        const reason = laterActionReason({ street, node, action, tier, texture, line, locale: english ? "en" : "ja" });
        const evidence = evidenceReason(action, explain?.actions?.[action], explain?.equity);
        return <li key={action}>
          <b style={{ "--reason-color": barColor(action) }}>{labels[action]} {pct(hand.actions[action])}</b>
          {reason && <span className="postflop-reason-general">{reason}</span>}
          {evidence && <span className="postflop-reason-evidence">{evidence}</span>}
          <ActionDetail action={action} explain={explain} />
        </li>;
      })}
    </ul>
    {loading && <small className="postflop-reason-general">{english ? "Loading explanation…" : "読み込み中…"}</small>}
    {error && <small className="postflop-reason-general">{english ? "Numeric explanation is unavailable." : "数値の説明を読み込めませんでした。"}</small>}
  </div>;
}

const suitOrder = ["s", "h", "d", "c"];
const handRanks = "23456789TJQKA";

// The later range endpoint exposes hand-class rows rather than combo rows. Choose a
// stable, legal combo from that class so the later-explain endpoint can provide evidence.
function representativeLaterCombo(hand, boardCards) {
  const available = deck.filter(card => !boardCards.includes(card));
  for (let first = 0; first < available.length; first++) for (let second = first + 1; second < available.length; second++) {
    const a = available[first], b = available[second];
    const [high, low] = handRanks.indexOf(a[0]) >= handRanks.indexOf(b[0]) ? [a, b] : [b, a];
    const comboClass = high[0] === low[0] ? high[0].repeat(2)
      : `${high[0]}${low[0]}${high[1] === low[1] ? "s" : "o"}`;
    if (comboClass === hand) return `${a}${b}`;
  }
  return null;
}

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

function laterMatrixFor(view) {
  return new Map(view.rows.map(row => [row.hand, {
    hand: row.hand, comboCount: row.reachable ? 1 : 0, unreachable: !row.reachable,
    actions: row.mix, tiers: { [row.tier]: 1 },
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

export function StreetCardDialog({ usedCards = [], street, currentCard = "", onApply, onClose }) {
  const dialogRef = useRef(null);
  const english = productLocale() === "en";
  const title = street === "turn" ? (english ? "Select turn" : "ターンを選択") : (english ? "Select river" : "リバーを選択");
  const unavailable = new Set(usedCards);
  useEffect(() => {
    dialogRef.current?.focus();
    const onKey = event => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="modal postflop-card-dialog street-card-dialog" role="dialog" aria-modal="true" aria-labelledby="street-card-title" tabIndex={-1} ref={dialogRef}>
      <div className="modal-heading"><h2 id="street-card-title">{title}</h2>
        <button type="button" className="modal-close" aria-label={english ? "Close" : "閉じる"} onClick={onClose}><X size={16} /></button>
      </div>
      <div className="street-card-options" role="group" aria-label={english ? "Available cards" : "選べるカード"}>
        {deck.map(card => {
          const isUsed = unavailable.has(card);
          const rank = card[0], suit = card[1];
          const label = `${rank}${suitLabels[suit]}`;
          return <button type="button" key={card} className={`street-card-option suit-${suit}${card === currentCard ? " selected" : ""}`}
            aria-pressed={card === currentCard} aria-label={label} disabled={isUsed}
            onClick={() => onApply(card)}>{label}</button>;
        })}
      </div>
      <p className="modal-description">{english ? "Board cards cannot be selected again." : "盤面と重なるカードは選べません。"}</p>
    </div>
  </div>;
}

export function PostflopTrial({ context, cards, actions = [], turnCard = "", turnActions = [], riverCard = "", riverActions = [], displayMode = "standard" }) {
  const board = recognizedFlop(cards);
  const [selectedHand, setSelectedHand] = useState("AKo");
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [laterData, setLaterData] = useState(null);
  const [laterStatus, setLaterStatus] = useState("idle");
  const [laterError, setLaterError] = useState("");
  const [laterExplainState, setLaterExplainState] = useState(null);
  const [laterHandEvState, setLaterHandEvState] = useState(null);
  const decision = flopDecision(actions, context);
  const labels = labelsFor(decision.node);
  const spotId = context.spotId;
  const flopPath = actions.join(",");
  const turnPath = turnActions.join(",");
  const riverPath = riverActions.join(",");
  const start = board && !decision.node ? laterStart(actions, context) : null;
  const turnReplay = start && turnCard ? replayLater("turn", turnActions, start, context) : null;
  let later = null, riverReplay = null;
  if (turnReplay?.state.node) later = laterDecision("turn", turnActions, start, context);
  else if (turnReplay?.state.end && !["fold", "raise-fold"].includes(turnReplay.state.end.type) &&
      turnReplay.stacks.ip > 0 && turnReplay.stacks.oop > 0 && riverCard) {
    const riverStart = { pot: turnReplay.pot, stacks: turnReplay.stacks, lastAggressor: turnReplay.lastAggressor };
    riverReplay = replayLater("river", riverActions, riverStart, context);
    if (riverReplay.state.node) later = laterDecision("river", riverActions, riverStart, context);
  }

  useEffect(() => {
    setData(null); setError("");
    if (!context.pilotAvailable || !spotId || !board || !decision.node) { setStatus("idle"); return; }
    const controller = new AbortController();
    setStatus("loading");
    fetch(postflopUrl("board", { spot: spotId, board }), { signal: controller.signal })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "ポストフロップ候補を読み込めませんでした。");
        if (body.kind !== "ai_estimate_not_gto" || body.spot !== spotId || body.board !== board || !body.nodes || (context.tree && body.tree !== context.tree)) throw new Error("候補の局面・盤面または形式が一致しません。");
        return body;
      })
      .then(body => { setData(body); setStatus("ready"); })
      .catch(reason => { if (reason.name !== "AbortError") { setError(reason.message); setStatus("error"); } });
    return () => controller.abort();
  }, [board, context.pilotAvailable, decision.node, spotId]);

  useEffect(() => {
    setLaterData(null); setLaterError("");
    if (!context.pilotAvailable || !spotId || !board || !later?.node || !turnCard) { setLaterStatus("idle"); return; }
    const controller = new AbortController();
    setLaterStatus("loading");
    const params = new URLSearchParams({ spot: spotId, flop: board, flopActions: flopPath, turn: turnCard,
      turnActions: turnPath, river: riverCard, riverActions: riverPath });
    fetch(postflopUrl("later", params), { signal: controller.signal })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "後続ストリートの候補を読み込めませんでした。");
        if (body.kind !== "ai_estimate_not_gto" || body.street !== later.street || body.node !== later.node ||
            body.actor !== later.actor || body.line !== later.line || !Array.isArray(body.rows) || body.rows.length !== 169) {
          throw new Error("候補の局面または形式が一致しません。");
        }
        return body;
      })
      .then(body => { setLaterData(body); setLaterStatus("ready"); })
      .catch(reason => { if (reason.name !== "AbortError") { setLaterError(reason.message); setLaterStatus("error"); } });
    return () => controller.abort();
  }, [board, context.pilotAvailable, flopPath, later?.actor, later?.line, later?.node, later?.street, riverCard, riverPath, spotId, turnCard, turnPath]);

  const current = decision.node && data?.board === board && data.spot === spotId && data.nodes[decision.node];
  const aggregates = useMemo(() => current ? matrixFor(current) : null, [current]);
  const totals = useMemo(() => current ? rangeTotals(current) : null, [current]);
  const matrixNode = useMemo(() => current ? { actingPosition: current.seat } : null, [current]);
  const chosen = aggregates?.get(selectedHand);
  const laterCurrent = later?.node && laterData?.street === later.street && laterData.node === later.node &&
    laterData.actor === later.actor && laterData.line === later.line ? laterData : null;
  const laterAggregates = useMemo(() => laterCurrent ? laterMatrixFor(laterCurrent) : null, [laterCurrent]);
  const laterChosen = laterAggregates?.get(selectedHand);
  const selectedLaterRow = laterCurrent?.rows.find(row => row.hand === selectedHand);
  const laterTier = selectedLaterRow?.tier;
  const laterLabels = productLocale() === "en"
    ? { check: "Check", bet33: "Bet 33%", bet75: "Bet 75%", bet125: "Bet 125%", allin: "All-in", fold: "Fold", call: "Call", raise: "Raise 3×" }
    : { check: "チェック", bet33: "ベット 33%", bet75: "ベット 75%", bet125: "ベット 125%", allin: "オールイン", fold: "フォールド", call: "コール", raise: "レイズ 3×" };
  const laterActions = laterCurrent ? Object.keys(selectedLaterRow?.mix ?? {}) : [];
  const laterHeading = later ? laterNodeTitle(later.node, context, later.street) : "";
  const laterBoardCards = board && turnCard
    ? [...(board.match(/../g) ?? []), turnCard, ...(laterCurrent?.street === "river" && riverCard ? [riverCard] : [])]
    : [];
  const laterRepresentativeCards = laterCurrent && laterChosen && !laterChosen.unreachable
    ? representativeLaterCombo(selectedHand, laterBoardCards)
    : null;
  const laterExplainUrl = laterCurrent && laterRepresentativeCards && spotId && board
    ? postflopUrl("later-explain", {
      spot: spotId, flop: board, flopActions: flopPath, turn: turnCard, turnActions: turnPath,
      river: laterCurrent.street === "river" ? riverCard : "",
      riverActions: laterCurrent.street === "river" ? riverPath : "", cards: laterRepresentativeCards,
    })
    : null;
  const laterHandEvUrl = laterCurrent && laterChosen && !laterChosen.unreachable && spotId && board
    ? postflopUrl("later-hand-ev", {
      spot: spotId, flop: board, flopActions: flopPath, turn: turnCard, turnActions: turnPath,
      ...(laterCurrent.street === "river" ? { river: riverCard } : {}),
      riverActions: laterCurrent.street === "river" ? riverPath : "", hand: selectedHand,
    })
    : null;
  const laterExplain = laterExplainUrl
    ? laterExplainState?.url === laterExplainUrl
      ? { ...laterExplainState, loading: false }
      : { data: null, error: null, loading: true }
    : { data: null, error: null, loading: false };
  const laterHandEv = laterHandEvUrl
    ? laterHandEvState?.url === laterHandEvUrl
      ? { ...laterHandEvState, loading: false }
      : { data: null, error: null, loading: true }
    : null;
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
    fetch(postflopUrl("explain", params), { signal: controller.signal })
      .then(response => response.ok ? response.json() : null)
      .then(body => { if (body?.spot === spotId && body.cards === combo.cards && body.node === decision.node) setExplain(body); })
      .catch(() => {});
    return () => controller.abort();
  }, [combo?.cards, board, decision.node, prevBet, spotId]);
  useEffect(() => {
    setLaterExplainState(null);
    if (!laterExplainUrl) return;
    const controller = new AbortController();
    setLaterExplainState({ url: laterExplainUrl, data: null, error: null, loading: true });
    fetch(laterExplainUrl, { signal: controller.signal })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || (productLocale() === "en" ? "Numeric explanation could not be loaded." : "数値の説明を読み込めませんでした。"));
        if (body.kind !== "ai_estimate_not_gto" || body.spot !== spotId || body.street !== laterCurrent?.street ||
            body.node !== laterCurrent?.node || body.line !== laterCurrent?.line || !body.actions || !Number.isFinite(body.equity)) {
          throw new Error(productLocale() === "en" ? "Explanation does not match this decision." : "説明の局面が選択中の判断と一致しません。");
        }
        return body;
      })
      .then(body => setLaterExplainState({ url: laterExplainUrl, data: body, error: null, loading: false }))
      .catch(reason => {
        if (reason.name !== "AbortError") setLaterExplainState({ url: laterExplainUrl, data: null, error: reason.message, loading: false });
      });
    return () => controller.abort();
  }, [laterExplainUrl, laterCurrent?.line, laterCurrent?.node, laterCurrent?.street, spotId]);
  useEffect(() => {
    setLaterHandEvState(null);
    if (!laterHandEvUrl) return;
    const controller = new AbortController();
    setLaterHandEvState({ url: laterHandEvUrl, data: null, error: null, loading: true });
    fetch(laterHandEvUrl, { signal: controller.signal })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || (productLocale() === "en" ? "Per-hand EV could not be loaded." : "手ごとのEVを読み込めませんでした。"));
        if (body.kind !== "ai_estimate_not_gto" || body.spot !== spotId || body.hand !== selectedHand ||
            body.street !== laterCurrent?.street || body.node !== laterCurrent?.node) {
          throw new Error(productLocale() === "en" ? "EV does not match this decision." : "EVの局面が選択中の判断と一致しません。");
        }
        return body;
      })
      .then(body => setLaterHandEvState({ url: laterHandEvUrl, data: body, error: null, loading: false }))
      .catch(reason => {
        if (reason.name !== "AbortError") setLaterHandEvState({ url: laterHandEvUrl, data: null, error: reason.message, loading: false });
      });
    return () => controller.abort();
  }, [laterHandEvUrl, laterCurrent?.node, laterCurrent?.street, selectedHand, spotId]);
  const view = selectedCombo === "all" ? chosen : combo ? { ...chosen, actions: combo.mix, tiers: { [combo.tier]: 1 }, combo } : null;
  const handEv = useHandEv(current && !chosen?.unreachable ? board : null, actions, selectedHand, spotId);
  const english = productLocale() === "en";
  const laterTexture = laterCurrent ? (english ? {
    blank: "a blank", over: "an overcard", pair: "a card that pairs the board", straight: "a straight-completing card", flush: "a flush card",
  }[laterCurrent.texture] : {
    blank: "変化の少ないカード", over: "オーバーカード", pair: "ボードがペアになるカード", straight: "ストレートが近づくカード", flush: "フラッシュが近づく（完成する）カード",
  }[laterCurrent.texture]) : "";
  const previousStreet = laterCurrent ? (english ? {
    aggressor: "You bet/raised and were called on the previous street.",
    defender: "You called the opponent's bet on the previous street.",
    checked: "The previous street checked through.",
  }[laterCurrent.line] : {
    aggressor: "前のストリートで自分がベット/レイズしてコールされた",
    defender: "前のストリートで相手のベットにコールした",
    checked: "前のストリートはチェックで回った",
  }[laterCurrent.line]) : "";
  return <div className="postflop-trial" aria-label="ポストフロップ試作">
    {!context.pilotAvailable ? <Panel className="postflop-unavailable"><StatusState title="この局面のポストフロップ方針は未収録">現在のAI試作があるのは、標準設定の2人のポットのうち、シングルレイズポット（オープン→1人がコール）、3betポット、4betポット、SBのリンプから始まるポットだけです。プリフロップの行動ブロックから戻れます。</StatusState></Panel>
      : !cards.every(Boolean) ? <Panel className="postflop-unavailable"><StatusState title="フロップを選択してください">上のアクション列にあるフロップカードを押して、3枚を選んでください。</StatusState></Panel>
      : !board ? <Panel className="postflop-unavailable"><StatusState title="このフロップの方針は未収録">選んだ3枚は代表12ボードに含まれません。未監査のレンジは表示しません。</StatusState></Panel>
      : <>
        {decision.node && status === "loading" && <Panel><StatusState title="ローカル候補を読み込み中" /></Panel>}
        {decision.node && status === "error" && <Panel><StatusState title="ローカル候補を表示できません" tone="error">{error}</StatusState></Panel>}
        {!decision.node && !start && <Panel><StatusState title={english ? "Flop action complete" : "フロップの判断終了"}>{decision.result}</StatusState></Panel>}
        {!decision.node && start && !turnCard && <Panel><StatusState title={english ? "Select a turn card" : "ターンを選択してください"}>{english ? "Choose a turn card in the action path above." : "上のアクション列にあるターンカードを押して、1枚選んでください。"}</StatusState></Panel>}
        {!decision.node && start && turnReplay && !later?.node && !riverCard && turnReplay.state.end && !["fold", "raise-fold"].includes(turnReplay.state.end.type) && turnReplay.stacks.ip > 0 && turnReplay.stacks.oop > 0 && <Panel><StatusState title={english ? "Select a river card" : "リバーを選択してください"}>{english ? "The turn action is complete. Choose one river card in the action path above." : "ターンの判断が終わりました。上のアクション列にあるリバーカードを押して、1枚選んでください。"}</StatusState></Panel>}
        {!decision.node && start && turnReplay && !later?.node && (turnReplay.end?.type === "fold" || turnReplay.end?.type === "raise-fold" || turnReplay.stacks.ip <= 0 || turnReplay.stacks.oop <= 0 || Boolean(riverReplay?.state.end)) && <Panel><StatusState title={english ? "Later-street action complete" : "後続ストリートの判断終了"}>{english ? "The action has ended; no later decision is available." : "フォールドまたはオールインでアクションが終了しました。後続の判断はありません。"}</StatusState></Panel>}
        {!decision.node && start && later?.node && laterStatus === "loading" && <Panel><StatusState title={english ? "Loading local later-street estimate" : "後続ストリートの候補を読み込み中"} /></Panel>}
        {!decision.node && start && later?.node && laterStatus === "error" && <Panel><StatusState title={english ? "Cannot show the local later-street estimate" : "後続ストリートの候補を表示できません"} tone="error">{laterError}</StatusState></Panel>}
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
        {laterCurrent && laterAggregates && <div className="postflop-range-layout postflop-later-range-layout">
          <StrategyMatrix node={{ actingPosition: laterCurrent.actor }} title={`${laterHeading} · ${english ? "AI-estimated range" : "AI推定レンジ"}`}
            ariaLabel={`${laterCurrent.actor} ${laterCurrent.street} ${english ? "AI-estimated range" : "AI推定レンジ"}`}
            aggregates={laterAggregates} actions={laterActions} actionLabels={laterLabels} simplified={displayMode === "simple"}
            selected={selectedHand} onSelect={setSelectedHand}
            unreachableReason={english ? "No combo reaches this node; no recommendation" : "この判断に到達するコンボがありません。推奨なし"} />
          <Panel className="postflop-hand-detail postflop-later-hand-detail">
            {laterChosen?.unreachable ? <><SectionHeading title={selectedHand} /><StatusState title={english ? "Unreachable" : "到達不能"}>{english ? "No combo of this hand reaches this decision." : "このハンドはこの判断に到達しません。"}</StatusState></>
              : laterChosen && <>
                <SectionHeading title={`${selectedHand} · ${english ? "Hand details" : "ハンド詳細"}`} />
                <dl className="postflop-later-facts">
                  <div><dt>{english ? "Hand strength" : "手の強さ"}</dt><dd>{english ? ({ monster: "two pair or better", strong: "top pair or better", draw: "a draw", medium: "a weak pair", air: "air" }[laterTier]) : tierLabels[laterTier]}</dd></div>
                  <div><dt>{english ? "Card dealt" : "落ちたカード"}</dt><dd><BoardCards cards={[laterCurrent.street === "turn" ? turnCard : riverCard]} /> <span>{laterTexture}</span></dd></div>
                  <div><dt>{english ? "Previous street" : "前のストリート"}</dt><dd>{previousStreet}</dd></div>
                </dl>
                {laterHandEv?.data?.row
                  ? <HandEvBars items={laterActions.map(action => ({ action, frequency: laterChosen.actions[action] ?? 0 }))}
                    labels={laterLabels} ev={laterHandEv} showEstimateBadge={false} />
                  : <>
                    <ActionBars items={laterActions.map(action => ({ action, frequency: laterChosen.actions[action] ?? 0 }))} labels={laterLabels} />
                    {laterHandEv?.loading && <small className="hand-ev-status">{english ? "Loading per-hand EV…" : "手ごとのEVを読み込み中…"}</small>}
                    {laterHandEv?.error && <small className="hand-ev-status">{laterHandEv.error}</small>}
                  </>}
                <LaterHandReasons street={laterCurrent.street} node={laterCurrent.node} hand={laterChosen} actions={laterActions}
                  texture={laterCurrent.texture} line={laterCurrent.line} explain={laterExplain.data}
                  loading={laterExplain.loading} error={laterExplain.error} labels={laterLabels} />
              </>}
          </Panel>
        </div>}
      </>}
  </div>;
}

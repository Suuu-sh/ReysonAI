import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "@phosphor-icons/react";
import { ActionBars, barColor, Panel, SectionHeading, StatusState } from "../components/primitives.tsx";
import { StrategyMatrix } from "../components/StrategyMatrix.tsx";
import { tierLabels } from "./postflop-reasons.ts";
import { buildAdvancedExplanation } from "./postflop-advanced.ts";
import { glossaryPieces } from "./poker-glossary.ts";
import { deck, flopDecision, laterDecision, laterStart, recognizedFlop, replayLater } from "./postflop-trial.ts";
import { isFlopBet } from "../../scripts/postflop-ai/tree.mjs";
import { computeBoard, computeExplain, computeLaterExplain, computeLaterRangeFacts, computeLaterView, computeRangeFacts } from "./postflop-compute.ts";
import { deferPostflopCalculation, isAbortError, loadPostflopDatasets, loadPostflopSpot, loadPostflopFlop } from "./postflop-browser.ts";
import { continuationCopy, postflopAvailabilityError } from "./continuation-copy.ts";
import { productLocale } from "../i18n.ts";

// Action labels with real amounts come from the replay (decisionOptions in postflop-trial.ts); these
// plain labels are only the fallback (amount-free) for actions a decision does not carry.
const baseLabels = () => productLocale() !== "ja"
  ? { check: "Check", bet33: "Bet 33%", bet75: "Bet 75%", bet125: "Bet 125%", allin: "All-in", fold: "Fold", call: "Call", raise: "Raise" }
  : { check: "チェック", bet33: "ベット 33%", bet75: "ベット 75%", bet125: "ベット 125%", allin: "オールイン", fold: "フォールド", call: "コール", raise: "レイズ" };
export const labelsFor = (node, decisionLabels = null) => ({ ...baseLabels(), ...(decisionLabels ?? {}) });
const raiseAllInOf = d => Boolean(d?.options?.find(option => option.action === "raise")?.allIn);
const decisionLabelsOf = d => d ? (productLocale() !== "ja" ? d.labels : d.labelsJa) : null;
// btn_* nodes are the in-position player's decisions, bb_* the out-of-position player's.
export const nodeTitle = (node, { ip, oop }) => (productLocale() !== "ja" ? {
  btn_first: `${ip} · facing ${oop}'s check`, bb_vs_33: `${oop} · facing a 33% bet`,
  bb_vs_75: `${oop} · facing a 75% bet`, bb_vs_125: `${oop} · facing a 125% bet`, btn_vs_raise: `${ip} · facing a check-raise`,
  oop_first: `${oop} · first decision`, ip_vs_33: `${ip} · facing a 33% bet`,
  ip_vs_75: `${ip} · facing a 75% bet`, ip_vs_125: `${ip} · facing a 125% bet`, oop_vs_raise: `${oop} · facing a raise`,
} : {
  btn_first: `${ip} · ${oop}のチェックへの応答`, bb_vs_33: `${oop} · 33%ベットへの応答`,
  bb_vs_75: `${oop} · 75%ベットへの応答`, bb_vs_125: `${oop} · 125%ベットへの応答`, btn_vs_raise: `${ip} · チェックレイズへの応答`,
  oop_first: `${oop} · 最初の判断（先にベットできる）`, ip_vs_33: `${ip} · 33%ベットへの応答`,
  ip_vs_75: `${ip} · 75%ベットへの応答`, ip_vs_125: `${ip} · 125%ベットへの応答`, oop_vs_raise: `${oop} · レイズへの応答`,
})[node] ?? raiseTitle(node, { ip, oop });
function raiseTitle(node, { ip, oop }) {
  const match = /^(btn|bb|ip|oop)_vs_raise(\d+)$/.exec(node ?? "");
  if (!match) return undefined;
  const actor = match[1] === "btn" || match[1] === "ip" ? ip : oop;
  return `${actor} · ${productLocale() !== "ja" ? "facing a re-raise" : "再レイズへの応答"}`;
}
export function laterNodeTitle(node, { ip, oop }, street) {
  const role = node?.split("_")[1];
  const actor = role === "ip" ? ip : oop;
  const english = productLocale() !== "ja";
  const streetName = english ? (street === "turn" ? "Turn" : "River") : (street === "turn" ? "ターン" : "リバー");
  let action = english ? "first decision" : "最初の判断";
  const depth = /_vs_raise(\d*)$/.exec(node ?? "");
  if (depth) action = Number(depth[1] || 1) >= 2 ? (english ? "facing a re-raise" : "再レイズへの応答") : (english ? "facing a raise" : "レイズへの応答");
  else if (node?.includes("_vs_allin")) action = english ? "facing an all-in" : "オールインへの応答";
  else if (node?.includes("_vs_")) {
    const size = node.split("_vs_")[1];
    action = english ? `facing a ${size}% bet` : `${size}%ベットへの応答`;
  }
  return `${actor} · ${streetName} · ${action}`;
}
export const suitLabels = { s: "♠", h: "♥", d: "♦", c: "♣" };

function rangeTotals(node, weightKey = "comboCount") {
  const totals = Object.fromEntries(node.actions.map(action => [action, 0]));
  let combos = 0, totalWeight = 0;
  for (const row of node.rows) {
    if (!row.reachable || !row.comboCount) continue;
    combos += row.comboCount;
    const weight = row[weightKey] ?? row.comboCount;
    totalWeight += weight;
    for (const action of node.actions) totals[action] += (row.mix[action] ?? 0) * weight;
  }
  return { combos, items: node.actions.map(action => ({ action, frequency: totalWeight ? totals[action] / totalWeight : 0 })) };
}

function BoardCards({ cards }) {
  return <span className="postflop-board-cards">{cards.map((card, index) => card
    ? <span key={index} className={`postflop-card suit-${card[1]}`}>{card[0]}{suitLabels[card[1]]}</span>
    : <span key={index} className="postflop-card empty">?</span>)}</span>;
}

function SuitCardPicker({ selectedCards = new Set(), disabledCards = new Set(), onSelect, ariaLabel }) {
  const english = productLocale() !== "ja";
  return <div className="street-card-options" role="group" aria-label={ariaLabel}>
    {suitOrder.map(suit => <div className={`street-suit-row suit-${suit}`} key={suit} role="group" aria-label={suitNames[english ? "en" : "ja"][suit]}>
      <span className="street-suit-label" aria-hidden="true">{suitLabels[suit]}</span>
      {deck.filter(card => card[1] === suit).map(card => {
        const isSelected = selectedCards.has(card);
        const label = `${card[0]}${suitLabels[card[1]]}`;
        return <button type="button" key={card} className={`street-card-option suit-${suit}${isSelected ? " selected" : ""}`}
          aria-pressed={isSelected} aria-label={label} disabled={disabledCards.has(card)}
          onClick={() => onSelect(card)}>{card[0]}</button>;
      })}
    </div>)}
  </div>;
}

const tablePct = (value: number | null) => value === null ? "—" : `${Math.round(value * 100)}%`;

// Per-action comparison at a betting decision; scrolls sideways inside its own wrapper on narrow screens.

function HandReasons({ node, hand, texture, explain, loading, error, positions, boardCards, labels, raiseAllIn }: any) {
  if (!hand?.tiers) return null;
  const english = productLocale() !== "ja";
  const plain = buildAdvancedExplanation({ locale: productLocale(), node, hand: hand.hand, actionMix: hand.actions,
    tiers: hand.tiers, texture, explain, positions, board: boardCards, labels, raiseAllIn,
    ...(hand.combo ? { cards: hand.combo.cards } : { combos: (hand.combos ?? []).map((item: any) => ({ cards: item.cards, weight: item.weight ?? item.reachWeight ?? 0 })) }) });
  return <div className="postflop-reasons postflop-reasons-structured">
    <GlossaryText className="postflop-reason-headline" text={plain.headline} locale={productLocale()} />
    {plain.blocks.map(block => <details className="postflop-reason-section postflop-reason-action" key={block.action} style={{ "--action-color": barColor(block.action) } as any}>
      <summary>
        <span className="postflop-reason-action-name"><i style={{ background: barColor(block.action) }} aria-hidden="true" />{block.label}</span>
        <span className="postflop-reason-frequency" aria-label={`${Math.round(block.frequency * 100)}%`}>
          <span className="postflop-reason-frequency-bar"><span style={{ width: `${Math.round(block.frequency * 100)}%`, background: barColor(block.action) }} /></span>
          <strong>{Math.round(block.frequency * 100)}%</strong>
        </span>
      </summary>
      <GlossaryText text={block.text} locale={productLocale()} />
    </details>)}
    {plain.texture && <GlossaryText className="postflop-reason-texture" text={plain.texture} locale={productLocale()} />}
    {loading && <small className="postflop-reason-general">{english ? "Loading explanation…" : "説明を計算中…"}</small>}
    {error && <small className="postflop-reason-general">{english ? "Part of the explanation is unavailable." : "説明の一部を読み込めませんでした。"}</small>}
  </div>;
}

const suitOrder = ["s", "h", "d", "c"];
const suitNames = {
  en: { s: "Spades", h: "Hearts", d: "Diamonds", c: "Clubs" },
  ja: { s: "スペード", h: "ハート", d: "ダイヤ", c: "クラブ" },
};
function mixGradient(mix, actions) {
  let at = 0;
  const stops = actions.filter(action => mix[action] > 0).map(action => {
    const from = at; at += mix[action] * 100;
    return `${barColor(action)} ${from}% ${at}%`;
  });
  return stops.length ? `linear-gradient(90deg, ${stops.join(", ")})` : undefined;
}

function ComboPicker({ hand, combos, actions, selected, onSelect, labels, missingReason, missingTitle }) {
  if (!combos?.length) return null;
  const english = productLocale() !== "ja";
  const missing = missingReason ?? (english ? "Overlaps the board" : "ボードと重複");
  const missingDescription = missingTitle ?? (english ? "Unavailable because the cards overlap the board" : "ボードのカードと重なるため存在しません");
  const tierName = tier => english
    ? ({ monster: "Two pair or better", strong: "Top pair or better", draw: "Draw", medium: "Weak pair", air: "Unpaired high cards" })[tier]
    : tierLabels[tier];
  const pair = hand[0] === hand[1];
  const byCell = new Map(combos.map(combo => {
    let [first, second] = [combo.cards[1], combo.cards[3]];
    if (pair && suitOrder.indexOf(first) > suitOrder.indexOf(second)) [first, second] = [second, first];
    return [`${first}${second}`, combo];
  }));
  const possible = (row, col) => pair ? suitOrder.indexOf(row) < suitOrder.indexOf(col) : hand.endsWith("s") ? row === col : row !== col;
  const pct = value => `${Math.round(value * 100)}%`;
  return <div className="postflop-suit-picker">
    <div className="postflop-suit-grid" role="group" aria-label={english ? "Suit combinations" : "スートの組み合わせ"}>
      <span />
      {suitOrder.map(suit => <span key={suit} className={`postflop-suit-head suit-${suit}`}>{hand[1]}{suitLabels[suit]}</span>)}
      {suitOrder.map(row => <div key={row} className="postflop-suit-row">
        <span className={`postflop-suit-head suit-${row}`}>{hand[0]}{suitLabels[row]}</span>
        {suitOrder.map(col => {
          const combo = byCell.get(`${row}${col}`);
          if (!possible(row, col)) return <span key={col} className="postflop-suit-cell void" aria-hidden="true" />;
          if (!combo) return <span key={col} className="postflop-suit-cell blocked" title={missingDescription}>×</span>;
          const top = actions.reduce((best, action) => combo.mix[action] > combo.mix[best] ? action : best);
          return <button type="button" key={col} className={`postflop-suit-cell${selected === combo.cards ? " selected" : ""}`}
            style={{ background: mixGradient(combo.mix, actions) }} aria-pressed={selected === combo.cards}
            aria-label={english ? `${hand[0]}${suitLabels[row]} ${hand[1]}${suitLabels[col]}: ${tierName(combo.tier)}, ${labels[top]} ${pct(combo.mix[top])}`
              : `${hand[0]}${suitLabels[row]} ${hand[1]}${suitLabels[col]}：${tierName(combo.tier)}、${labels[top]} ${pct(combo.mix[top])}`}
            title={`${tierName(combo.tier)} · ${actions.map(action => `${labels[action]} ${pct(combo.mix[action])}`).join(" / ")}`}
            onClick={() => onSelect(selected === combo.cards ? "all" : combo.cards)}>
            {combo.tier !== "air" && combo.tier !== "medium" && <i className={`postflop-tier-dot tier-${combo.tier}`} />}
          </button>;
        })}
      </div>)}
    </div>
    <div className="postflop-suit-side">
      <button type="button" className={`postflop-suit-all${selected === "all" ? " selected" : ""}`} aria-pressed={selected === "all"} onClick={() => onSelect("all")}>{english ? "All combos (average)" : "すべて（平均）"}</button>
      <ul className="postflop-tier-legend">
        <li><i className="postflop-tier-dot tier-monster" />{english ? "Two pair or better" : "強い役"}</li>
        <li><i className="postflop-tier-dot tier-strong" />{english ? "Top pair or better" : "トップペア以上"}</li>
        <li><i className="postflop-tier-dot tier-draw" />{english ? "Draw" : "ドロー"}</li>
        <li><i className="postflop-suit-cell blocked" />{missing}</li>
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
    hand: row.hand, comboCount: row.comboCount, unreachable: !row.reachable,
    actions: row.mix, tiers: row.tiers, combos: row.combos,
  }]));
}

export function randomFlop(random = Math.random) {
  const shuffled = [...deck];
  for (let index = 0; index < 3; index++) {
    const selected = index + Math.floor(random() * (shuffled.length - index));
    [shuffled[index], shuffled[selected]] = [shuffled[selected], shuffled[index]];
  }
  return shuffled.slice(0, 3);
}

export function FlopCardDialog({ cards, onApply, onClose }) {
  const current = recognizedFlop(cards);
  const english = productLocale() !== "ja";
  const [draft, setDraft] = useState(() => [...cards]);
  const dialogRef = useRef(null);
  useEffect(() => {
    dialogRef.current?.focus();
    const onKey = event => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const selected = new Set(draft.filter(Boolean));
  const count = selected.size;
  const chooseCard = card => {
    const next = [...draft];
    const existing = next.indexOf(card);
    if (existing >= 0) next[existing] = "";
    else {
      const empty = next.indexOf("");
      if (empty < 0) return;
      next[empty] = card;
    }
    setDraft(next);
  };
  const apply = chosen => onApply(chosen);
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="modal postflop-card-dialog" role="dialog" aria-modal="true" aria-labelledby="flop-card-title" tabIndex={-1} ref={dialogRef}>
      <div className="modal-heading"><h2 id="flop-card-title">{english ? "Select flop" : "フロップを選択"}</h2>
        <div className="flop-dialog-heading-actions">
          <button type="button" className="flop-random-button" onClick={() => apply(randomFlop())}>
            {english ? "Random flop" : "ランダムなフロップ"}
          </button>
          <button type="button" className="modal-close" aria-label={english ? "Close" : "閉じる"} onClick={onClose}><X size={16} /></button>
        </div>
      </div>
      <div className="street-card-board flop-card-board">
        <span>{english ? "Selected" : "選択中"}</span>
        <div className="flop-card-slots" role="group" aria-label={english ? "Selected flop cards; click a card to remove it" : "選択中のフロップカード。カードを押すと外せます"}>
          {[0, 1, 2].map(index => {
            const card = draft[index] ?? "";
            return <button type="button" key={index} className={`postflop-card${card ? ` suit-${card[1]}` : " empty"}`}
              aria-label={card ? (english ? `Remove ${card[0]}${suitLabels[card[1]]} from flop` : `フロップから ${card[0]}${suitLabels[card[1]]} を外す`)
                : (english ? `Empty flop card ${index + 1}` : `フロップの空き枠 ${index + 1}`)}
              disabled={!card} onClick={() => chooseCard(card)}>
              {card ? <>{card[0]}{suitLabels[card[1]]}<small>×</small></> : "?"}
            </button>;
          })}
        </div>
        <span className="flop-card-count" aria-live="polite">{english ? `${count} / 3` : `${count} / 3 枚`}</span>
        <button type="button" className="flop-apply-button" disabled={count !== 3} onClick={() => apply(draft.filter(Boolean))}>
          {english ? "Use flop" : "このフロップを使う"}
        </button>
      </div>
      <p className="modal-description">{english ? "Choose any three distinct cards. The flop AI estimate is computed for every board." : "好きなカードを3枚選べます。すべてのフロップでAI推定レンジを計算します。"}</p>
      <div className="flop-card-options">
        <SuitCardPicker selectedCards={selected} disabledCards={count === 3
          ? new Set(deck.filter(card => !selected.has(card))) : undefined}
          ariaLabel={english ? "Available flop cards by suit" : "スート別のフロップカード一覧"} onSelect={chooseCard} />
      </div>
    </div>
  </div>;
}

export function StreetCardDialog({ usedCards = [], street, currentCard = "", onApply, onClose }) {
  const dialogRef = useRef(null);
  const english = productLocale() !== "ja";
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
      <div className="street-card-board">
        <span>{english ? "Board" : "ボード"}</span>
        <BoardCards cards={usedCards} />
      </div>
      <p className="modal-description">{english ? "Choose one card. Cards on the board are unavailable." : "1枚選んでください。盤面のカードは選べません。"}</p>
      <SuitCardPicker selectedCards={currentCard ? new Set([currentCard]) : undefined} disabledCards={unavailable}
        ariaLabel={english ? "Available cards by suit" : "スート別のカード一覧"} onSelect={onApply} />
    </div>
  </div>;
}

export function PostflopTrial({ context, cards, actions = [], turnCard = "", turnActions = [], riverCard = "", riverActions = [], displayMode = "standard" }) {
  const board = recognizedFlop(cards);
  const [selectedHand, setSelectedHand] = useState("AKo");
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [spotState, setSpotState] = useState({ spotId: null, data: null, error: null, loading: false });
  const [datasetState, setDatasetState] = useState({ spotId: null, datasets: null, error: null, loading: false });
  const [laterData, setLaterData] = useState(null);
  const [laterStatus, setLaterStatus] = useState("idle");
  const [laterError, setLaterError] = useState("");
  const [laterExplainState, setLaterExplainState] = useState(null);
  const [explainState, setExplainState] = useState(null);
  const [flopBaseState, setFlopBaseState] = useState(null);
  const decision = flopDecision(actions, context);
  const labels = labelsFor(decision.node, decisionLabelsOf(decision));
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
    setSpotState({ spotId: null, data: null, error: null, loading: false });
    if (!context.pilotAvailable || !spotId) return undefined;
    const controller = new AbortController();
    setSpotState({ spotId, data: null, error: null, loading: true });
    loadPostflopSpot(spotId, controller.signal)
      .then(result => {
        if (controller.signal.aborted) return;
        if (context.tree && result.spot.tree !== context.tree) throw new Error("候補の局面が選択中のポットと一致しません。");
        setSpotState({ spotId, data: result, error: null, loading: false });
      })
      .catch(reason => {
        if (!controller.signal.aborted && !isAbortError(reason)) setSpotState({ spotId, data: null, error: reason.message, loading: false });
      });
    return () => controller.abort();
  }, [context.pilotAvailable, context.tree, spotId]);

  useEffect(() => {
    setDatasetState({ spotId: null, datasets: null, error: null, loading: false });
    if (!context.pilotAvailable || spotState.spotId !== spotId || !spotState.data) return undefined;
    const controller = new AbortController();
    setDatasetState({ spotId, datasets: null, error: null, loading: true });
    loadPostflopDatasets(spotState.data.spot, controller.signal)
      .then(datasets => {
        if (!controller.signal.aborted) setDatasetState({ spotId, datasets, error: null, loading: false });
      })
      .catch(reason => {
        if (!controller.signal.aborted && !isAbortError(reason)) setDatasetState({ spotId, datasets: null, error: reason.message, loading: false });
      });
    return () => controller.abort();
  }, [context.pilotAvailable, spotId, spotState.data, spotState.spotId]);

  const postflopSource = spotState.spotId === spotId ? spotState.data : null;
  const postflopDatasets = datasetState.spotId === spotId ? datasetState.datasets : null;
  const flopBase = flopBaseState && flopBaseState.spot === spotId && flopBaseState.board === board ? flopBaseState.base : null;
  const sourceError = spotState.spotId === spotId && spotState.error ? spotState.error
    : datasetState.spotId === spotId ? datasetState.error : null;
  useEffect(() => {
    setData(null); setError("");
    if (!context.pilotAvailable || !spotId || !board || !decision.node) { setStatus("idle"); return undefined; }
    if (sourceError) { setError(sourceError); setStatus("error"); return undefined; }
    if (!postflopSource || !postflopDatasets) { setStatus("loading"); return undefined; }
    const controller = new AbortController();
    setStatus("loading");
    loadPostflopFlop(spotId, board, controller.signal).then(base => {
      if (controller.signal.aborted) return null;
      setFlopBaseState({ spot: spotId, board, base });
      return deferPostflopCalculation(() => computeBoard({ spotId, board, history: actions, datasets: postflopDatasets,
        flopCandidate: postflopSource.candidate, laterCandidate: postflopSource.laterCandidate, flopBase: base }), controller.signal);
    })
      .then(body => {
        if (controller.signal.aborted) return;
        if (body.kind !== "ai_estimate_not_gto" || body.spot !== spotId || body.board !== board || !body.nodes ||
            (context.tree && body.tree !== context.tree)) throw new Error("候補の局面・盤面または形式が一致しません。");
        setData(body); setStatus("ready");
      })
      .catch(reason => { if (!isAbortError(reason)) { setError(postflopAvailabilityError(reason)); setStatus("error"); } });
    return () => controller.abort();
  }, [board, context.pilotAvailable, context.tree, decision.node, flopPath, postflopDatasets, postflopSource, sourceError, spotId]);

  useEffect(() => {
    setLaterData(null); setLaterError("");
    if (!context.pilotAvailable || !spotId || !board || !later?.node || !turnCard) { setLaterStatus("idle"); return undefined; }
    if (sourceError) { setLaterError(sourceError); setLaterStatus("error"); return undefined; }
    if (!postflopSource || !postflopDatasets) { setLaterStatus("loading"); return undefined; }
    const controller = new AbortController();
    setLaterStatus("loading");
    deferPostflopCalculation(() => computeLaterView({ spotId, flop: board, flopActions: flopPath, turn: turnCard,
      turnActions: turnPath, river: riverCard, riverActions: riverPath, datasets: postflopDatasets,
      flopCandidate: postflopSource.candidate, laterCandidate: postflopSource.laterCandidate }), controller.signal)
      .then(body => {
        if (body.kind !== "ai_estimate_not_gto" || body.street !== later.street || body.node !== later.node ||
            body.actor !== later.actor || body.line !== later.line || !Array.isArray(body.rows) || body.rows.length !== 169) {
          throw new Error("候補の局面または形式が一致しません。");
        }
        setLaterData(body); setLaterStatus("ready");
      })
      .catch(reason => { if (!isAbortError(reason)) { setLaterError(postflopAvailabilityError(reason)); setLaterStatus("error"); } });
    return () => controller.abort();
  }, [board, context.pilotAvailable, flopPath, later?.actor, later?.line, later?.node, later?.street,
    postflopDatasets, postflopSource, riverCard, riverPath, sourceError, spotId, turnCard, turnPath]);

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
  const laterTotals = useMemo(() => laterCurrent ? rangeTotals({ rows: laterCurrent.rows, actions: Object.keys(laterCurrent.rows[0]?.mix ?? {}) }, "reachWeight") : null, [laterCurrent]);
  const laterLabels = labelsFor(later?.node, decisionLabelsOf(later));
  const laterActions = laterCurrent ? Object.keys(selectedLaterRow?.mix ?? {}) : [];
  const laterHeading = later ? laterNodeTitle(later.node, context, later.street) : "";
  const [selectedLaterCombo, setSelectedLaterCombo] = useState("all");
  useEffect(() => { setSelectedLaterCombo("all"); }, [selectedHand, board, turnCard, riverCard, laterCurrent?.street, laterCurrent?.node]);
  const laterCombo = laterChosen?.combos?.find(item => item.cards === selectedLaterCombo);
  const laterView = selectedLaterCombo === "all" ? laterChosen : laterCombo
    ? { ...laterChosen, actions: laterCombo.mix, tiers: { [laterCombo.tier]: 1 }, combo: laterCombo } : null;
  const laterExplainCombos = selectedLaterCombo === "all"
    ? laterChosen?.combos?.filter(item => item.weight > 0).map(({ cards, weight }) => ({ cards, weight }))
    : laterCombo ? [{ cards: laterCombo.cards, weight: laterCombo.weight }] : null;
  const laterExplainInput = laterCurrent && laterChosen && !laterChosen.unreachable && laterExplainCombos?.length && spotId && board
    ? { spotId, flop: board, flopActions: flopPath, turn: turnCard, turnActions: turnPath,
      river: laterCurrent.street === "river" ? riverCard : "",
      riverActions: laterCurrent.street === "river" ? riverPath : "",
      ...(selectedLaterCombo === "all" ? { combos: laterExplainCombos } : laterCombo ? { cards: laterCombo.cards } : {}) }
    : null;
  const laterExplainKey = laterExplainInput ? JSON.stringify(laterExplainInput) : null;
  const laterExplain = laterExplainKey
    ? laterExplainState?.key === laterExplainKey
      ? { ...laterExplainState, loading: false }
      : { data: null, error: null, loading: true }
    : { data: null, error: null, loading: false };
  const [selectedCombo, setSelectedCombo] = useState("all");
  useEffect(() => { setSelectedCombo("all"); }, [selectedHand, board, decision.node]);
  const combo = chosen?.combos?.find(item => item.cards === selectedCombo);
  const prevBet = actions.find(isFlopBet) ?? "bet33";
  const explainCombos = selectedCombo === "all"
    ? chosen?.combos?.filter(item => item.weight > 0).map(({ cards, weight }) => ({ cards, weight }))
    : combo ? [{ cards: combo.cards, weight: combo.weight }] : null;
  const explainInput = chosen && !chosen.unreachable && explainCombos?.length && board && decision.node
    ? { spotId, board, node: decision.node, prev: prevBet,
      ...(selectedCombo === "all" ? { combos: explainCombos } : { cards: combo.cards }) } : null;
  const explainKey = explainInput ? JSON.stringify(explainInput) : null;
  const explain = explainKey && explainState?.key === explainKey ? explainState.data : null;
  const explainLoading = Boolean(explainKey && !sourceError && postflopSource && postflopDatasets &&
    (explainState?.key !== explainKey || explainState.loading));
  const explainError = explainKey && explainState?.key === explainKey ? explainState.error : null;
  useEffect(() => {
    setExplainState(null);
    if (!explainInput || !explainKey || sourceError || !postflopSource || !postflopDatasets) return undefined;
    const controller = new AbortController();
    setExplainState({ key: explainKey, data: null, error: null, loading: true });
    deferPostflopCalculation(() => {
      const explanation = computeExplain({ ...explainInput,
        history: actions, datasets: postflopDatasets, flopCandidate: postflopSource.candidate,
        laterCandidate: postflopSource.laterCandidate, flopBase });
      const range_facts = computeRangeFacts({ ...explainInput, history: actions, datasets: postflopDatasets,
        flopCandidate: postflopSource.candidate });
      return range_facts ? { ...explanation, range_facts } : explanation;
    }, controller.signal)
      .then(body => {
        const matchesSelection = selectedCombo === "all"
          ? body?.aggregate?.kind === "hand_class_average" && body.cards === null
          : body?.cards === combo?.cards;
        if (body?.spot !== spotId || body?.board !== board || body.node !== decision.node || !matchesSelection) throw new Error("説明の局面が一致しません。");
        setExplainState({ key: explainKey, data: body, error: null, loading: false });
      })
      .catch(reason => {
        if (!isAbortError(reason)) setExplainState({ key: explainKey, data: null, error: reason.message, loading: false });
      });
    return () => controller.abort();
  }, [combo?.cards, board, decision.node, explainKey, flopBase, flopPath, postflopDatasets, postflopSource, sourceError, spotId]);
  useEffect(() => {
    setLaterExplainState(null);
    if (!laterExplainKey || sourceError || !postflopSource || !postflopDatasets) return undefined;
    const controller = new AbortController();
    setLaterExplainState({ key: laterExplainKey, data: null, error: null, loading: true });
    deferPostflopCalculation(() => {
      const options = { ...laterExplainInput, datasets: postflopDatasets,
        flopCandidate: postflopSource.candidate, laterCandidate: postflopSource.laterCandidate };
      const explanation = computeLaterExplain(options);
      const range_facts = computeLaterRangeFacts(options);
      return range_facts ? { ...explanation, range_facts } : explanation;
    }, controller.signal)
      .then(body => {
        if (body.kind !== "ai_estimate_not_gto" || body.spot !== spotId || body.street !== laterCurrent?.street ||
            body.node !== laterCurrent?.node || body.line !== laterCurrent?.line || !body.actions || !Number.isFinite(body.equity)) {
          throw new Error(productLocale() !== "ja" ? "Explanation does not match this decision." : "説明の局面が選択中の判断と一致しません。");
        }
        return body;
      })
      .then(body => setLaterExplainState({ key: laterExplainKey, data: body, error: null, loading: false }))
      .catch(reason => {
        if (!isAbortError(reason)) setLaterExplainState({ key: laterExplainKey, data: null, error: reason.message, loading: false });
      });
    return () => controller.abort();
  }, [laterCurrent?.line, laterCurrent?.node, laterCurrent?.street, laterExplainKey,
    postflopDatasets, postflopSource, sourceError, spotId]);
  const view = selectedCombo === "all" ? chosen : combo ? { ...chosen, actions: combo.mix, tiers: { [combo.tier]: 1 }, combo } : null;
  const english = productLocale() !== "ja";
  return <div className="postflop-trial" aria-label={english ? "Postflop estimate" : "ポストフロップ試作"}>
    {!context.pilotAvailable ? <Panel className="postflop-unavailable"><StatusState title="この局面のポストフロップ方針は未収録">{continuationCopy("noPolicyDetail")}</StatusState></Panel>
      : !cards.every(Boolean) ? <Panel className="postflop-unavailable"><StatusState title={english ? "Select a flop" : "フロップを選択してください"}>{english ? "Open the flop cards in the action path and choose any three cards." : "上のアクション列にあるフロップカードを押して、任意の3枚を選んでください。"}</StatusState></Panel>
      : !board ? <Panel className="postflop-unavailable"><StatusState title={english ? "Invalid flop cards" : "フロップのカードが正しくありません"}>{english ? "Choose three distinct cards from the deck." : "重複しないカードを3枚選んでください。"}</StatusState></Panel>
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
          <StrategyMatrix node={matrixNode} title={`${nodeTitle(decision.node, context)} · ${english ? "range" : "レンジ"}`} ariaLabel={english ? `${current.seat} flop range` : `${current.seat}のフロップレンジ`}
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
                  <div className="postflop-view-line static">
                    <h3 className="postflop-view-title">{view.combo ? <>{view.combo.cards.match(/../g).map(card => <span key={card} className={`suit-${card[1]}`}>{card[0]}{suitLabels[card[1]]}</span>)}</> : <>{selectedHand}<small>{english ? "Average" : "平均"}</small></>}</h3>
                    </div>
                <ComboPicker hand={selectedHand} combos={chosen.combos} actions={current.actions} selected={selectedCombo} onSelect={setSelectedCombo} labels={labels} />
                <HandReasons node={decision.node} labels={labels} raiseAllIn={raiseAllInOf(decision)} hand={view.combo ? { ...view, hand: view.combo.cards } : view} texture={data.texture} explain={explain} boardCards={board}
                  loading={Boolean(explainLoading)} error={Boolean(explainError)}
                  positions={{ ip: context.ip, oop: context.oop }} />
              </>}
          </Panel>
          </div>
        </div>}
        {laterCurrent && laterAggregates && <div className="postflop-range-layout postflop-later-range-layout">
          <StrategyMatrix node={{ actingPosition: laterCurrent.actor }} title={`${laterHeading} · ${english ? "range" : "レンジ"}`}
            ariaLabel={english ? `${laterCurrent.actor} ${laterCurrent.street} range` : `${laterCurrent.actor} ${laterCurrent.street}のレンジ`}
            aggregates={laterAggregates} actions={laterActions} actionLabels={laterLabels} simplified={displayMode === "simple"}
            selected={selectedHand} onSelect={setSelectedHand}
            unreachableReason={english ? "No combo reaches this node; no recommendation" : "この判断に到達するコンボがありません。推奨なし"} />
          <div className="postflop-side">
            <details className="panel postflop-range-summary">
              <summary>
                <span className="postflop-range-summary-title">{english ? "Entire range" : "レンジ全体"}</span>
                <span className="postflop-range-summary-bar" style={{ background: mixGradient(Object.fromEntries(laterTotals.items.map(item => [item.action, item.frequency])), laterActions) }}
                  aria-label={laterTotals.items.map(item => `${laterLabels[item.action]} ${Math.round(item.frequency * 100)}%`).join("、")} />
              </summary>
              <p>{english ? `Weighted average of ${laterTotals.combos} reachable combos.` : `到達可能な ${laterTotals.combos}コンボの加重平均です。`}</p>
              <ActionBars items={laterTotals.items} labels={laterLabels} />
            </details>
            <Panel className="postflop-hand-detail postflop-later-hand-detail">
              {laterChosen?.unreachable ? <><SectionHeading title={selectedHand} /><StatusState title={english ? "Unreachable" : "到達不能"}>{english ? "No combo of this hand reaches this decision." : "このハンドはこの判断に到達しません。"}</StatusState></>
                : laterChosen && laterView && <>
                  <div className="postflop-view-line static">
                      <h3 className="postflop-view-title">{laterView.combo ? <>{laterView.combo.cards.match(/../g).map(card => <span key={card} className={`suit-${card[1]}`}>{card[0]}{suitLabels[card[1]]}</span>)}</> : <>{selectedHand}<small>{english ? "Average" : "平均"}</small></>}</h3>
                    </div>
                  <ComboPicker hand={selectedHand} combos={laterChosen.combos} actions={laterActions} selected={selectedLaterCombo} onSelect={setSelectedLaterCombo} labels={laterLabels}
                    missingReason={english ? "Board overlap or no reach on this action path" : "ボードと重複、またはこの行動経路に到達しない"}
                    missingTitle={english ? "Board overlap or no reach on this action path" : "ボードと重複、またはこの行動経路に到達しません"} />
                  <HandReasons node={laterCurrent.node} labels={laterLabels} raiseAllIn={raiseAllInOf(later)} hand={laterView.combo ? { ...laterView, hand: laterView.combo.cards } : laterView} texture={laterCurrent.texture} explain={laterExplain.data}
                    boardCards={`${board}${turnCard ?? ""}${laterCurrent.street === "river" ? riverCard ?? "" : ""}`}
                    loading={Boolean(laterExplain.loading)} error={Boolean(laterExplain.error)}
                    positions={{ ip: context.ip, oop: context.oop }} />
                </>}
            </Panel>
          </div>
        </div>}
      </>}
  </div>;
}

// Explanation text with poker terms as tappable chips; tapping shows the term's definition.
function GlossaryText({ text, locale, className = "" }) {
  const [open, setOpen] = useState(null);
  const pieces = glossaryPieces(text, locale);
  const definition = pieces.find(piece => piece.term === open)?.definition;
  return <div className={`postflop-glossary-text ${className}`}>
    <p>{pieces.map((piece, index) => piece.definition
      ? <button key={index} type="button" className={`postflop-term${open === piece.term ? " active" : ""}`}
        aria-expanded={open === piece.term} onClick={() => setOpen(open === piece.term ? null : piece.term)}>{piece.text}</button>
      : <span key={index}>{piece.text}</span>)}</p>
    {definition && <p className="postflop-term-definition" role="note"><strong>{open}</strong>{locale === "ja" ? "：" : ": "}{definition}</p>}
  </div>;
}

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, FastForward, Eye, Play } from "@phosphor-icons/react";
import { preloadDatasets } from "../estimated/datasets.ts";
import { loadPostflopDatasets, loadPostflopSpot } from "../estimated/postflop-browser.ts";
import { spotById } from "../../scripts/postflop-ai/spots.mjs";
import { localized } from "../i18n.ts";
import { AGENT_TABLES, GUEST_AGENT, agentTableById } from "./characters.ts";
import { playHand, type HandResult, type LogEntry } from "./hand.ts";
import { Monster } from "./Monster.tsx";
import { createAgent, makePostflopKit, type PostflopKit } from "./policy.ts";
import { createSession, finishHand, handSeed, seatPositions, toPoints, type Session } from "./session.ts";
import { handRecord, saveAgentHand } from "./agent-stats.ts";
import "./agent.css";

export const AGENT_DATASETS = ["five-bet-responses", "cold-three-bet-responses", "multiway-responses", "squeeze-responses", "limp-deep-responses"];
const SUITS: Record<string, string> = { s: "♠", h: "♥", d: "♦", c: "♣" };
// Seats clockwise from the bottom centre (x%, y% of the felt).
const SLOTS = [[50, 100], [6, 74], [14, 10], [50, -4], [86, 10], [94, 74]];
const agents = createAgent();

function Card({ card, hidden = false }: { card?: string; hidden?: boolean }) {
  if (hidden || !card) return <span className="agent-card is-back" />;
  return <span className={`trainer-card suit-${card[1]} agent-card`}><b>{card[0]}</b><i>{SUITS[card[1]]}</i></span>;
}

const bb = (value?: number) => value == null ? "" : `${+value.toFixed(2)}`;
export function actionLabel(entry: { action: string; to?: number }) {
  const { action, to } = entry;
  if (action === "fold") return "Fold";
  if (action === "check") return "Check";
  if (action === "call") return to ? `Call ${bb(to)}` : "Call";
  if (action === "limp") return "Limp";
  if (action === "open" || action === "raise" && to) return `Raise ${bb(to)}`;
  if (action === "three_bet") return `3bet ${bb(to)}`;
  if (action === "squeeze") return `Squeeze ${bb(to)}`;
  if (action === "four_bet") return `4bet ${bb(to)}`;
  if (action === "all_in" || action === "allin") return "All-in";
  if (action === "raise") return "Raise";
  const bet = /^bet(\d+)$/.exec(action);
  if (bet) return `Bet ${bet[1]}%`;
  return action;
}

function characterFor(agentId: string | null) {
  for (const table of AGENT_TABLES) { const found = table.agents.find(agent => agent.id === agentId); if (found) return found; }
  return agentId === GUEST_AGENT.id ? GUEST_AGENT : null;
}

export function AgentTablePage({ tableId, watch = false, onExit }: { tableId: string; watch?: boolean; onExit: () => void }) {
  const table = agentTableById(tableId)!;
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session>(() => createSession({ tableId, seed: `${tableId}-${Date.now()}`, humanSeat: watch ? null : 0 }));
  const [humanActions, setHumanActions] = useState<string[]>([]);
  const [kits, setKits] = useState<Map<string, PostflopKit | null>>(() => new Map());
  const [shown, setShown] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => { preloadDatasets(AGENT_DATASETS).then(() => setReady(true), error => setLoadError(String(error?.message ?? error))); }, []);

  const positions = seatPositions(session);
  const humanSeat = session.seats.findIndex(seat => seat.kind === "human");
  const humanPos = humanSeat >= 0 ? positions[humanSeat] : null;
  const result: HandResult | null = useMemo(() => {
    if (!ready) return null;
    return playHand({ seed: handSeed(session), human: humanPos, humanActions, agents, postflop: id => kits.has(id) ? kits.get(id) : undefined });
  }, [ready, session, humanPos, humanActions, kits]);

  // Load the reached spot's saved postflop policy (null when it is missing: the pot is checked down).
  useEffect(() => {
    if (result?.status !== "needs_postflop" || !result.spotId) return;
    const id = result.spotId;
    let cancelled = false;
    (async () => {
      let kit: PostflopKit | null = null;
      try {
        const spot = spotById(id);
        const [datasets, body] = await Promise.all([loadPostflopDatasets(spot), loadPostflopSpot(id)]);
        kit = makePostflopKit(id, datasets, body?.candidate, body?.laterCandidate);
      } catch { kit = null; }
      if (!cancelled) setKits(current => new Map(current).set(id, kit));
    })();
    return () => { cancelled = true; };
  }, [result?.status, result?.spotId]);

  const log = result?.log ?? [];
  const waiting = result?.status === "needs_postflop";
  // Reveal the log one action at a time.
  useEffect(() => {
    if (shown >= log.length) return;
    const timer = window.setTimeout(() => setShown(value => value + 1), shown === 0 ? 350 : 650);
    return () => window.clearTimeout(timer);
  }, [shown, log.length]);

  const revealed = log.slice(0, shown);
  const allShown = shown >= log.length && !waiting;
  const done = result?.status === "done" && allShown;
  const pending = result?.status === "awaiting" && allShown ? result.pending : null;
  const humanFolded = humanPos != null && log.some(entry => entry.pos === humanPos && entry.action === "fold");

  const stateOf = (pos: string) => {
    const mine = revealed.filter(entry => entry.pos === pos);
    const last = mine.at(-1) ?? null;
    return { folded: mine.some(entry => entry.action === "fold"), last };
  };
  // Deal the street as soon as its first action is next (or the human is asked on it).
  const CARDS: Record<string, number> = { preflop: 0, flop: 3, turn: 4, river: 5 };
  const upcoming = pending?.street ?? (shown < log.length ? log[shown]?.street : null);
  const boardCount = done ? result!.board.length
    : Math.max(CARDS[revealed.at(-1)?.street ?? "preflop"], upcoming && shown > 0 ? CARDS[upcoming] : 0, pending?.board.length ?? 0);
  const boardCards = done ? result!.board : (result?.board ?? []).slice(0, boardCount);
  const pot = done ? result!.pot : revealed.at(-1)?.pot ?? 1.5;

  const nameOf = (pos: string) => {
    const seat = session.seats[Number(Object.entries(positions).find(([, p]) => p === pos)?.[0])];
    const character = seat?.kind === "agent" ? characterFor(seat.agentId) : null;
    return character ? localized(character.name.en, character.name.ja) : localized("You", "あなた");
  };
  // Record the human's finished hand once (Agent戦 in プレー分析).
  const recorded = useRef(-1);
  useEffect(() => {
    if (!done || !humanPos || recorded.current === session.handNo) return;
    recorded.current = session.handNo;
    saveAgentHand(handRecord(result!, tableId, humanPos));
  }, [done, humanPos, session.handNo, result, tableId]);
  const act = (key: string) => setHumanActions(current => [...current, key]);
  const nextHand = () => {
    if (!result || result.status !== "done") return;
    setSession(current => finishHand(current, result.returns!));
    setHumanActions([]); setShown(0);
  };

  if (loadError) return <div className="agent-page"><p className="agent-error">{loadError}</p></div>;
  const order = humanSeat >= 0 ? humanSeat : 0;
  return <div className="agent-page" style={{ "--table-theme": table.theme } as any}>
    <header className="agent-top">
      <button type="button" className="setup-secondary" onClick={onExit}><ArrowLeft size={14} weight="bold" />{localized("Back", "戻る")}</button>
      <div><strong>{localized(table.name.en, table.name.ja)}</strong><small>{watch ? localized("Spectating · agents only", "観戦 · Agentのみ") : localized("Evion Agent · 6-max 100BB", "Evion Agent · 6-max 100BB")} · {localized(`Hand ${session.handNo + 1}`, `${session.handNo + 1}ハンド目`)}</small></div>
      <span className="agent-rule" title={localized("Every flop is heads-up: a call that would make a third player is not offered.", "フロップは常に1対1：3人目になるコールは選べません（卓ルール）")}>{localized("Heads-up flops", "HUのみフロップへ")}</span>
    </header>
    <div className="agent-felt-wrap">
      <div className="agent-felt">
        <div className="agent-center">
          <div className="agent-board">{[0, 1, 2, 3, 4].map(i => boardCards[i] ? <Card key={i} card={boardCards[i]} /> : <span key={i} className="agent-card is-slot" />)}</div>
          <div className="agent-pot">{localized("Pot", "ポット")} <b>{toPoints(pot ?? 0).toLocaleString()}</b><small>{bb(pot)}BB</small></div>
          {waiting && <div className="agent-thinking">{localized("Loading the AI estimate…", "AI推定を読み込み中…")}</div>}
          {done && result?.policyMissing && <div className="agent-note">{localized("No saved postflop policy for this line: checked down.", "この経路のAI方針がないためチェックダウンしました")}</div>}
        </div>
        {session.seats.map((seat, index) => {
          const slot = SLOTS[(index - order + 6) % 6];
          const pos = positions[index];
          const { folded, last } = stateOf(pos);
          const character = seat.kind === "agent" ? characterFor(seat.agentId) : null;
          const isHuman = seat.kind === "human";
          const won = done && result?.winners?.includes(pos);
          const showCards = isHuman || (done && result?.showdown && !folded);
          const delta = done ? toPoints(result!.returns![pos] ?? 0) : null;
          const acting = !done && (pending?.pos === pos || (log[shown]?.pos === pos && !allShown));
          return <div key={index} className={`agent-seat${isHuman ? " is-human" : ""}${folded ? " is-folded" : ""}${won ? " is-winner" : ""}${acting ? " is-acting" : ""}`}
            style={{ left: `${slot[0]}%`, top: `${slot[1]}%` }}>
            {last && <span className={`agent-bubble act-${last.action.replace(/\d+/, "")}`}>{actionLabel(last)}</span>}
            <div className="agent-avatar">
              {character ? <Monster id={character.id} color={character.color} size={58} mood={won ? "win" : folded ? "fold" : "idle"} /> : <span className="agent-you">{localized("YOU", "あなた")}</span>}
              <span className="agent-pos">{pos}</span>
            </div>
            <div className="agent-name"><b>{character ? localized(character.name.en, character.name.ja) : localized("You", "あなた")}</b>
              <small>{seat.points >= 0 ? "+" : ""}{seat.points.toLocaleString()}</small></div>
            <div className="agent-hole">{(result?.holeCards[pos] ?? []).map((card, i) => <Card key={i} card={card} hidden={!showCards} />)}</div>
            {delta != null && delta !== 0 && <span className={`agent-delta ${delta > 0 ? "up" : "down"}`}>{delta > 0 ? "+" : ""}{delta.toLocaleString()}</span>}
          </div>;
        })}
      </div>
    </div>
    <footer className="agent-actions">
      {pending ? pending.options.map(option => <button type="button" key={option.key} className={`agent-act act-${option.key.replace(/\d+/, "")}`} onClick={() => act(option.key)}>
          {actionLabel({ action: option.key, to: option.to })}</button>)
        : done ? <>
            <p className="agent-summary">{summary(result!, humanPos, nameOf)}</p>
            <button type="button" className="drill-start" onClick={nextHand}><Play size={14} weight="fill" />{localized("Next hand", "次のハンド")}</button>
          </>
        : <>
            <p className="agent-summary">{humanFolded ? localized("You folded. Watch the rest or skip.", "降りました。続きを観戦するかスキップできます。") : localized("Agents are thinking…", "Agentが考えています…")}</p>
            {humanFolded && <button type="button" className="setup-secondary" onClick={() => setShown(log.length)}><FastForward size={14} weight="bold" />{localized("Skip", "スキップ")}</button>}
            {humanFolded && <span className="agent-watching"><Eye size={14} />{localized("Watching", "観戦中")}</span>}
          </>}
    </footer>
  </div>;
}

function summary(result: HandResult, humanPos: string | null, nameOf: (pos: string) => string) {
  const winners = result.winners ?? [];
  const who = winners.map(nameOf).join(" / ");
  const mine = humanPos ? toPoints(result.returns?.[humanPos] ?? 0) : null;
  const head = result.showdown ? localized(`Showdown: ${who} wins`, `ショーダウン：${who} の勝ち`) : localized(`${who} takes the pot`, `${who} がポットを獲得`);
  return mine == null ? head : `${head} · ${localized("you", "あなた")} ${mine >= 0 ? "+" : ""}${mine.toLocaleString()}`;
}

export type AgentLogEntry = LogEntry;

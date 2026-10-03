import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ChartBar, Eye, FastForward, Info, Lightning } from "@phosphor-icons/react";
import { preloadDatasets } from "../estimated/datasets.ts";
import { loadPostflopDatasets, loadPostflopSpot } from "../estimated/postflop-browser.ts";
import { spotById } from "../../scripts/postflop-ai/spots.mjs";
import { localized } from "../i18n.ts";
import { AGENT_TABLE, GUEST_AGENT, agentTableById } from "./characters.ts";
import { categoryName, playHand, type HandResult, type LogEntry } from "./hand.ts";
import { productLocale } from "../locale.ts";
import { AgentAvatar } from "./AgentAvatar.tsx";
import { createAgent, makePostflopKit, type PostflopKit } from "./policy.ts";
import { createSession, finishHand, handSeed, seatPositions, toPoints, type Session } from "./session.ts";
import { handRecord, loadAgentHands, saveAgentHand } from "./agent-stats.ts";
import { playerRead } from "./player-read.ts";
import { PlayStyleCard, PlayStyleDashboard } from "./PlayStyleDashboard.tsx";
import "./agent.css";

export const AGENT_DATASETS = ["five-bet-responses", "cold-three-bet-responses", "multiway-responses", "squeeze-responses", "limp-deep-responses"];
const SUITS: Record<string, string> = { s: "♠", h: "♥", d: "♦", c: "♣" };
const STREETS = ["preflop", "flop", "turn", "river"];
const CARDS: Record<string, number> = { preflop: 0, flop: 3, turn: 4, river: 5 };
const CARDS_TO_STREET: Record<number, string> = { 0: "preflop", 3: "flop", 4: "turn", 5: "river" };
const BLINDS: Record<string, number> = { SB: 0.5, BB: 1 };
// Seats sit in slots 0-5 clockwise from the bottom centre; agent.css places the seats and chips.
const SPEEDS = { normal: 700, fast: 280 } as const;
type Speed = keyof typeof SPEEDS;

const readPref = <T,>(key: string, fallback: T): T => { try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; } };
const writePref = (key: string, value: unknown) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ } };

function Card({ card, hidden = false, size = "" }: { card?: string; hidden?: boolean; size?: string }) {
  if (hidden || !card) return <span className={`agent-card is-back ${size}`} />;
  return <span className={`trainer-card suit-${card[1]} agent-card ${size}`}><b>{card[0]}</b><i>{SUITS[card[1]]}</i></span>;
}

const bb = (value?: number) => value == null ? "" : `${+value.toFixed(2)}`;
const pts = (value: number) => toPoints(value).toLocaleString();
const signed = (points: number) => `${points > 0 ? "+" : ""}${points.toLocaleString()}`;

export function actionLabel(entry: { action: string; to?: number }) {
  const { action, to } = entry;
  const amount = to ? ` ${bb(to)}` : "";
  if (action === "fold") return localized("Fold", "フォールド");
  if (action === "check") return localized("Check", "チェック");
  if (action === "call") return `${localized("Call", "コール")}${amount}`;
  if (action === "limp") return localized("Limp", "リンプ");
  if (action === "open") return `${localized("Raise", "レイズ")}${amount}`;
  if (action === "three_bet") return `3bet${amount}`;
  if (action === "squeeze") return `${localized("Raise", "レイズ")}${amount}`;
  if (action === "four_bet") return `4bet${amount}`;
  if (action === "all_in" || action === "allin") return localized("All-in", "オールイン");
  if (action === "raise") return `${localized("Raise", "レイズ")}${amount}`;
  const bet = /^bet(\d+)$/.exec(action);
  if (bet) return `${localized("Bet", "ベット")}${amount || ` ${bet[1]}%`}`;
  return action;
}
// Raises and bets read as street totals; a call reads as the chips it adds.
function asDisplayed(entries: LogEntry[], entry: LogEntry) {
  if (entry.action !== "call" || entry.to == null) return entry;
  const index = entries.indexOf(entry);
  const before = entries.slice(0, index).reverse().find(item => item.pos === entry.pos && item.street === entry.street);
  const previous = before?.to ?? (entry.street === "preflop" ? BLINDS[entry.pos] ?? 0 : 0);
  return { ...entry, to: Math.round((entry.to - previous) * 100) / 100 };
}
const tone = (action: string) => action === "fold" ? "fold" : action === "check" ? "check" : action === "call" || action === "limp" ? "call" : "raise";

function characterFor(agentId: string | null) {
  return AGENT_TABLE.agents.find(agent => agent.id === agentId) ?? (agentId === GUEST_AGENT.id ? GUEST_AGENT : null);
}

// Chips in front of each seat on `street`, and each seat's total committed so far.
function chipState(revealed: LogEntry[], street: string) {
  const lastBets: Record<string, Record<string, number>> = {};
  for (const entry of revealed) lastBets[entry.street] = { ...(lastBets[entry.street] ?? {}), ...(entry.bets ?? {}) };
  const committed: Record<string, number> = { ...BLINDS, ...(lastBets.preflop ?? {}) };
  for (const s of ["flop", "turn", "river"]) for (const [pos, value] of Object.entries(lastBets[s] ?? {})) committed[pos] = (committed[pos] ?? 0) + value;
  const front = street === "preflop" ? { ...BLINDS, ...(lastBets.preflop ?? {}) } : (lastBets[street] ?? {});
  return { committed, front };
}

type HistoryItem = { no: number; winners: string; mine: number | null; showdown: boolean };

export function AgentTablePage({ tableId, watch = false, onExit }: { tableId: string; watch?: boolean; onExit: () => void }) {
  const table = agentTableById(tableId)!;
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session>(() => createSession({ tableId, seed: `${tableId}-${Date.now()}`, humanSeat: watch ? null : 0 }));
  const [humanActions, setHumanActions] = useState<string[]>([]);
  const [kits, setKits] = useState<Map<string, PostflopKit | null>>(() => new Map());
  const [shown, setShown] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [speed, setSpeed] = useState<Speed>(() => readPref("evionai:agent-speed", "normal"));
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [styleOpen, setStyleOpen] = useState(false);

  useEffect(() => { preloadDatasets(AGENT_DATASETS).then(() => setReady(true), error => setLoadError(String(error?.message ?? error))); }, []);

  const positions = seatPositions(session);
  const humanSeat = session.seats.findIndex(seat => seat.kind === "human");
  const humanPos = humanSeat >= 0 ? positions[humanSeat] : null;
  // The agents read the human's latest 1000 Agent hands. The read is fixed when a hand starts so a
  // replay of that hand never changes; it is handed to the agents as their profile (A5 hook).
  const handRead = useMemo(() => humanPos ? playerRead(loadAgentHands()) : null, [session.handNo, humanPos]); // eslint-disable-line react-hooks/exhaustive-deps
  const agents = useMemo(() => createAgent({ profileId: handRead && handRead.confidence !== "collecting" ? handRead.style.id : null }), [handRead]);
  const result: HandResult | null = useMemo(() => {
    if (!ready) return null;
    return playHand({ seed: handSeed(session), human: humanPos, humanActions, agents, postflop: id => kits.has(id) ? kits.get(id) : undefined });
  }, [ready, session, humanPos, humanActions, kits, agents]);

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
  // Reveal the log one action at a time; a new street pauses a little longer for the deal.
  useEffect(() => {
    if (shown >= log.length) return;
    const newStreet = shown > 0 && log[shown]?.street !== log[shown - 1]?.street;
    const delay = shown === 0 ? 400 : SPEEDS[speed] * (newStreet ? 1.6 : 1);
    const timer = window.setTimeout(() => setShown(value => value + 1), delay);
    return () => window.clearTimeout(timer);
  }, [shown, log, speed]);

  const revealed = log.slice(0, shown);
  const allShown = shown >= log.length && !waiting;
  const done = result?.status === "done" && allShown;
  const pending = result?.status === "awaiting" && allShown ? result.pending! : null;
  const humanFolded = humanPos != null && log.some(entry => entry.pos === humanPos && entry.action === "fold");

  // The street on screen: deal it as soon as its first action is next (or the human is asked on it).
  const upcoming = pending?.street ?? (shown < log.length && shown > 0 ? log[shown]?.street : null);
  const lastStreet = revealed.at(-1)?.street ?? "preflop";
  const streetIndex = done ? Math.max(STREETS.indexOf(lastStreet), STREETS.indexOf(CARDS_TO_STREET[result!.board.length] ?? "preflop"))
    : Math.max(STREETS.indexOf(lastStreet), upcoming ? STREETS.indexOf(upcoming) : 0);
  const street = STREETS[streetIndex];
  const boardCards = done ? result!.board : (result?.board ?? []).slice(0, CARDS[street]);
  // A freshly dealt street has no chips in front yet: the previous street's bets went to the pot.
  const chips = chipState(revealed, street === lastStreet ? street : "");
  const totalPot = done ? result!.pot! : Object.values(chips.committed).reduce((sum, value) => sum + value, 0);
  const frontTotal = done ? 0 : Object.values(chips.front).reduce((sum, value) => sum + value, 0);

  const nameOf = useCallback((pos: string) => {
    const seat = session.seats[Number(Object.entries(positions).find(([, p]) => p === pos)?.[0])];
    const character = seat?.kind === "agent" ? characterFor(seat.agentId) : null;
    return character ? localized(character.name.en, character.name.ja) : localized("You", "あなた");
  }, [session, positions]);

  // Record the finished hand once: Agent戦 in プレー分析 (human only) and the recent-hands list.
  const recorded = useRef(-1);
  useEffect(() => {
    if (!done || recorded.current === session.handNo) return;
    recorded.current = session.handNo;
    if (humanPos) saveAgentHand(handRecord(result!, tableId, humanPos));
    setHistory(current => [{ no: session.handNo + 1, winners: (result!.winners ?? []).map(nameOf).join(" / "),
      mine: humanPos ? toPoints(result!.returns![humanPos] ?? 0) : null, showdown: Boolean(result!.showdown) }, ...current].slice(0, 30));
  }, [done, humanPos, session.handNo, result, tableId, nameOf]);

  const act = (key: string) => setHumanActions(current => [...current, key]);
  const nextHand = useCallback(() => {
    if (!result || result.status !== "done") return;
    setSession(current => finishHand(current, result.returns!));
    setHumanActions([]); setShown(0);
  }, [result]);
  const skip = () => setShown(log.length);

  // Spectating: deal the next hand by itself after a short pause.
  useEffect(() => {
    if (!done) return;
    const timer = window.setTimeout(nextHand, speed === "fast" ? 300 : 600);
    return () => window.clearTimeout(timer);
  }, [done, nextHand, speed]);

  // Keyboard: 1-9 pick an action, Enter / Space deal the next hand, S skips.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || (event.target as HTMLElement)?.closest?.("input, textarea, select")) return;
      if (pending && /^[1-9]$/.test(event.key)) {
        const option = pending.options[Number(event.key) - 1];
        if (option) { event.preventDefault(); act(option.key); }
      } else if (done && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); nextHand(); }
      else if (!pending && !done && (event.key === "s" || event.key === "S") && (humanFolded || watch)) skip();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // The dashboard shows the read including the hand just finished.
  const liveRead = useMemo(() => humanPos ? playerRead(loadAgentHands()) : null, [humanPos, history.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!styleOpen) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setStyleOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [styleOpen]);

  if (loadError) return <div className="agent-page"><p className="agent-error">{loadError}</p></div>;
  const order = humanSeat >= 0 ? humanSeat : 0;
  const standings = session.seats.map((seat, index) => ({ seat, index })).sort((a, b) => b.seat.points - a.seat.points);
  const actingPos = !done ? (pending?.pos ?? (!allShown ? log[shown]?.pos : null)) : null;
  const winnerLine = done ? resultLine(result!, nameOf) : null;
  const myDelta = done && humanPos ? toPoints(result!.returns![humanPos] ?? 0) : null;

  return <div className="agent-page" style={{ "--table-theme": table.theme } as any}>
    <header className="agent-top">
      <button type="button" className="agent-back" onClick={onExit} aria-label={localized("Back", "戻る")}><ArrowLeft size={16} weight="bold" /></button>
      <div className="agent-title">
        <strong>{localized(table.name.en, table.name.ja)}</strong>
        <small>{watch ? localized("Spectating", "観戦") : "Evion Agent"} · 6-max 100BB · #{session.handNo + 1}</small>
      </div>
      <div className="agent-tools">
        <div className="agent-segment" role="group" aria-label={localized("Speed", "速さ")}>
          {(Object.keys(SPEEDS) as Speed[]).map(value => <button key={value} type="button" aria-pressed={speed === value}
            onClick={() => { setSpeed(value); writePref("evionai:agent-speed", value); }}>
            {value === "fast" && <Lightning size={12} weight="fill" />}{value === "fast" ? localized("Fast", "速い") : localized("Normal", "ふつう")}</button>)}
        </div>
        {liveRead && <button type="button" className="agent-toggle" onClick={() => setStyleOpen(true)}><ChartBar size={13} weight="bold" />{localized("Play style", "プレイスタイル")}</button>}
        <span className="agent-rule" tabIndex={0}><Info size={13} />{localized("Beta · heads-up flops", "β版 · フロップはHUのみ")}
          <span className="agent-rule-tip" role="tooltip">{localized("Evion Agent is in beta and multiway pots aren't supported yet. A call that would bring a third player to the flop isn't offered (agents fold that share instead), and lines without saved data fold.",
            "Evion Agentはβ版で、まだマルチウェイに対応していません。3人目としてフロップへ行くコールは選べず（Agentはその頻度をフォールドに回します）、保存データのない場面はフォールドになります。")}</span></span>
      </div>
    </header>

    <div className="agent-layout">
      <section className="agent-stage">
        <div className="agent-felt-wrap">
          <div className="agent-felt">
            <span className="agent-felt-logo" aria-hidden="true">EvionAI</span>
            <div className="agent-center">
              <div className="agent-board">{[0, 1, 2, 3, 4].map(i => boardCards[i]
                ? <Card key={`${i}-${boardCards[i]}`} card={boardCards[i]} size="is-board" />
                : <span key={i} className="agent-card is-slot is-board" />)}</div>
              {done ? <div className="agent-result" key={session.handNo}>
                  <b>{winnerLine}</b>
                  <small>{localized("Pot", "ポット")} {pts(totalPot)}{result!.rake ? ` · ${localized("rake", "レーキ")} ${pts(result!.rake)}` : ""}</small>
                </div>
                : totalPot - frontTotal > 0.001
                  ? <div className="agent-pot"><span>{localized("Pot", "ポット")}</span><b>{pts(totalPot - frontTotal)}</b>{frontTotal > 0 && <small>{localized("total", "合計")} {pts(totalPot)}</small>}</div>
                  : <div className="agent-pot is-total"><span>{localized("Total", "合計")}</span><b>{pts(totalPot)}</b></div>}
              {waiting && <div className="agent-thinking">{localized("Reading the AI estimate…", "AI推定を読み込み中…")}</div>}
              {done && result?.policyMissing && <div className="agent-note">{localized("No saved postflop policy for this line, so it was checked down.", "この経路のAI方針がないため、チェックダウンしました")}</div>}
            </div>
            {!done && session.seats.map((seat, index) => {
              const slotIndex = (index - order + 6) % 6;
              const amount = chips.front[positions[index]] ?? 0;
              return amount > 0 ? <span key={`chip-${index}`} className={`agent-chip slot-${slotIndex}`}>
                <i aria-hidden="true" />{pts(amount)}</span> : null;
            })}
            {session.seats.map((seat, index) => {
              const slotIndex = (index - order + 6) % 6;
              const pos = positions[index];
              const mine = revealed.filter(entry => entry.pos === pos);
              const folded = mine.some(entry => entry.action === "fold");
              const last = mine.at(-1);
              // A fold shows only while it is the latest action; the dimmed seat says the rest.
              const lastOnStreet = last && last.street === street && (last.action !== "fold" || revealed.at(-1) === last) ? last : null;
              const character = seat.kind === "agent" ? characterFor(seat.agentId) : null;
              const isHuman = seat.kind === "human";
              const won = done && result?.winners?.includes(pos);
              // Spectators see every hand, like a broadcast; players only see a showdown.
              const showCards = isHuman || watch || (done && result?.showdown && !folded);
              const delta = done ? toPoints(result!.returns![pos] ?? 0) : null;
              const stack = done ? 100 + (result!.returns![pos] ?? 0) : 100 - (chips.committed[pos] ?? 0);
              return <div key={index} className={`agent-seat slot-${slotIndex}${isHuman ? " is-human" : ""}${folded ? " is-folded" : ""}${won ? " is-winner" : ""}${actingPos === pos ? " is-acting" : ""}`}>
                <div className="agent-hole">{(result?.holeCards[pos] ?? []).map((card, i) => <Card key={`${session.handNo}-${i}`} card={card} hidden={!showCards} size={isHuman ? "is-hero" : ""} />)}</div>
                <div className="agent-plate">
                  <div className="agent-avatar">
                    {character ? <AgentAvatar id={character.id} color={character.color} size={50} state={won ? "win" : folded ? "fold" : "idle"} /> : <span className="agent-you">YOU</span>}
                    {actingPos === pos && !isHuman && <span className="agent-dots" aria-hidden="true"><i /><i /><i /></span>}
                  </div>
                  <div className="agent-meta">
                    <b>{character ? character.name.en : localized("You", "あなた")}</b>
                    <small>{pts(stack)}</small>
                  </div>
                  <span className="agent-pos">{pos}</span>
                  {pos === "BTN" && <span className="agent-dealer" aria-label="Dealer">D</span>}
                </div>
                {lastOnStreet && !done && <span className={`agent-bubble tone-${tone(lastOnStreet.action)}`} key={`${lastOnStreet.street}-${mine.length}`}>{actionLabel(asDisplayed(revealed, lastOnStreet))}</span>}
                {done && result?.showdown && result.handRanks?.[pos] != null && !folded && <span className={`agent-handname${won ? " is-win" : ""}`}>{handName(result.handRanks[pos])}</span>}
                {delta != null && delta !== 0 && <span className={`agent-delta ${delta > 0 ? "up" : "down"}`}>{signed(delta)}</span>}
              </div>;
            })}
          </div>
        </div>

        <footer className={`agent-actions${pending ? " is-turn" : ""}`}>
          {pending ? <>
              <div className="agent-turn">
                <b>{localized("Your turn", "あなたの番")}</b>
                <small>{pending.toCall ? localized(`To call ${bb(pending.toCall)}BB`, `コール額 ${bb(pending.toCall)}BB`) : localized("You can check", "チェックできます")} · {localized("pot", "ポット")} {bb(pending.pot)}BB</small>
                {pending.notice === "no_multiway" && <small className="agent-turn-note">{localized("Beta: multiway pots aren't supported yet, so a call that would make the flop three-way isn't offered.", "β版のため、まだマルチウェイ（3人以上でのフロップ）に対応していません。ここでのコールは3人目になるため選べません。")}</small>}
              </div>
              <div className="agent-buttons">{pending.options.map((option, index) => <button type="button" key={option.key} className={`agent-act tone-${tone(option.key)}`} onClick={() => act(option.key)}>
                <kbd>{index + 1}</kbd><span>{actionLabel({ action: option.key, to: option.key === "call" ? pending.toCall : option.to })}</span>
                {/^bet\d+$/.test(option.key) && <small>{option.key.slice(3)}%</small>}</button>)}</div>
            </>
            : done ? <>
              <p className="agent-summary">{myDelta == null ? winnerLine : <>{localized("This hand", "このハンド")} <b className={myDelta > 0 ? "up" : myDelta < 0 ? "down" : ""}>{signed(myDelta)}</b></>}</p>
            </>
            : <>
              <p className="agent-summary">{humanFolded ? localized("You folded — watch the rest or skip.", "降りました。続きを観戦するか、スキップできます。")
                : waiting ? localized("Preparing the flop…", "フロップを準備中…") : localized("Agents are thinking…", "Agentが考えています…")}</p>
              {(humanFolded || watch) && <button key="skip" type="button" className="agent-skip" onClick={skip}><FastForward size={14} weight="bold" />{localized("Skip", "スキップ")}<kbd>S</kbd></button>}
              {humanFolded && <span className="agent-watching"><Eye size={14} />{localized("Watching", "観戦中")}</span>}
            </>}
        </footer>
      </section>

      <aside className="agent-side">
        {liveRead && <PlayStyleCard read={liveRead} onOpen={() => setStyleOpen(true)} />}
        <section className="agent-panel">
          <h3>{localized("Session", "セッション")}<small>{localized(`${session.handNo} hands`, `${session.handNo}ハンド`)}</small></h3>
          <ol className="agent-standings">{standings.map(({ seat, index }) => {
            const character = seat.kind === "agent" ? characterFor(seat.agentId) : null;
            return <li key={index} className={seat.kind === "human" ? "is-human" : ""}>
              <span className="agent-mini">{character ? <AgentAvatar id={character.id} color={character.color} size={22} /> : <i>YOU</i>}</span>
              <span>{character ? localized(character.name.en, character.name.ja) : localized("You", "あなた")}</span>
              <b className={seat.points > 0 ? "up" : seat.points < 0 ? "down" : ""}>{signed(seat.points)}</b>
            </li>;
          })}</ol>
        </section>
        <section className="agent-panel agent-log">
          <h3>{localized("This hand", "このハンド")}</h3>
          <HandLog entries={revealed} nameOf={nameOf} board={result?.board ?? []} />
        </section>
        {history.length > 0 && <section className="agent-panel">
          <h3>{localized("Recent hands", "最近のハンド")}</h3>
          <ul className="agent-recent">{history.slice(0, 6).map(item => <li key={item.no}>
            <span>#{item.no}</span><span>{item.winners}{item.showdown ? "" : ` · ${localized("no showdown", "SDなし")}`}</span>
            {item.mine != null && <b className={item.mine > 0 ? "up" : item.mine < 0 ? "down" : ""}>{signed(item.mine)}</b>}
          </li>)}</ul>
        </section>}
      </aside>
    </div>
    {styleOpen && liveRead && <div className="style-drawer" role="dialog" aria-modal="true" aria-label={localized("Your play style", "あなたのプレイスタイル")}>
      <button type="button" className="style-drawer-backdrop" aria-label={localized("Close", "閉じる")} onClick={() => setStyleOpen(false)} />
      <div className="style-drawer-panel"><PlayStyleDashboard read={liveRead} onClose={() => setStyleOpen(false)} /></div>
    </div>}
  </div>;
}

function HandLog({ entries, nameOf, board }: { entries: LogEntry[]; nameOf: (pos: string) => string; board: string[] }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView?.({ block: "nearest" }); }, [entries.length]);
  if (!entries.length) return <p className="agent-log-empty">{localized("Dealing…", "配っています…")}</p>;
  const groups = STREETS.map(street => ({ street, items: entries.filter(entry => entry.street === street) })).filter(group => group.items.length);
  const label: Record<string, string> = { preflop: localized("Preflop", "プリフロップ"), flop: localized("Flop", "フロップ"), turn: localized("Turn", "ターン"), river: localized("River", "リバー") };
  return <div className="agent-log-body">
    {groups.map(group => <div key={group.street} className="agent-log-street">
      <header><span>{label[group.street]}</span>
        {CARDS[group.street] > 0 && <span className="agent-log-cards">{board.slice(group.street === "flop" ? 0 : CARDS[group.street] - 1, CARDS[group.street]).map(card => <Card key={card} card={card} size="is-tiny" />)}</span>}</header>
      <ul>{group.items.map((entry, i) => <li key={i} className={`tone-${tone(entry.action)}`}><span>{nameOf(entry.pos)}<small>{entry.pos}</small></span><b>{actionLabel(asDisplayed(entries, entry))}</b></li>)}</ul>
    </div>)}
    <div ref={end} />
  </div>;
}

const handName = (category: number) => categoryName(category, productLocale() === "ja" ? "ja" : "en");

function resultLine(result: HandResult, nameOf: (pos: string) => string) {
  const winners = result.winners ?? [];
  const who = winners.map(nameOf).join(" / ");
  const hand = result.showdown && winners[0] && result.handRanks?.[winners[0]] != null ? handName(result.handRanks[winners[0]]) : null;
  if (winners.length > 1) return localized(`Split pot: ${who}`, `引き分け：${who}`);
  return hand ? localized(`${who} wins with ${hand}`, `${who} の勝ち（${hand}）`) : localized(`${who} takes the pot`, `${who} がポットを獲得`);
}

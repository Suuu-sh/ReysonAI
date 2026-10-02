import { createContext, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowRight, ArrowUpRight, Check, List, Spade, Trophy, X } from "@phosphor-icons/react";
import previewRanges from "./range-preview.json";
import { en, type SiteCopy, type SiteLocale } from "./content";
import { ja } from "./content-ja";

const SiteContext = createContext<{ locale: SiteLocale; copy: SiteCopy; onLocaleChange: () => void; motion: boolean }>({ locale: "en", copy: en, onLocaleChange: () => {}, motion: false });
const useSite = () => useContext(SiteContext);

type Action = "raise" | "call" | "fold";
type RangeMode = "opening" | "response";
type DisplayMode = "simple" | "standard";
type Suit = "s" | "h" | "d" | "c";
const displayModeKey = "solvea:site-preview-display-mode:v1";
const actions: Action[] = ["raise", "call", "fold"];

const ranks = [..."AKQJT98765432"];
const cells = ranks.flatMap((first, row) => ranks.map((second, column) => ({
  hand: row === column ? `${first}${second}` : row < column ? `${first}${second}s` : `${second}${first}o`,
  wave: row + column,
})));
const opening = new Map(Object.entries(previewRanges.opening));
const response = new Map(Object.entries(previewRanges.response));

function frequencies(mode: RangeMode, hand: string): Record<Action, number> {
  if (mode === "opening") {
    const row = opening.get(hand);
    return { raise: row?.open ?? 0, call: 0, fold: row?.fold ?? 100 };
  }
  const row = response.get(hand);
  return { raise: row?.three_bet ?? 0, call: row?.call ?? 0, fold: row?.fold ?? 100 };
}

function dominantAction(values: Record<Action, number>): Action {
  return actions.reduce((best, action) => values[action] > values[best] ? action : best, "fold");
}

const combos = (hand: string) => hand.length === 2 ? 6 : hand.endsWith("s") ? 4 : 12;

/** Combination-weighted share (0–100) of all 1,326 starting hands that take `action`. */
function actionShare(mode: RangeMode, action: Action) {
  return cells.reduce((sum, { hand }) => sum + combos(hand) * frequencies(mode, hand)[action] / 100, 0) / 1326 * 100;
}

function actionLabel(copy: SiteCopy, mode: RangeMode, action: Action) {
  return action === "raise" && mode === "response" ? copy.common.threeBet : copy.common[action];
}

const suitGlyph: Record<Suit, string> = { s: "♠", h: "♥", d: "♦", c: "♣" };
const suitOrder: Suit[] = ["s", "h", "d", "c"];

/** Concrete cards for a hand class; `seed` varies the suits without changing suitedness. */
function handCards(hand: string, seed = 0): [string, Suit][] {
  const first = suitOrder[([...hand].reduce((sum, char) => sum + char.charCodeAt(0), 0) + seed) % 4];
  const second = hand.endsWith("s") ? first : suitOrder[(suitOrder.indexOf(first) + 1 + seed % 3) % 4];
  return [[hand[0], first], [hand[1], second]];
}

function prefersReducedMotion() {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return true; }
}

function useInView<T extends Element>(rootMargin = "0px", once = true) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") { setInView(true); return; }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setInView(true);
        if (once) observer.disconnect();
      } else if (!once) setInView(false);
    }, { rootMargin });
    observer.observe(node);
    return () => observer.disconnect();
  }, [rootMargin, once]);
  return [ref, inView] as const;
}

function Brand() {
  const { copy } = useSite();
  return <a className="site-brand" href="/" aria-label={copy.common.home}><Spade size={24} weight="fill" aria-hidden="true" /><span>Evion<b>AI</b></span></a>;
}

// Mirrors the trainer's PlayingCard markup so the site shows the app's four-colour cards.
function PlayingCard({ rank, suit, index = 0 }: { rank: string; suit: Suit; index?: number }) {
  return <span className={`site-card suit-${suit}`} style={{ "--i": index } as CSSProperties} aria-hidden="true"><b>{rank}</b><i>{suitGlyph[suit]}</i></span>;
}

function HandCards({ hand, seed = 0, className = "" }: { hand: string; seed?: number; className?: string }) {
  return <span className={`site-hand-cards${className ? ` ${className}` : ""}`}>{handCards(hand, seed).map(([rank, suit], index) => <PlayingCard key={`${rank}${suit}`} rank={rank} suit={suit} index={index} />)}</span>;
}

function FrequencyBars({ mode, values }: { mode: RangeMode; values: Record<Action, number> }) {
  const { copy } = useSite();
  const shown = actions.filter(action => values[action] > 0);
  return <fieldset className="site-freq"><legend className="site-visually-hidden">{copy.preview.frequencyLabel}</legend>
    <span className="site-freq-track" aria-hidden="true">{shown.map(action => <span key={action} className={`is-${action}`} style={{ width: `${values[action]}%` }} />)}</span>
    <span className="site-freq-values">{shown.map(action => <span key={action}><i className={`is-${action}`} /><em>{actionLabel(copy, mode, action)}</em><b>{values[action]}%</b></span>)}</span>
  </fieldset>;
}

function RangeMatrix({ mode, displayMode, selected, onSelect }: { mode: RangeMode; displayMode: DisplayMode; selected: string; onSelect: (hand: string) => void }) {
  const { copy } = useSite();
  return <section className="site-matrix-scroll" aria-label={`${mode === "opening" ? copy.preview.spotOpening : copy.preview.spotResponse} ${copy.preview.scrollLabel}`}>
    <fieldset className="site-matrix"><legend className="site-visually-hidden">{copy.preview.matrixLabel}</legend>
      {cells.map(({ hand, wave }) => {
        const values = frequencies(mode, hand);
        const action = dominantAction(values);
        const mixed = actions.filter(option => values[option] > 0);
        const breakdown = mixed.map(option => `${actionLabel(copy, mode, option)} ${values[option]}%`).join(" / ");
        return <button
          type="button"
          key={hand}
          className={`site-cell is-${action}${selected === hand ? " is-selected" : ""}`}
          style={{ "--wave": wave } as CSSProperties}
          aria-label={`${hand}: ${breakdown}`}
          aria-pressed={selected === hand}
          title={`${hand} · ${breakdown}`}
          onClick={() => onSelect(hand)}
        >{hand}{displayMode === "standard" && mixed.length > 1 && <span className="site-cell-mix" aria-hidden="true">{mixed.map(option => <span key={option} className={`is-${option}`} style={{ width: `${values[option]}%` }} />)}</span>}</button>;
      })}
    </fieldset>
  </section>;
}

const tourHands: Record<RangeMode, string[]> = {
  opening: ["K7s", "A5o", "Q4s", "T9s", "J9o", "22", "K2s", "86s"],
  response: ["A5s", "K7s", "98o", "74s", "QJo", "A2o", "55"],
};

function Explorer() {
  const { copy: c, motion } = useSite();
  const [mode, setMode] = useState<RangeMode>("opening");
  const [selected, setSelected] = useState("K7s");
  const [touring, setTouring] = useState(true);
  const [displayMode, setDisplayMode] = useState<DisplayMode>(() => {
    try { return window.localStorage.getItem(displayModeKey) === "standard" ? "standard" : "simple"; } catch { return "simple"; }
  });
  const [ref, visible] = useInView<HTMLDivElement>("0px", false);
  const values = frequencies(mode, selected);
  const action = dominantAction(values);
  const spot = mode === "opening" ? c.preview.spotOpening : c.preview.spotResponse;
  const isTouring = touring && motion;

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const stop = () => setTouring(false);
    node.addEventListener("pointerdown", stop);
    node.addEventListener("keydown", stop);
    return () => { node.removeEventListener("pointerdown", stop); node.removeEventListener("keydown", stop); };
  }, [ref]);

  useEffect(() => {
    if (!isTouring || !visible) return;
    const timer = window.setInterval(() => setSelected(current => {
      const list = tourHands[mode];
      return list[(list.indexOf(current) + 1) % list.length];
    }), 2800);
    return () => window.clearInterval(timer);
  }, [isTouring, visible, mode]);

  function chooseMode(next: RangeMode) {
    setMode(next);
    setSelected(next === "opening" ? "K7s" : "A5s");
  }

  function chooseDisplayMode(next: DisplayMode) {
    setDisplayMode(next);
    try { window.localStorage.setItem(displayModeKey, next); } catch {}
  }

  const explanation = mode === "opening" && selected === "K7s"
    ? c.preview.k7s
    : displayMode === "simple"
      ? c.preview.simpleOther(spot, selected, actionLabel(c, mode, action))
      : c.preview.other(spot, selected, action === "raise" && mode === "response" ? c.preview.actionPast.threeBet : c.preview.actionPast[action], values[action]);

  return <div className={`site-explorer is-${mode}`} ref={ref}>
    <div className="site-explorer-bar">
      <fieldset className="site-segment"><legend className="site-visually-hidden">{c.preview.spotLabel}</legend>
        <button type="button" aria-pressed={mode === "opening"} onClick={() => chooseMode("opening")}>{c.preview.open}</button>
        <button type="button" aria-pressed={mode === "response"} onClick={() => chooseMode("response")}>{c.preview.response}</button>
      </fieldset>
      <fieldset className="site-segment is-quiet"><legend className="site-visually-hidden">{c.preview.displayLabel}</legend>
        <button type="button" aria-pressed={displayMode === "simple"} onClick={() => chooseDisplayMode("simple")}>{c.preview.simpleMode}</button>
        <button type="button" aria-pressed={displayMode === "standard"} onClick={() => chooseDisplayMode("standard")}>{c.preview.standardMode}</button>
      </fieldset>
    </div>
    <div className="site-explorer-body">
      <div className="site-explorer-chart">
        <RangeMatrix mode={mode} displayMode={displayMode} selected={selected} onSelect={hand => { setTouring(false); setSelected(hand); }} />
        <div className="site-legend">{actions.filter(option => mode === "response" || option !== "call").map(option => <span key={option}><i className={`is-${option}`} />{actionLabel(c, mode, option)}</span>)}</div>
      </div>
      <div className="site-hand" aria-live="polite">
        <span className="site-hand-label">{c.preview.selectedHand}</span>
        <HandCards key={`${mode}-${selected}`} hand={selected} className="is-dealing" />
        <div className="site-hand-title"><strong>{selected}</strong><span>{selected.length === 2 ? c.preview.pair : selected.endsWith("s") ? c.preview.suited : c.preview.offsuit}</span></div>
        <div className={`site-hand-action is-${action}`}><i />{actionLabel(c, mode, action)}{displayMode === "standard" && <b>{values[action]}%</b>}</div>
        {displayMode === "standard" && <FrequencyBars mode={mode} values={values} />}
        <p className="site-hand-why"><span>{c.preview.why}</span>{explanation}</p>
        <a className="site-hand-link" href="/app">{c.preview.explore}<ArrowUpRight size={15} weight="bold" aria-hidden="true" /></a>
      </div>
    </div>
    <div className="site-explorer-foot">
      <span className={`site-tour${isTouring ? " is-on" : ""}`}>{isTouring && <i key={`${mode}-${selected}`} aria-hidden="true" />}{isTouring ? c.preview.touring : c.preview.manual}</span>
      <span>{c.preview.saved} · <b>{c.preview.notGto}</b></span>
    </div>
  </div>;
}

function Header() {
  const { copy: c, onLocaleChange } = useSite();
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    let last = window.scrollY;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const y = window.scrollY;
        setScrolled(y > 8);
        setHidden(y > 240 && y > last + 2);
        if (y < last - 2 || y <= 240) setHidden(false);
        last = y;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); cancelAnimationFrame(frame); };
  }, []);
  return <header className={`site-header${hidden && !open ? " is-hidden" : ""}${scrolled ? " is-scrolled" : ""}${open ? " is-open" : ""}`}>
    <div className="site-header-inner">
      <Brand />
      <nav className="site-nav" aria-label={c.common.menuLabel}>
        {c.nav.map(item => <a key={item.href} href={item.href} onClick={() => setOpen(false)}>{item.label}</a>)}
      </nav>
      <div className="site-header-actions">
        <button type="button" className="site-lang" onClick={onLocaleChange} aria-label={c.common.languageLabel}>{c.common.language}</button>
        <a className="site-button is-small" href="/app">{c.common.open}<ArrowRight size={15} weight="bold" aria-hidden="true" /></a>
        <button type="button" className="site-menu" onClick={() => setOpen(!open)} aria-label={open ? c.common.menuClose : c.common.menuOpen} aria-expanded={open}>{open ? <X size={22} /> : <List size={22} />}</button>
      </div>
    </div>
  </header>;
}

function Hero() {
  const { copy: c } = useSite();
  return <section className="site-hero" aria-labelledby="site-hero-title">
    <div className="site-wrap site-hero-inner">
      <div className="site-hero-copy">
        <h1 id="site-hero-title"><span className="site-line"><span>{c.hero.title1}</span></span><span className="site-line"><span><span className="site-hero-mark">{c.hero.title2}</span></span></span></h1>
        <p className="site-hero-lead">{c.hero.lead}</p>
        <div className="site-hero-actions">
          <a className="site-button" href="/app">{c.hero.primary}<ArrowRight size={17} weight="bold" aria-hidden="true" /></a>
          <a className="site-button is-ghost" href="#how">{c.hero.secondary}</a>
        </div>
        <p className="site-hero-note">{c.hero.note}</p>
      </div>
      <div className="site-hero-product"><Explorer /></div>
    </div>
  </section>;
}

/** Eases from `from` to `to` once `run` turns true; jumps straight to `to` without motion. */
function useAnimatedNumber(to: number, from: number, run: boolean, duration = 1500) {
  const { motion } = useSite();
  const [shown, setShown] = useState(motion ? from : to);
  useEffect(() => {
    if (!motion) { setShown(to); return; }
    if (!run) return;
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      setShown(from + (to - from) * (1 - (1 - progress) ** 4));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [run, motion, to, from, duration]);
  return shown;
}

function CountUp({ value, decimals = 0, suffix = "" }: { value: number; decimals?: number; suffix?: string }) {
  const [ref, inView] = useInView<HTMLSpanElement>("-10% 0px");
  const shown = useAnimatedNumber(value, 0, inView);
  return <span ref={ref}>{shown.toFixed(decimals)}{suffix}</span>;
}

function Facts() {
  const { copy: c } = useSite();
  const opened = actionShare("opening", "raise");
  const defended = actionShare("response", "raise") + actionShare("response", "call");
  const numbers: [number, number, string][] = [[169, 0, ""], [opened, 1, "%"], [defended, 1, "%"], [100, 0, ""]];
  return <section className="site-facts" aria-label={c.facts.source}>
    <div className="site-wrap">
      <dl className="site-facts-grid">{numbers.map(([value, decimals, suffix], index) => <div key={c.facts.items[index]} data-reveal style={{ "--delay": `${index * 90}ms` } as CSSProperties}><dt>{c.facts.items[index]}</dt><dd><CountUp value={value} decimals={decimals} suffix={suffix} /></dd></div>)}</dl>
      <p className="site-facts-source">{c.facts.source}</p>
    </div>
  </section>;
}

const seats = ["UTG", "HJ", "CO", "BTN", "SB", "BB"];

function TableScene() {
  const { copy: c } = useSite();
  return <div className="site-scene site-table-scene" aria-hidden="true">
    <div className="site-table">
      <div className="site-table-felt"><span className="site-table-pot">{c.how.pot}</span><span className="site-chip" /></div>
      {seats.map((seat, index) => <div className={`site-seat is-${seat.toLowerCase()}`} key={seat} style={{ "--i": index } as CSSProperties}>
        <span className="site-seat-name">{seat}</span>
        <span className={`site-seat-act${seat === "BTN" ? " is-raise" : seat === "BB" ? " is-turn" : ""}`}>{seat === "BTN" ? c.how.openSize : seat === "BB" ? c.how.toAct : c.common.fold}</span>
      </div>)}
    </div>
  </div>;
}

function ReadScene() {
  const { copy: c } = useSite();
  return <div className="site-scene site-read-scene" aria-hidden="true">
    <div className="site-mini-matrix">{cells.map(({ hand, wave }) => <span key={hand} className={`is-${dominantAction(frequencies("response", hand))}`} style={{ "--wave": wave } as CSSProperties} />)}</div>
    <div className="site-mini-legend">{actions.map(action => <span key={action}><i className={`is-${action}`} />{actionLabel(c, "response", action)} <b>{actionShare("response", action).toFixed(1)}%</b> <small>{c.how.combos}</small></span>)}</div>
  </div>;
}

function WhyScene() {
  const { copy: c } = useSite();
  const values = frequencies("response", "A5s");
  return <div className="site-scene site-why-scene" aria-hidden="true">
    <HandCards hand="A5s" seed={1} className="is-large" />
    <div className="site-why-card">
      <span>{c.how.whyHand}</span>
      {actions.filter(action => values[action] > 0).map((action, index) => <div className={`site-why-row is-${action}`} key={action} style={{ "--value": `${values[action]}%`, "--i": index } as CSSProperties}><span>{actionLabel(c, "response", action)}</span><i /><b>{values[action]}%</b></div>)}
      <p>{c.how.whyNote}</p>
    </div>
  </div>;
}

function HowItWorks() {
  const { copy: c } = useSite();
  const [active, setActive] = useState(0);
  const steps = useRef<(HTMLElement | null)[]>([]);
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) setActive(Number((entry.target as HTMLElement).dataset.step));
    }, { rootMargin: "-48% 0px -48% 0px" });
    for (const node of steps.current) if (node) observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const scenes = [<TableScene key="table" />, <ReadScene key="read" />, <WhyScene key="why" />];
  const sceneNames = ["table", "read", "why"];
  return <section className="site-section site-how" id="how" aria-labelledby="site-how-title">
    <div className="site-wrap">
      <h2 id="site-how-title" data-reveal>{c.how.title1}<br /><span>{c.how.title2}</span></h2>
      <div className="site-how-grid">
        <div className="site-how-stage">
          {scenes.map((scene, index) => <div className={`site-how-layer${active === index ? " is-active" : ""}`} key={sceneNames[index]}>{scene}</div>)}
          <div className="site-how-progress" aria-hidden="true">{c.how.steps.map((step, index) => <span key={step.title} className={index <= active ? "is-on" : ""} />)}</div>
        </div>
        <ol className="site-how-steps">
          {c.how.steps.map((step, index) => <li key={step.title} data-step={index} ref={node => { steps.current[index] = node; }} className={active === index ? "is-active" : ""}>
            <span className="site-how-num">0{index + 1}</span>
            <h3>{step.title}</h3>
            <p>{step.body}</p>
            <div className="site-how-inline">{scenes[index]}</div>
          </li>)}
        </ol>
      </div>
    </div>
  </section>;
}

const drillPool = cells.map(cell => cell.hand);
const playable = drillPool.filter(hand => frequencies("opening", hand).raise > 0);
const unplayable = drillPool.filter(hand => frequencies("opening", hand).raise === 0);

function nextDrillHand(previous: string) {
  const pool = Math.random() < .62 ? playable : unplayable;
  let hand = previous;
  while (hand === previous) hand = pool[Math.floor(Math.random() * pool.length)];
  return hand;
}

// Seats clockwise from the hero on the button, matching the app trainer's layout (x%, y% of the felt).
const drillSeats = [
  { position: "BTN", x: 50, y: 100, stack: 100, bet: 0, state: "hero" },
  { position: "SB", x: 5, y: 76, stack: 99.5, bet: .5, state: "blind" },
  { position: "BB", x: 13, y: 12, stack: 99, bet: 1, state: "blind" },
  { position: "UTG", x: 50, y: -2, stack: 100, bet: 0, state: "fold" },
  { position: "HJ", x: 87, y: 12, stack: 100, bet: 0, state: "fold" },
  { position: "CO", x: 95, y: 76, stack: 100, bet: 0, state: "fold" },
];
const stripSeats = ["UTG", "HJ", "CO", "BTN"];
type DrillChoice = "fold" | "raise";

function Drill() {
  const { copy: c } = useSite();
  const [round, setRound] = useState(0);
  const [hand, setHand] = useState("J9o");
  const [answer, setAnswer] = useState<DrillChoice | null>(null);
  const [score, setScore] = useState({ matched: 0, played: 0 });
  const [ref, inView] = useInView<HTMLElement>("-20% 0px", false);
  const values = frequencies("opening", hand);
  const chosen = answer ? values[answer] : 0;
  const verdict = !answer ? null : chosen === 100 ? "match" : chosen === 0 ? "differ" : "mixed";
  const choices: DrillChoice[] = ["fold", "raise"];

  function choose(next: DrillChoice) {
    if (answer) return;
    setAnswer(next);
    setScore(current => ({ matched: current.matched + (values[next] === 100 ? 1 : 0), played: current.played + 1 }));
  }

  function deal() {
    setHand(current => nextDrillHand(current));
    setAnswer(null);
    setRound(current => current + 1);
  }

  const handlers = useRef({ choose, deal, answer });
  handlers.current = { choose, deal, answer };
  useEffect(() => {
    if (!inView) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || (event.target as HTMLElement).closest("input, textarea, select, button, a, summary")) return;
      if (event.key === "1") handlers.current.choose("fold");
      else if (event.key === "2") handlers.current.choose("raise");
      else if (event.key === "Enter" && handlers.current.answer) handlers.current.deal();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [inView]);

  return <section className="site-section site-drill" id="drill" ref={ref} aria-labelledby="site-drill-title">
    <div className="site-wrap site-drill-inner">
      <div className="site-drill-copy" data-reveal>
        <h2 id="site-drill-title">{c.drill.title1}<br /><span>{c.drill.title2}</span></h2>
        <p>{c.drill.description}</p>
        <p className="site-drill-note">{c.drill.note}</p>
      </div>
      <div className={`site-trainer${answer ? " is-answered" : ""}`} data-reveal>
        <div className="site-trainer-head">
          <ol className="site-trainer-strip">{stripSeats.map(seat => <li key={seat} className={seat === "BTN" ? "is-hero" : ""}><span>{seat}</span><small>100</small><b>{seat === "BTN" ? answer ? c.drill[answer] : "?" : c.drill.tableFold}</b></li>)}</ol>
          <span className="site-trainer-score" aria-live="polite">{score.played > 0 && c.drill.score(score.matched, score.played)}</span>
        </div>
        <div className="site-trainer-stage">
          <figure className="site-poker-table"><figcaption className="site-visually-hidden">{c.drill.tableLabel(hand)}</figcaption>
            <div className="site-poker-felt">
              <div className="site-poker-center" aria-live="polite">
                {verdict
                  ? <div className={`site-poker-verdict is-${verdict}`} key={round}><strong>{verdict === "match" ? <Check size={16} weight="bold" aria-hidden="true" /> : verdict === "differ" ? <X size={16} weight="bold" aria-hidden="true" /> : <span className="site-poker-split" aria-hidden="true" />}{c.drill[verdict]}</strong><small>{c.drill.frequency(chosen)}</small></div>
                  : <><span className="site-poker-spot">{c.drill.question}</span><strong className="site-poker-pot">1.5<small>bb</small></strong><span className="site-poker-stakes">{c.drill.stakes}</span></>}
              </div>
            </div>
            {drillSeats.filter(seat => seat.bet > 0).map(seat => <span key={`chip-${seat.position}`} className="site-poker-chip" style={{ "--x": seat.x, "--y": seat.y } as CSSProperties}><i />{seat.bet}<small>bb</small></span>)}
            {drillSeats.map(seat => <div key={seat.position} className={`site-poker-seat is-${seat.state}`} style={{ left: `${seat.x}%`, top: `${seat.y}%` }}>
              <span className="site-poker-disc"><b>{seat.position}</b><small>{seat.state === "fold" ? c.drill.tableFold : seat.stack}</small></span>
              {seat.state === "hero" && <><span className="site-poker-dealer" aria-hidden="true">D</span><HandCards key={round} hand={hand} seed={round} className="site-poker-hole is-dealt" /></>}
            </div>)}
          </figure>
        </div>
        <div className="site-trainer-actions">
          {choices.map((choice, index) => <button type="button" key={choice} className={`site-trainer-action is-${choice}${answer === choice ? ` is-chosen is-${verdict}` : ""}`} style={{ "--site-freq": values[choice] / 100 } as CSSProperties} onClick={() => choose(choice)} disabled={answer !== null} aria-pressed={answer === choice}>
            <kbd>{index + 1}</kbd><span>{c.drill[choice]}</span>{answer && <b>{values[choice]}%</b>}
          </button>)}
          <button type="button" className={`site-trainer-next${answer ? " is-ready" : ""}`} onClick={deal} disabled={!answer}>{c.drill.next}<ArrowRight size={14} weight="bold" aria-hidden="true" /><kbd>Enter</kbd></button>
        </div>
      </div>
    </div>
  </section>;
}

function SectionHead({ id, title1, title2, children }: { id: string; title1: string; title2: string; children?: ReactNode }) {
  return <div className={`site-section-head${children ? "" : " is-solo"}`} data-reveal><h2 id={id}>{title1}<br /><span>{title2}</span></h2>{children}</div>;
}

function Audience() {
  const { copy: c } = useSite();
  return <section className="site-section site-audience" aria-labelledby="site-audience-title">
    <div className="site-wrap">
      <SectionHead id="site-audience-title" title1={c.audience.title1} title2={c.audience.title2} />
      <div className="site-personas">{c.audience.items.map((item, index) => <article className="site-persona" key={item.level} data-reveal style={{ "--delay": `${index * 110}ms` } as CSSProperties}>
        <span className="site-persona-level"><i>{index + 1}</i>{item.level}</span>
        <p className="site-persona-quote">{item.quote}</p>
        <p className="site-persona-body">{item.body}</p>
        <span className="site-persona-gets">{item.gets}</span>
      </article>)}</div>
      <p className="site-audience-note" data-reveal>{c.audience.note}</p>
    </div>
  </section>;
}

const tierMins = [0, 950, 1100, 1250, 1400, 1550];

function Ranked() {
  const { copy: c } = useSite();
  const [ref, inView] = useInView<HTMLDivElement>("-15% 0px");
  const rating = Math.round(useAnimatedNumber(1186, 1032, inView, 2200));
  const tier = tierMins.filter(min => rating >= min).length - 1;
  const next = tierMins[tier + 1];
  const progress = next ? (rating - tierMins[tier]) / (next - tierMins[tier]) : 1;
  return <section className="site-section site-ranked" id="ranked" aria-labelledby="site-ranked-title">
    <div className="site-wrap site-feature">
      <div className="site-feature-copy" data-reveal>
        <span className="site-status">{c.ranked.status}</span>
        <h2 id="site-ranked-title">{c.ranked.title1}<br /><span>{c.ranked.title2}</span></h2>
        <p>{c.ranked.description}</p>
        <ul className="site-points">{c.ranked.points.map(point => <li key={point}><Check size={16} weight="bold" aria-hidden="true" />{point}</li>)}</ul>
      </div>
      <div className="site-mock site-rank" ref={ref} data-reveal aria-hidden="true">
        <span className="site-sample">{c.ranked.sample}</span>
        <div className="site-rank-card">
          <div className="site-rank-top">
            <Trophy size={30} weight="fill" />
            <dl>
              <div><dt>{c.ranked.rank}</dt><dd key={tier} className="site-rank-tier">{c.ranked.tiers[tier]}</dd></div>
              <div><dt>{c.ranked.rating}</dt><dd>{rating}</dd></div>
              <div><dt>{c.ranked.peak}</dt><dd>1204</dd></div>
            </dl>
          </div>
          <span className="site-rank-bar"><span style={{ width: `${progress * 100}%` }} /></span>
          <small>{next ? c.ranked.toNext(next - rating, c.ranked.tiers[tier + 1]) : ""}</small>
        </div>
        <ol className="site-tiers">{c.ranked.tiers.map((name, index) => <li key={name} className={index < tier ? "is-passed" : index === tier ? "is-current" : ""}><i />{name}<small>{tierMins[index]}</small></li>)}</ol>
        <div className="site-rank-row">
          <div className="site-rank-match"><span>{c.ranked.lastMatch}</span><b>+18</b><small>{c.ranked.matchLine(16, 20)}</small></div>
          <div className="site-rank-today"><span className="site-rank-dots"><i className="is-used" /><i /><i /></span>{c.ranked.today}</div>
        </div>
      </div>
    </div>
  </section>;
}

const tendencies = [9, -6, 4, -5];

function Analysis() {
  const { copy: c } = useSite();
  const [ref, inView] = useInView<HTMLDivElement>("-15% 0px");
  const score = useAnimatedNumber(78, 0, inView);
  const accuracy = useAnimatedNumber(82, 0, inView);
  return <section className="site-section site-analysis" id="analysis" aria-labelledby="site-analysis-title">
    <div className="site-wrap site-feature is-reversed">
      <div className="site-feature-copy" data-reveal>
        <h2 id="site-analysis-title">{c.analysis.title1}<br /><span>{c.analysis.title2}</span></h2>
        <p>{c.analysis.description}</p>
        <dl className="site-point-grid">{c.analysis.points.map(point => <div key={point.title}><dt>{point.title}</dt><dd>{point.body}</dd></div>)}</dl>
        <p className="site-feature-note">{c.analysis.note}</p>
      </div>
      <div className={`site-mock site-dash${inView ? " is-live" : ""}`} ref={ref} data-reveal aria-hidden="true">
        <span className="site-sample">{c.analysis.sample}</span>
        <div className="site-dash-kpis">
          <div className="is-accent"><span>{c.analysis.score}</span><strong>{Math.round(score)}<small>%</small></strong><svg viewBox="0 0 120 28" preserveAspectRatio="none" aria-hidden="true"><title>{c.analysis.score}</title><path d="M0 22 L15 20 L30 23 L45 16 L60 17 L75 11 L90 13 L105 7 L120 5" /></svg><small>{c.analysis.recent}</small></div>
          <div><span>{c.analysis.accuracy}</span><strong>{Math.round(accuracy)}<small>%</small></strong><small>124 {c.analysis.answers}</small></div>
          <div><span>{c.analysis.style}</span><strong>{c.analysis.styleValue}</strong><small>{c.analysis.map}</small></div>
        </div>
        <div className="site-dash-body">
          <div className="site-dash-map">
            <span>{c.analysis.map}</span>
            <div className="site-style-map">
              {c.analysis.quadrants.map(name => <b key={name}>{name}</b>)}
              <i className="site-style-marker" />
            </div>
            <div className="site-style-axis"><small>← {c.analysis.tight}</small><small>{c.analysis.loose} →</small></div>
          </div>
          <div className="site-dash-tend">
            <span>{c.analysis.tendencies}</span>
            {c.analysis.actions.map((action, index) => {
              const delta = tendencies[index];
              return <div className="site-tend-row" key={action} style={{ "--size": `${Math.abs(delta) / 15 * 50}%`, "--i": index } as CSSProperties}>
                <em>{action}</em>
                <span className={`site-tend-bar ${delta > 0 ? "is-more" : "is-less"}`}><i /></span>
                <b>{delta > 0 ? "+" : "−"}{Math.abs(delta)}pt</b>
              </div>;
            })}
            <div className="site-dash-notes"><div><span>{c.analysis.weak}</span><b>{c.analysis.weakValue}</b></div><div><span>{c.analysis.next}</span><b>{c.analysis.nextValue}</b></div></div>
          </div>
        </div>
      </div>
    </div>
  </section>;
}

function Compare() {
  const { copy: c } = useSite();
  return <section className="site-section site-compare" id="compare" aria-labelledby="site-compare-title">
    <div className="site-wrap">
      <SectionHead id="site-compare-title" title1={c.compare.title1} title2={c.compare.title2}><p>{c.compare.description}</p></SectionHead>
      <div className="site-compare-table" data-reveal>
        <table>
          <thead><tr><td /><th scope="col" className="is-us"><Spade size={18} weight="fill" aria-hidden="true" />{c.compare.us}</th><th scope="col">{c.compare.them}<small>{c.compare.themNote}</small></th></tr></thead>
          <tbody>{c.compare.rows.map((row, index) => <tr key={row.label} style={{ "--i": index } as CSSProperties}>
            <th scope="row">{row.label}</th>
            <td className="is-us" data-label={c.compare.us}>{row.us}</td>
            <td data-label={c.compare.them}>{row.them}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <p className="site-compare-note">{c.compare.note}</p>
    </div>
  </section>;
}

function Pricing() {
  const { copy: c } = useSite();
  return <section className="site-section site-pricing" id="pricing" aria-labelledby="site-pricing-title">
    <div className="site-wrap">
      <div className="site-pricing-head" data-reveal><h2 id="site-pricing-title">{c.pricing.title1}<br /><span>{c.pricing.title2}</span></h2><p>{c.pricing.description}</p></div>
      <div className="site-plans">{c.pricing.plans.map((plan, index) => <article className={`site-plan${plan.href ? "" : " is-planned"}`} key={plan.name} data-reveal style={{ "--delay": `${index * 120}ms` } as CSSProperties}>
        <div className="site-plan-top"><h3>{plan.name}</h3><span>{plan.status}</span></div>
        <p className="site-plan-price"><strong>{plan.price}</strong><small>{plan.cadence}</small></p>
        <p>{plan.description}</p>
        <ul>{plan.features.map(feature => <li key={feature}><Check size={16} weight="bold" aria-hidden="true" />{feature}</li>)}</ul>
        {plan.href ? <a className="site-button" href={plan.href}>{plan.action}<ArrowRight size={16} weight="bold" aria-hidden="true" /></a> : <span className="site-button is-disabled" aria-disabled="true">{plan.action}</span>}
      </article>)}</div>
      <p className="site-pricing-note">{c.pricing.note}</p>
    </div>
  </section>;
}

function Faq() {
  const { copy: c } = useSite();
  return <section className="site-section site-faq" id="faq" aria-labelledby="site-faq-title">
    <div className="site-wrap site-faq-inner">
      <h2 id="site-faq-title" data-reveal>{c.faq.title}</h2>
      <div className="site-faq-list" data-reveal>{c.faq.items.map(item => <details key={item.question} name="site-faq"><summary>{item.question}<span aria-hidden="true" /></summary><p>{item.answer}</p></details>)}</div>
    </div>
  </section>;
}

const fan: [string, Suit][] = [["A", "s"], ["K", "h"], ["Q", "c"], ["J", "d"], ["T", "s"]];

function FinalCta() {
  const { copy: c } = useSite();
  return <section className="site-final" aria-labelledby="site-final-title">
    <div className="site-wrap site-final-inner">
      <div className="site-fan" data-reveal aria-hidden="true">{fan.map(([rank, suit], index) => <PlayingCard key={rank} rank={rank} suit={suit} index={index - 2} />)}</div>
      <h2 id="site-final-title" data-reveal>{c.final.title1}<br /><span>{c.final.title2}</span></h2>
      <p data-reveal>{c.final.description}</p>
      <a className="site-button is-large" href="/app" data-reveal>{c.final.action}<ArrowRight size={18} weight="bold" aria-hidden="true" /></a>
      <small>{c.final.note}</small>
    </div>
  </section>;
}

function Footer() {
  const { copy: c } = useSite();
  return <footer className="site-footer">
    <div className="site-wrap">
      <div className="site-footer-top">
        <div><Brand /><p>{c.footer.tagline}</p></div>
        <div className="site-footer-links">
          <div><span>{c.footer.product}</span><a href="/app">{c.footer.open}</a><a href="#how">{c.footer.how}</a><a href="#drill">{c.footer.drill}</a><a href="#analysis">{c.footer.analysis}</a></div>
          <div><span>EvionAI</span><a href="#compare">{c.footer.compare}</a><a href="#pricing">{c.footer.pricing}</a><a href="#faq">{c.footer.faq}</a></div>
          <div><span>{c.footer.legal}</span><span className="is-muted">{c.footer.privacy}</span><span className="is-muted">{c.footer.terms}</span></div>
        </div>
      </div>
      <p className="site-disclaimer">{c.footer.disclaimer}</p>
      <p className="site-copyright">© {new Date().getFullYear()} EvionAI</p>
    </div>
  </footer>;
}

function Reveal({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const { motion } = useSite();
  useEffect(() => {
    if (!motion || !root.current) return;
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) {
        (entry.target as HTMLElement).dataset.shown = "";
        observer.unobserve(entry.target);
      }
    }, { rootMargin: "0px 0px -12% 0px" });
    for (const node of root.current.querySelectorAll("[data-reveal]:not([data-shown])")) observer.observe(node);
    return () => observer.disconnect();
  }, [motion]);
  return <div ref={root}>{children}</div>;
}

export function ServiceSite({ locale, onLocaleChange }: { locale: SiteLocale; onLocaleChange: () => void }) {
  const copy = locale === "ja" ? ja : en;
  const [motion] = useState(() => typeof IntersectionObserver !== "undefined" && !prefersReducedMotion());
  return <SiteContext.Provider value={{ locale, copy, onLocaleChange, motion }}>
    <div className={`site site-${locale}${motion ? " has-motion" : ""}`}>
      <a className="site-skip" href="#site-main">{copy.common.skip}</a>
      <Header />
      <Reveal>
        <main id="site-main"><Hero /><Facts /><Audience /><HowItWorks /><Drill /><Ranked /><Analysis /><Compare /><Pricing /><Faq /><FinalCta /></main>
        <Footer />
      </Reveal>
    </div>
  </SiteContext.Provider>;
}

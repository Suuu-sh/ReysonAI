import { createContext, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowRight, ArrowUpRight, Check, List, Spade, X } from "@phosphor-icons/react";
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

function PlayingCard({ rank, suit, index = 0, className = "" }: { rank: string; suit: Suit; index?: number; className?: string }) {
  const label = rank === "T" ? "10" : rank;
  return <span className={`site-card${suit === "h" || suit === "d" ? " is-red" : ""}${className ? ` ${className}` : ""}`} style={{ "--i": index } as CSSProperties} aria-hidden="true">
    <span className="site-card-corner"><b>{label}</b><i>{suitGlyph[suit]}</i></span>
    <span className="site-card-pip">{suitGlyph[suit]}</span>
    <span className="site-card-corner is-bottom"><b>{label}</b><i>{suitGlyph[suit]}</i></span>
  </span>;
}

function HandCards({ hand, seed = 0, className = "" }: { hand: string; seed?: number; className?: string }) {
  return <span className={`site-hand-cards${className ? ` ${className}` : ""}`}>{handCards(hand, seed).map(([rank, suit], index) => <PlayingCard key={`${rank}${suit}`} rank={rank} suit={suit} index={index} />)}</span>;
}

function FrequencyBars({ mode, values }: { mode: RangeMode; values: Record<Action, number> }) {
  const { copy } = useSite();
  const shown = actions.filter(action => values[action] > 0);
  return <fieldset className="site-freq"><legend className="site-visually-hidden">{copy.preview.frequencyLabel}</legend>
    <span className="site-freq-track" aria-hidden="true">{shown.map(action => <span key={action} className={`is-${action}`} style={{ width: `${values[action]}%` }} />)}</span>
    <span className="site-freq-values">{shown.map(action => <span key={action}><i className={`is-${action}`} />{actionLabel(copy, mode, action)} <b>{values[action]}%</b></span>)}</span>
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

function CountUp({ value, decimals = 0, suffix = "" }: { value: number; decimals?: number; suffix?: string }) {
  const { motion } = useSite();
  const [ref, inView] = useInView<HTMLSpanElement>("-10% 0px");
  const [shown, setShown] = useState(motion ? 0 : value);
  useEffect(() => {
    if (!motion) { setShown(value); return; }
    if (!inView) return;
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / 1500);
      setShown(value * (1 - (1 - progress) ** 4));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [inView, motion, value]);
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

function Drill() {
  const { copy: c } = useSite();
  const [round, setRound] = useState(0);
  const [hand, setHand] = useState("J9o");
  const [answer, setAnswer] = useState<"raise" | "fold" | null>(null);
  const [score, setScore] = useState({ matched: 0, played: 0 });
  const [ref, inView] = useInView<HTMLElement>("-20% 0px", false);
  const values = frequencies("opening", hand);
  const chosen = answer ? values[answer] : 0;
  const verdict = !answer ? null : chosen === 100 ? "match" : chosen === 0 ? "differ" : "mixed";

  function choose(next: "raise" | "fold") {
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
      if (event.metaKey || event.ctrlKey || event.altKey || (event.target as HTMLElement).closest("input, textarea, select")) return;
      const key = event.key.toLowerCase();
      if (key === "r") handlers.current.choose("raise");
      else if (key === "f") handlers.current.choose("fold");
      else if (key === "n" && handlers.current.answer) handlers.current.deal();
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
      <div className="site-drill-table" data-reveal>
        <div className="site-drill-head"><span>{c.drill.situation}</span><span className="site-drill-score" aria-live="polite">{score.played > 0 && c.drill.score(score.matched, score.played)}</span></div>
        <div className="site-drill-deal">
          <span className="site-drill-deck" aria-hidden="true"><span /><span /><span /></span>
          <HandCards key={round} hand={hand} seed={round} className="is-large is-dealt" />
          <strong className="site-drill-hand">{hand}</strong>
        </div>
        <p className="site-drill-question">{c.drill.question}</p>
        <div className="site-drill-actions">
          <button type="button" className={`is-raise${answer === "raise" ? " is-chosen" : ""}`} onClick={() => choose("raise")} disabled={answer !== null && answer !== "raise"} aria-pressed={answer === "raise"}>{c.drill.raise}<kbd>R</kbd></button>
          <button type="button" className={`is-fold${answer === "fold" ? " is-chosen" : ""}`} onClick={() => choose("fold")} disabled={answer !== null && answer !== "fold"} aria-pressed={answer === "fold"}>{c.drill.fold}<kbd>F</kbd></button>
        </div>
        <div className={`site-drill-result${verdict ? ` is-${verdict}` : ""}`} aria-live="polite">
          {verdict && <>
            <p className="site-drill-verdict">{verdict === "match" ? <Check size={18} weight="bold" aria-hidden="true" /> : verdict === "differ" ? <X size={18} weight="bold" aria-hidden="true" /> : <span className="site-drill-split" aria-hidden="true" />}{verdict === "match" ? c.drill.match : verdict === "differ" ? c.drill.differ : c.drill.mixed(values.raise)}</p>
            <div className="site-drill-estimate"><span>{c.drill.estimate}</span><FrequencyBars mode="opening" values={values} /></div>
            <button type="button" className="site-button is-small" onClick={deal}>{c.drill.next}<kbd>N</kbd></button>
          </>}
        </div>
        <p className="site-drill-keys">{c.drill.keys}</p>
      </div>
    </div>
  </section>;
}

function Approach() {
  const { copy: c } = useSite();
  return <section className="site-section site-approach" id="approach" aria-labelledby="site-approach-title">
    <div className="site-wrap">
      <div className="site-approach-head" data-reveal>
        <h2 id="site-approach-title">{c.approach.title1}<br /><span>{c.approach.title2}</span></h2>
        <p>{c.approach.description}</p>
      </div>
      <div className="site-ledger">
        <div data-reveal><h3>{c.approach.isTitle}</h3><ul>{c.approach.is.map(item => <li key={item}><Check size={17} weight="bold" aria-hidden="true" />{item}</li>)}</ul></div>
        <div data-reveal style={{ "--delay": "120ms" } as CSSProperties}><h3>{c.approach.isntTitle}</h3><ul>{c.approach.isnt.map(item => <li key={item}><X size={17} weight="bold" aria-hidden="true" />{item}</li>)}</ul></div>
      </div>
      <div className="site-process" data-reveal>
        <h3>{c.approach.processTitle}</h3>
        <ol>{c.approach.process.map((stage, index) => <li key={stage.title} className={index === c.approach.process.length - 1 ? "is-planned" : ""} style={{ "--i": index } as CSSProperties}><span>{index + 1}</span><strong>{stage.title}</strong><small>{stage.detail}</small></li>)}</ol>
      </div>
    </div>
  </section>;
}

function Roadmap() {
  const { copy: c } = useSite();
  const column = (title: string, items: typeof c.roadmap.now, planned: boolean) => <div className={`site-road${planned ? " is-planned" : ""}`} data-reveal>
    <h3><span>{planned ? c.common.planned : c.common.available}</span>{title}</h3>
    <ul>{items.map((item, index) => <li key={item.title} style={{ "--i": index } as CSSProperties}><strong>{item.title}{item.tag && <em>{item.tag}</em>}</strong><p>{item.detail}</p></li>)}</ul>
  </div>;
  return <section className="site-section site-roadmap" aria-labelledby="site-roadmap-title">
    <div className="site-wrap">
      <h2 id="site-roadmap-title" data-reveal>{c.roadmap.title1}<br /><span>{c.roadmap.title2}</span></h2>
      <div className="site-road-grid">{column(c.roadmap.nowTitle, c.roadmap.now, false)}{column(c.roadmap.nextTitle, c.roadmap.next, true)}</div>
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
          <div><span>{c.footer.product}</span><a href="/app">{c.footer.open}</a><a href="#how">{c.footer.how}</a><a href="#drill">{c.footer.drill}</a></div>
          <div><span>EvionAI</span><a href="#pricing">{c.footer.pricing}</a><a href="#faq">{c.footer.faq}</a></div>
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
        <main id="site-main"><Hero /><Facts /><HowItWorks /><Drill /><Approach /><Roadmap /><Pricing /><Faq /><FinalCta /></main>
        <Footer />
      </Reveal>
    </div>
  </SiteContext.Provider>;
}

import { PlayingCard, type CardSuit as Suit } from "../components/PlayingCard.tsx";
import { createContext, useContext, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { BrandIcon } from "../components/BrandIcon.tsx";
import { ArrowRight, ArrowUpRight, Check, List, Pause, Play, X } from "@phosphor-icons/react";
import { TierEmblem, tierColor } from "../trainer/RankEmblem.tsx";
import agentTableImage from "./assets/agent-table.webp";
import previewRanges from "./range-preview.json";
import postflopRanges from "./postflop-preview.json";
import { pickNextRangeIndex } from "./range-tour.ts";
import { color as actionColor } from "../components/action-format.ts";
import { en, type SiteCopy, type SiteLocale } from "./content";
import { SITE_COPY } from "./locales";
import { LOCALES } from "../locale-metadata.ts";
import { appEntryHref } from "../route.ts";
import { TIERS, LEGEND_TOP_N } from "../../../shared/ranked-rules.ts";

const SiteContext = createContext<{ locale: SiteLocale; copy: SiteCopy; onLocaleChange: (locale: SiteLocale) => void; motion: boolean; appHref: string }>({ locale: "en", copy: en, onLocaleChange: () => {}, motion: false, appHref: "/analyze/ranges" });
const useSite = () => useContext(SiteContext);

type Action = "raise" | "call" | "fold";
type RangeMode = "opening" | "response";
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
  return <a className="site-brand" href="/" aria-label={copy.common.home}><BrandIcon size={24} /><span>Reyson<b>AI</b></span></a>;
}

function HandCards({ hand, seed = 0, className = "" }: { hand: string; seed?: number; className?: string }) {
  return <span className={`site-hand-cards${className ? ` ${className}` : ""}`}>{handCards(hand, seed).map(([rank, suit], index) => <PlayingCard key={`${rank}${suit}`} card={`${rank}${suit}`} variant="site" aria-hidden="true" index={index} />)}</span>;
}

function ActionRows({ mode, values }: { mode: RangeMode; values: Record<Action, number> }) {
  const { copy } = useSite();
  const rows = actions.filter(action => mode === "response" || action !== "call");
  return <ul className="site-hand-actions" aria-label={copy.preview.frequencyLabel}>
    {rows.map(action => <li key={action} className={`site-hand-action is-${action}${values[action] > 0 ? "" : " is-dim"}`}><i />{actionLabel(copy, mode, action)}<b>{values[action]}%</b></li>)}
    {/* Keep the panel the same height as the three-action BB spot. */}
    {rows.length < actions.length && <li className="site-hand-action is-spacer" aria-hidden="true"><i />&nbsp;</li>}
  </ul>;
}

const heroActions = ["all_in", "raise", "call", "limp", "fold"] as const;
type HeroRange = { id: string; stage: string; hands: Record<string, Record<string, number>>; unreachable: string[]; actions: readonly string[]; board?: string; seat?: string; history?: string[] };
const heroRanges: HeroRange[] = [...previewRanges.tour.map(range => ({ ...range, actions: heroActions })), ...postflopRanges.ranges];
const stripAggression = ["all_in", "allin", "raise", "bet125", "bet75", "bet33", "limp", "call", "check", "fold"];

const initialRangeIndex = heroRanges.findIndex(range => range.id === "BTN_open");

function heroActionLabels(copy: SiteCopy, range: HeroRange): Record<string, string> {
  const raise = range.stage === "response" ? copy.common.threeBet : range.stage === "threeBet" ? "4bet" : copy.common.raise;
  return { check: copy.preview.check, bet33: `${copy.preview.bet} 33%`, bet75: `${copy.preview.bet} 75%`, bet125: `${copy.preview.bet} 125%`, raise, all_in: "allin", call: copy.common.call, limp: `${copy.common.call} 1BB`, fold: copy.common.fold };
}

function rangeAccessibleContext(copy: SiteCopy, range: HeroRange) {
  if (!range.board) return range.id;
  const labels = heroActionLabels(copy, range);
  const history = [copy.preview.check, ...(range.history ?? []).map(action => labels[action] ?? action)].join(" → ");
  return `${copy.preview.flop} ${range.board}; BTN / BB; ${range.seat}; ${history}`;
}

export function RangeMatrix({ range, selected, onSelect }: { range: HeroRange; selected: string; onSelect: (hand: string) => void }) {
  const { copy } = useSite();
  const postflop = range.stage === "postflop";
  const actionLabels = heroActionLabels(copy, range);
  return <section className="site-matrix-scroll" aria-label={`${rangeAccessibleContext(copy, range)} ${copy.preview.scrollLabel}`}>
    <fieldset className="site-matrix"><legend className="site-visually-hidden">{copy.preview.matrixLabel}</legend>
      {cells.map(({ hand, wave }) => {
        const saved = range.hands[hand];
        const values = Object.fromEntries(Object.entries(saved).map(([action, frequency]) => [action, frequency * (postflop ? 100 : 1)]));
        const unreachable = range.unreachable.includes(hand);
        const action = range.actions.reduce((best, candidate) => values[candidate] > values[best] ? candidate : best, postflop ? range.actions[0] : "fold");
        const mixed = range.actions.filter(option => values[option] > 0).sort((a, b) => stripAggression.indexOf(a) - stripAggression.indexOf(b));
        const breakdown = unreachable ? copy.preview.unreachable : mixed.map(option => `${actionLabels[option]} ${values[option]}%`).join(" / ");
        return <button type="button" key={hand} className={`site-cell ${unreachable ? "is-unreachable" : `is-${action}${postflop ? " is-postflop" : ""}`}${selected === hand ? " is-selected" : ""}`}
          style={{ "--wave": wave, "--hero-action-color": actionColor(action) } as CSSProperties}
          aria-label={`${hand}: ${breakdown}`} aria-pressed={selected === hand} title={`${range.id} · ${hand} · ${breakdown}`} onClick={() => onSelect(hand)}>
          {hand}{!unreachable && mixed.length > 1 && <span className="site-cell-mix" aria-hidden="true">{mixed.map(option => <span key={option} className={`is-${option}`} style={{ width: `${values[option]}%`, ...(postflop || option === "all_in" ? { background: actionColor(option) } : {}) }} />)}</span>}
        </button>;
      })}
    </fieldset>
  </section>;
}

export function HeroActionLegend({ range }: { range: HeroRange }) {
  const { copy } = useSite();
  const labels = heroActionLabels(copy, range);
  const used = range.actions.filter(action => Object.entries(range.hands).some(([hand, mix]) => !range.unreachable.includes(hand) && mix[action] > 0))
    .sort((a, b) => stripAggression.indexOf(a) - stripAggression.indexOf(b));
  return <div className="site-range-legend">{used.map(action => <span key={action}><i aria-hidden="true" style={{ background: range.stage !== "postflop" && action === "fold" ? "var(--fold)" : actionColor(action) }} />{labels[action] ?? action}</span>)}</div>;
}

function Explorer() {
  const [mobile, setMobile] = useState(() => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(max-width: 560px)").matches);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 560px)");
    const sync = () => setMobile(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  // Render one interactive tree, not a second offscreen set of focus targets.
  return mobile ? <MobileExplorer /> : <DesktopExplorer />;
}

function DesktopExplorer() {
  const { motion } = useSite();
  const [rangeIndex, setRangeIndex] = useState(initialRangeIndex);
  const range = heroRanges[rangeIndex];
  const [selected, setSelected] = useState("A5o");
  const [touring, setTouring] = useState(true);
  const [ref, visible] = useInView<HTMLDivElement>("0px", false);
  const isTouring = touring && motion;

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const stop = () => {
      // Manual interaction takes over the automatic demo.
      setTouring(false);
    };
    node.addEventListener("pointerdown", stop);
    node.addEventListener("keydown", stop);
    return () => { node.removeEventListener("pointerdown", stop); node.removeEventListener("keydown", stop); };
  }, [ref]);

  useEffect(() => {
    if (!isTouring || !visible) return;
    const timer = window.setInterval(() => {
      setRangeIndex(current => pickNextRangeIndex(current, heroRanges.length));
    }, 4000);
    return () => window.clearInterval(timer);
  }, [isTouring, visible]);

  return <div className={`site-explorer is-${range.stage}`} ref={ref} data-tour-running={isTouring && visible}>
    <div className="site-wrap site-hero-main">
      <HeroCopy />
      <div className="site-hero-range">
        <div className="site-hero-chart-frame">
          <HeroActionLegend range={range} />
          <RangeMatrix range={range} selected={selected} onSelect={hand => { setTouring(false); setSelected(hand); }} />
        </div>
      </div>
    </div>
  </div>;
}

const tourHands: Record<RangeMode, string[]> = {
  opening: ["A5o", "K7s", "Q4s", "T9s", "J9o", "22", "K2s", "86s"],
  response: ["A5s", "K7s", "98o", "74s", "QJo", "A2o", "55"],
};

function MobileExplorer() {
  const { copy: c, motion, appHref } = useSite();
  const decorative = true;
  const [mode, setMode] = useState<RangeMode>("opening");
  const [selected, setSelected] = useState("A5o");
  const [touring, setTouring] = useState(true);
  const tourStep = useRef(0);
  const [ref, visible] = useInView<HTMLDivElement>("0px", false);
  const values = frequencies(mode, selected);
  const action = dominantAction(values);
  const spot = mode === "opening" ? c.preview.spotOpening : c.preview.spotResponse;
  const isTouring = touring && motion;

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const stop = (event: Event) => {
      // Playback is intentional; interacting anywhere else takes over the demo.
      if (event.target instanceof Element && event.target.closest("[data-tour-toggle]")) return;
      setTouring(false);
    };
    node.addEventListener("pointerdown", stop);
    node.addEventListener("keydown", stop);
    return () => { node.removeEventListener("pointerdown", stop); node.removeEventListener("keydown", stop); };
  }, [ref]);

  useEffect(() => {
    if (!isTouring || !visible) return;
    const timer = window.setInterval(() => {
      const step = ++tourStep.current;
      const nextMode: RangeMode = step % 2 === 0 ? "opening" : "response";
      const hands = tourHands[nextMode];
      setMode(nextMode);
      setSelected(hands[Math.floor(step / 2) % hands.length]);
    }, 2800);
    return () => window.clearInterval(timer);
  }, [isTouring, visible]);

  const explanation = mode === "opening" && selected === "K7s"
    ? c.preview.k7s
    : c.preview.other(spot, selected, action === "raise" && mode === "response" ? c.preview.actionPast.threeBet : c.preview.actionPast[action], values[action]);

  const selectedRow = Math.floor(cells.findIndex(cell => cell.hand === selected) / ranks.length);

  return <div className={`site-explorer is-${mode}`} ref={ref} data-tour-running={isTouring && visible}>
    <div className="site-wrap site-hero-main">
      <HeroCopy showEstimate={false} />
      <div className="site-hero-range" inert={decorative} aria-hidden={decorative || undefined}>
        <div className="site-hero-chart-frame" style={{ "--selected-row": selectedRow } as CSSProperties}>
          <RangeMatrix range={heroRanges.find(range => range.id === (mode === "opening" ? "BTN_open" : "BB_vs_BTN"))!} selected={selected} onSelect={hand => { setTouring(false); setSelected(hand); }} />
        </div>
        <div className="site-legend">{actions.filter(option => mode === "response" || option !== "call").map(option => <span key={option}><i className={`is-${option}`} />{actionLabel(c, mode, option)}</span>)}</div>
      </div>
    </div>
    <div className="site-hero-detail">
      <div className="site-wrap">
        <div className="site-hand" aria-live={isTouring ? "off" : "polite"} aria-atomic="true">
          <div className="site-hero-deal"><HandCards key={`${mode}-${selected}`} hand={selected} className="is-dealing" /></div>
          <div className="site-hero-summary">
            <span className="site-hand-label">{c.preview.selectedHand}</span>
            <div className="site-hand-title"><strong>{selected}</strong><span>{selected.length === 2 ? c.preview.pair : selected.endsWith("s") ? c.preview.suited : c.preview.offsuit}</span></div>
            <ActionRows mode={mode} values={values} />
          </div>
          <div className="site-hero-reason">
            <p className="site-hand-why"><span>{c.preview.why}</span>{explanation}</p>
            <a className="site-hand-link" href={appHref}>{c.preview.explore}<ArrowUpRight size={15} weight="bold" aria-hidden="true" /></a>
          </div>
        </div>
        <div className="site-hero-playback">
          {motion && <button type="button" className="site-tour-toggle" data-tour-toggle aria-label={isTouring ? c.preview.pauseTour : c.preview.resumeTour} onClick={() => setTouring(current => !current)}>{isTouring ? <Pause size={18} weight="fill" aria-hidden="true" /> : <Play size={18} weight="fill" aria-hidden="true" />}</button>}
          <div className="site-tour" title={isTouring ? c.preview.touring : c.preview.manual}>
            <span className="site-tour-caption">{isTouring ? c.preview.touring : c.preview.manual}</span>
          </div>
          <p className="site-hero-disclaimer">{c.preview.saved} · <b>{c.preview.notGto}</b></p>
        </div>
      </div>
    </div>
  </div>;
}

function Header() {
  const { copy: c, locale, onLocaleChange, appHref } = useSite();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setScrolled(window.scrollY > 8);
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); cancelAnimationFrame(frame); };
  }, []);
  return <header className={`site-header${scrolled ? " is-scrolled" : ""}${open ? " is-open" : ""}`}>
    <div className="site-header-inner">
      <Brand />
      <nav className="site-nav" aria-label={c.common.menuLabel}>
        {c.nav.map(item => <a key={item.href} href={item.href} onClick={() => setOpen(false)}>{item.label}</a>)}
      </nav>
      <div className="site-header-actions">
        <select className="site-lang" value={locale} onChange={event => onLocaleChange(event.target.value as SiteLocale)} aria-label={c.common.languageLabel}>
          {LOCALES.map(option => <option key={option.value} value={option.value} lang={option.value}>{option.label}</option>)}
        </select>
        <a className="site-button is-small" href={appHref}>{c.common.open}<ArrowRight size={15} weight="bold" aria-hidden="true" /></a>
        <button type="button" className="site-menu" onClick={() => setOpen(!open)} aria-label={open ? c.common.menuClose : c.common.menuOpen} aria-expanded={open}>{open ? <X size={22} /> : <List size={22} />}</button>
      </div>
    </div>
  </header>;
}

function HeroCopy({ children, showEstimate = true }: { children?: ReactNode; showEstimate?: boolean }) {
  const { copy: c, appHref } = useSite();
  return <div className="site-hero-copy">
    <h1 id="site-hero-title" lang="en"><span className="site-line site-hero-opening"><span>{c.hero.title1}</span></span><span className="site-line"><span className="site-hero-mark">{c.hero.title2}</span></span></h1>
    <p className="site-hero-lead">{c.hero.lead}</p>
    <div className="site-hero-actions">
      <a className="site-button" href={appHref}>{c.hero.primary}<ArrowRight size={17} weight="bold" aria-hidden="true" /></a>
      <a className="site-hero-secondary" href="#how">{c.hero.secondary}<ArrowRight size={17} aria-hidden="true" /></a>
    </div>
    <p className="site-hero-note">{c.hero.note}{showEstimate && <span className="site-hero-estimate">{c.preview.saved} · {c.preview.notGto}</span>}</p>
    {children}
  </div>;
}

function Hero() {
  return <section className="site-hero" aria-labelledby="site-hero-title"><Explorer /></section>;
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

const seats = ["UTG", "HJ", "CO", "BTN", "SB", "BB"];

function TableScene() {
  const { copy: c } = useSite();
  return <div className="site-scene site-table-scene" aria-hidden="true">
    <div className="site-table">
      <div className="site-table-felt"><span className="site-table-pot">{c.how.pot}</span><span className="site-chip" /></div>
      {seats.map((seat, index) => <div className={`site-seat is-${seat.toLowerCase()}`} key={seat} style={{ "--i": index } as CSSProperties}>
        <span className="site-seat-plate">
          <span className="site-seat-avatar">{seat === "BB" ? c.common.you : seat}</span>
          {seat === "BB" && <span className="site-seat-name">{seat}</span>}
          {seat === "BTN" && <span className="site-seat-dealer">D</span>}
        </span>
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
  const { copy: c, motion, locale } = useSite();
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
  useEffect(() => {
    const cards = steps.current.filter((node): node is HTMLElement => !!node);
    if (!motion || typeof ResizeObserver === "undefined") return;
    const update = () => {
      for (const card of cards) card.dataset.oversized = String(card.offsetHeight > window.innerHeight - 80);
    };
    const observer = new ResizeObserver(update);
    for (const card of cards) observer.observe(card);
    window.addEventListener("resize", update);
    update();
    return () => { observer.disconnect(); window.removeEventListener("resize", update); };
  }, [motion, locale]);
  const scenes = [<TableScene key="table" />, <ReadScene key="read" />, <WhyScene key="why" />];
  const sceneNames = ["table", "read", "why"];
  return <section className="site-section site-how" id="how" aria-labelledby="site-how-title">
    <div className="site-wrap">
      <h2 id="site-how-title" data-reveal>{c.how.title1}<span>{c.how.title2}</span></h2>
      <div className="site-how-grid">
        <div className="site-how-stage">
          {scenes.map((scene, index) => <div className={`site-how-layer${active === index ? " is-active" : ""}`} key={sceneNames[index]}>{scene}</div>)}
          <div className="site-how-progress" aria-hidden="true">{sceneNames.map((name, index) => <span key={name} className={index <= active ? "is-on" : ""} />)}</div>
        </div>
        <div className="site-how-copy" aria-hidden="true">
          {c.how.steps.map((step, index) => <div key={sceneNames[index]} className={`site-how-text${active === index ? " is-active" : ""}`}>
            <span className="site-how-num">0{index + 1}</span>
            <h3>{step.title}</h3>
            <p>{step.body}</p>
          </div>)}
        </div>
        <ol className="site-how-steps">
          {c.how.steps.map((step, index) => <li key={sceneNames[index]} data-step={index} ref={node => { steps.current[index] = node; }} className={active === index ? "is-active" : ""}>
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

  return <section className="site-section site-drill" ref={ref} aria-labelledby="site-drill-title">
    <div className="site-wrap site-drill-inner">
      <div className="site-drill-copy" data-reveal>
        <h2 id="site-drill-title">{c.drill.title1}<span>{c.drill.title2}</span></h2>
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
  return <div className={`site-section-head${children ? "" : " is-solo"}`} data-reveal><h2 id={id}>{title1}<span>{title2}</span></h2>{children}</div>;
}

const personaIds = ["beginner", "learner", "budget"];

function MiniMatrix({ mode, selected }: { mode: RangeMode; selected: string }) {
  return <div className="site-mini-matrix">{cells.map(({ hand, wave }) => <span key={hand} className={`is-${dominantAction(frequencies(mode, hand))}${hand === selected ? " is-selected" : ""}`} style={{ "--wave": wave } as CSSProperties} />)}</div>;
}

function Audience() {
  const { copy: c, motion, appHref } = useSite();
  const [active, setActive] = useState(0);
  const [auto, setAuto] = useState(true);
  const [ref, visible] = useInView<HTMLElement>("-25% 0px", false);
  const [scrolly, setScrolly] = useState(false);
  const [stickyTop, setStickyTop] = useState(0);
  const running = auto && motion && visible && !scrolly;
  const a5s = frequencies("response", "A5s");
  const [free, plus] = c.pricing.plans;

  // biome-ignore lint/correctness/useExhaustiveDependencies: `active` restarts the timer after every switch.
  useEffect(() => {
    if (!running) return;
    const timer = window.setTimeout(() => setActive(current => (current + 1) % personaIds.length), 6500);
    return () => window.clearTimeout(timer);
  }, [running, active]);

  // Pin on phones with enough vertical room too; short screens retain ordinary flow.
  useEffect(() => {
    if (!motion) { setScrolly(false); return; }
    const query = window.matchMedia("(min-width: 961px) and (min-height: 640px), (max-width: 960px) and (min-height: 740px)");
    const sync = () => setScrolly(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, [motion]);

  useEffect(() => {
    const node = ref.current;
    if (!scrolly || !node) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = node.getBoundingClientRect();
      const span = rect.height - window.innerHeight;
      if (span <= 0) return;
      const progress = Math.min(Math.max(-rect.top / span, 0), 0.999);
      setActive(Math.floor(progress * personaIds.length));
    };
    const onScroll = () => { if (!frame) frame = window.requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [scrolly, ref]);

  // Long translations must remain reachable even in a pinned phone scene.
  useEffect(() => {
    const wrapper = ref.current?.firstElementChild as HTMLElement | undefined;
    if (!scrolly || !wrapper || typeof ResizeObserver === "undefined") { setStickyTop(0); return; }
    const update = () => setStickyTop(window.innerWidth <= 960 ? Math.min(0, window.innerHeight - wrapper.offsetHeight) : 0);
    const observer = new ResizeObserver(update);
    observer.observe(wrapper);
    window.addEventListener("resize", update);
    update();
    return () => { observer.disconnect(); window.removeEventListener("resize", update); };
  }, [scrolly, ref]);

  function choose(index: number) {
    setAuto(false);
    const node = ref.current;
    if (scrolly && node) {
      const top = node.getBoundingClientRect().top + window.scrollY;
      const span = node.offsetHeight - window.innerHeight;
      window.scrollTo({ top: top + span * ((index + 0.5) / personaIds.length), behavior: "smooth" });
    }
    setActive((index + personaIds.length) % personaIds.length);
  }

  function onListKey(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const next = (active + (event.key === "ArrowDown" ? 1 : -1) + personaIds.length) % personaIds.length;
    choose(next);
    document.getElementById(`site-persona-${personaIds[next]}`)?.focus();
  }

  const view = (index: number) => `site-persona-view${active === index ? " is-active" : ""}`;
  return <section className={`site-section site-audience${scrolly ? " is-scrolly" : ""}`} ref={ref} aria-labelledby="site-audience-title">
    <div className="site-wrap" style={scrolly ? { top: stickyTop } : undefined}>
      <SectionHead id="site-audience-title" title1={c.audience.title1} title2={c.audience.title2} />
      <div className="site-audience-grid" data-reveal>
        <div className="site-persona-list" role="tablist" aria-orientation="vertical" aria-labelledby="site-audience-title" onKeyDown={onListKey}>
          {c.audience.items.map((item, index) => <button type="button" role="tab" key={personaIds[index]} id={`site-persona-${personaIds[index]}`} aria-selected={active === index} aria-controls="site-persona-panel" tabIndex={active === index ? 0 : -1} className={`site-persona${active === index ? " is-active" : ""}`} onClick={() => choose(index)}>
            <span className="site-persona-level"><i>{index + 1}</i>{item.level}</span>
            <span className="site-persona-quote">{item.quote}</span>
            <span className="site-persona-more"><span><span className="site-persona-body">{item.body}</span><span className="site-persona-gets">{item.gets}</span></span></span>
            {running && active === index && <span className="site-persona-timer" aria-hidden="true" />}
          </button>)}
        </div>
        <div className="site-mock site-persona-stage" role="tabpanel" id="site-persona-panel" aria-labelledby={`site-persona-${personaIds[active]}`}>
          <span className="site-sample">{c.audience.views[active]}</span>
          <div className="site-persona-views">
            <div className={`${view(0)} is-simple`} aria-hidden={active !== 0}>
              <MiniMatrix mode="opening" selected="K7s" />
              <div className="site-persona-callout">
                <HandCards hand="K7s" />
                <strong>K7s</strong>
                <span className="site-persona-pill is-raise">{c.common.raise}</span>
                <small>{c.preview.spotOpening} · {c.preview.simpleMode}</small>
              </div>
            </div>
            <div className={`${view(1)} is-detail`} aria-hidden={active !== 1}>
              <div className="site-persona-detail-head"><HandCards hand="A5s" seed={1} /><div><strong>A5s</strong><small>{c.how.whyHand}</small></div></div>
              <ActionRows mode="response" values={a5s} />
              <p className="site-persona-why"><span>{c.preview.why}</span>{c.how.whyNote}</p>
            </div>
            <div className={`${view(2)} is-free`} aria-hidden={active !== 2}>
              <p className="site-persona-price"><strong>{free.price}</strong><small>{free.cadence}</small></p>
              <span className="site-persona-pill">{c.audience.freeNote}</span>
              <ul>{c.audience.freeList.map((feature, index) => <li key={feature} style={{ "--i": index } as CSSProperties}><Check size={16} weight="bold" aria-hidden="true" />{feature}</li>)}</ul>
              <a className="site-button is-small" href={appHref} tabIndex={active === 2 ? 0 : -1}>{c.common.open}<ArrowRight size={15} weight="bold" aria-hidden="true" /></a>
              <div className="site-persona-plus">
                <p><strong>{plus.name}</strong><span>{plus.price}</span><small>{plus.cadence}</small></p>
                <small>{plus.status}</small>
              </div>
            </div>
          </div>
        </div>
      </div>
      <p className="site-audience-note" data-reveal>{c.audience.note}</p>
    </div>
  </section>;
}

const tierMins = TIERS.map(tier => tier.min);
// Tier keys (Japanese names) for the shared emblem colours, in tierMins order.
const TIER_KEYS = TIERS.map(tier => tier.name);

// Wide screens: Training pins for one screen while scrolling slides it over to Ranked, then the Agent table.
const TRAIN_PAGES = 3;

function TrainingTrack() {
  const { motion } = useSite();
  const ref = useRef<HTMLDivElement>(null);
  const [scrolly, setScrolly] = useState(false);
  const [shift, setShift] = useState(0);
  useEffect(() => {
    if (!motion) { setScrolly(false); return; }
    const query = window.matchMedia("(min-width: 961px) and (min-height: 600px)");
    const sync = () => setScrolly(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, [motion]);
  useEffect(() => {
    const node = ref.current;
    if (!scrolly || !node) { setShift(0); return; }
    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = node.getBoundingClientRect();
      const span = rect.height - window.innerHeight;
      if (span <= 0) return;
      const progress = Math.min(Math.max(-rect.top / span, 0), 1);
      // Switch whole pages at each third; CSS animates the slide so it never rests halfway.
      setShift(Math.min(TRAIN_PAGES - 1, Math.floor(progress * TRAIN_PAGES)));
    };
    const onScroll = () => { if (!frame) frame = window.requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [scrolly]);
  // Anchor the scroll track, not its sticky child: #drill must rewind the slide to Training.
  return <div className={`site-train${scrolly ? " is-scrolly" : ""}`} id="drill" ref={ref}>
    <div className="site-train-stage">
      <div className="site-train-rail" style={scrolly ? { transform: `translateX(${-shift * 100 / TRAIN_PAGES}%)` } : undefined}><Drill /><Ranked /><AgentFeature /></div>
    </div>
  </div>;
}

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
        <h2 id="site-ranked-title">{c.ranked.title1}<span>{c.ranked.title2}</span></h2>
        <p>{c.ranked.description}</p>
        <ul className="site-points">{c.ranked.points.map(point => <li key={point}><Check size={16} weight="bold" aria-hidden="true" />{point}</li>)}</ul>
        <p className="site-feature-note">{c.ranked.rewards}</p>
        <p className="site-feature-note">{c.ranked.note}</p>
      </div>
      <div className="site-mock site-rank" ref={ref} data-reveal aria-hidden="true" style={{ "--tier": tierColor(TIER_KEYS[tier]) } as CSSProperties}>
        <span className="site-sample">{c.ranked.sample}</span>
        <h3 className="site-rank-mode">{c.ranked.mode}</h3>
        <div className="site-rank-card">
          <div className="site-rank-emblem">
            <svg className="site-rank-ring" viewBox="0 0 128 128">
              <circle cx="64" cy="64" r="54" className="track" />
              <circle cx="64" cy="64" r="54" className="arc" strokeDasharray={`${2 * Math.PI * 54 * progress} ${2 * Math.PI * 54}`} />
              {Array.from({ length: 24 }, (_, i) => <line key={i} x1="64" y1="3" x2="64" y2={i % 6 === 0 ? 9 : 6} transform={`rotate(${i * 15} 64 64)`} className="tick" />)}
            </svg>
            <TierEmblem key={tier} level={tier} name={TIER_KEYS[tier]} size={58} />
          </div>
          <div className="site-rank-info">
            <span key={tier} className="site-rank-tier">{c.ranked.tiers[tier]}</span>
            <dl>
              <div><dt>{c.ranked.rating}</dt><dd>{rating.toLocaleString()}</dd></div>
              <div><dt>{c.ranked.hands}</dt><dd>120</dd></div>
            </dl>
            <span className="site-rank-bar"><span style={{ width: `${progress * 100}%` }} /></span>
            <small>{next ? c.ranked.toNext(next - rating, c.ranked.tiers[tier + 1]) : ""}</small>
          </div>
        </div>
        <ol className="site-tiers">{c.ranked.tiers.map((name, index) => <li key={name} className={index < tier ? "is-passed" : index === tier ? "is-current" : ""}
          style={{ "--tier": tierColor(TIER_KEYS[index]) } as CSSProperties}>
          <TierEmblem level={index} name={TIER_KEYS[index]} size={30} /><span>{name}</span><small>{tierMins[index].toLocaleString()}+</small></li>)}
          <li style={{ "--tier": tierColor("レジェンド") } as CSSProperties}><TierEmblem level={TIERS.length} name="レジェンド" size={30} /><span>{c.ranked.legend}</span><small>{c.ranked.legendRule(LEGEND_TOP_N)}</small></li>
        </ol>
      </div>
    </div>
  </section>;
}

function AgentFeature() {
  const { copy: c } = useSite();
  return <section className="site-section site-agent" id="agent" aria-labelledby="site-agent-title">
    <div className="site-wrap site-feature">
      <div className="site-feature-copy" data-reveal>
        <span className="site-status">{c.agent.status}</span>
        <h2 id="site-agent-title">{c.agent.title1}<span>{c.agent.title2}</span></h2>
        <p>{c.agent.description}</p>
        <ul className="site-points">{c.agent.points.map(point => <li key={point}><Check size={16} weight="bold" aria-hidden="true" />{point}</li>)}</ul>
      </div>
      <div className="site-mock site-agent-mock" data-reveal aria-hidden="true">
        <span className="site-sample">{c.agent.sample}</span>
        <img className="site-agent-image" src={agentTableImage} alt="" width={1600} height={1000} decoding="async" />
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
        <h2 id="site-analysis-title">{c.analysis.title1}<span>{c.analysis.title2}</span></h2>
        <p>{c.analysis.description}</p>
        <ul className="site-points">{c.analysis.points.map(point => <li key={point}><Check size={16} weight="bold" aria-hidden="true" />{point}</li>)}</ul>
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

const comparisonRowIds = ["strategy", "explanation", "detail", "practice", "feedback", "precision", "audience"];

function Compare() {
  const { copy: c, motion, locale } = useSite();
  const ref = useRef<HTMLElement>(null);
  const [scrolly, setScrolly] = useState(false);
  const [visibleRows, setVisibleRows] = useState(1);
  const rowCount = c.compare.rows.length;
  useEffect(() => {
    if (!motion) { setScrolly(false); return; }
    const query = window.matchMedia("(min-width: 961px) and (min-height: 600px)");
    const sync = () => setScrolly(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, [motion]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a locale switch reflows the surrounding sections and changes the scroll position.
  useEffect(() => {
    const node = ref.current;
    if (!scrolly || !node) { setVisibleRows(1); return; }
    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = node.getBoundingClientRect();
      // The pinned stage starts below the header and releases at the track's bottom.
      const distance = rect.height - (window.innerHeight - 64);
      if (distance <= 0) return;
      const progress = Math.min(Math.max((64 - rect.top) / distance, 0), 1);
      setVisibleRows(Math.min(Math.floor(progress * rowCount) + 1, rowCount));
    };
    const onScroll = () => { if (!frame) frame = window.requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [scrolly, rowCount, locale]);
  return <section className={`site-section site-compare${scrolly ? " is-scrolly" : ""}`} id="compare" ref={ref} aria-labelledby="site-compare-title">
    <div className="site-compare-stage">
      <div className="site-wrap">
        <SectionHead id="site-compare-title" title1={c.compare.title1} title2={c.compare.title2}><p>{c.compare.description}</p></SectionHead>
        <div className="site-compare-table" data-reveal>
          <table>
            <thead><tr><td /><th scope="col" className="is-us"><BrandIcon size={18} style={{ display: "inline-block", margin: "0 8px -3px 0" }} />{c.compare.us}</th><th scope="col">{c.compare.them}<small>{c.compare.themNote}</small></th></tr></thead>
            <tbody>{c.compare.rows.map((row, index) => <tr key={comparisonRowIds[index]} className={scrolly && index < visibleRows ? "is-revealed" : undefined} style={{ "--i": index } as CSSProperties}>
              <th scope="row">{row.label}</th>
              <td className="is-us">{row.us}</td>
              <td>{row.them}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <p className="site-compare-note">{c.compare.note}</p>
      </div>
    </div>
  </section>;
}

function Pricing() {
  const { copy: c, appHref } = useSite();
  return <section className="site-section site-pricing" id="pricing" aria-labelledby="site-pricing-title">
    <div className="site-wrap">
      <div className="site-pricing-head" data-reveal><h2 id="site-pricing-title">{c.pricing.title1}<span>{c.pricing.title2}</span></h2>{c.pricing.description && <p>{c.pricing.description}</p>}</div>
      <div className="site-plans">{c.pricing.plans.map((plan, index) => <article className={`site-plan${plan.href ? "" : " is-planned"}`} key={plan.name} data-reveal style={{ "--delay": `${index * 120}ms` } as CSSProperties}>
        <div className="site-plan-top"><h3>{plan.name}</h3><span>{plan.status}</span></div>
        <p className="site-plan-price"><strong>{plan.price}</strong><small>{plan.cadence}</small></p>
        <p>{plan.description}</p>
        <ul>{plan.features.map(feature => <li key={feature}><Check size={16} weight="bold" aria-hidden="true" />{feature}</li>)}</ul>
        {plan.href ? <a className="site-button" href={appHref}>{plan.action}<ArrowRight size={16} weight="bold" aria-hidden="true" /></a> : <span className="site-button is-disabled" aria-disabled="true">{plan.action}</span>}
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
  const { copy: c, appHref } = useSite();
  return <section className="site-final" aria-labelledby="site-final-title">
    <div className="site-wrap site-final-inner">
      <div className="site-fan" data-reveal aria-hidden="true">{fan.map(([rank, suit], index) => <PlayingCard key={rank} card={`${rank}${suit}`} variant="site" aria-hidden="true" index={index - 2} />)}</div>
      <h2 id="site-final-title" data-reveal>{c.final.title1}<span>{c.final.title2}</span></h2>
      <p data-reveal>{c.final.description}</p>
      <a className="site-button is-large" href={appHref} data-reveal>{c.final.action}<ArrowRight size={18} weight="bold" aria-hidden="true" /></a>
      <small>{c.final.note}</small>
    </div>
  </section>;
}

function Footer() {
  const { copy: c, appHref } = useSite();
  return <footer className="site-footer">
    <div className="site-wrap">
      <div className="site-footer-top">
        <div><Brand /><p>{c.footer.tagline}</p></div>
        <div className="site-footer-links">
          <div><span>{c.footer.product}</span><a href={appHref}>{c.footer.open}</a><a href="#how">{c.footer.how}</a><a href="#drill">{c.footer.drill}</a><a href="#analysis">{c.footer.analysis}</a></div>
          <div><span>ReysonAI</span><a href="#compare">{c.footer.compare}</a><a href="#pricing">{c.footer.pricing}</a><a href="#faq">{c.footer.faq}</a></div>
          <div><span>{c.footer.legal}</span><a href="/privacy">{c.footer.privacy}</a><a href="/terms">{c.footer.terms}</a></div>
        </div>
      </div>
      <p className="site-disclaimer">{c.footer.disclaimer}</p>
      <p className="site-copyright">© {new Date().getFullYear()} ReysonAI</p>
    </div>
  </footer>;
}

function Reveal({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const { motion, locale } = useSite();
  // biome-ignore lint/correctness/useExhaustiveDependencies: a language switch remounts localized nodes that need observing again.
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
  }, [motion, locale]);
  return <div ref={root}>{children}</div>;
}

export function ServiceSite({ locale, onLocaleChange }: { locale: SiteLocale; onLocaleChange: (locale: SiteLocale) => void }) {
  const copy = SITE_COPY[locale];
  const appHref = appEntryHref(typeof window === "undefined" ? "" : window.location?.hostname ?? "");
  const [motion, setMotion] = useState(() => typeof IntersectionObserver !== "undefined" && !prefersReducedMotion());
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setMotion(typeof IntersectionObserver !== "undefined" && !preference.matches);
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);
  return <SiteContext.Provider value={{ locale, copy, onLocaleChange, motion, appHref }}>
    <div className={`site site-${locale}${motion ? " has-motion" : ""}`}>
      <a className="site-skip" href="#site-main">{copy.common.skip}</a>
      <Header />
      <Reveal>
        <main id="site-main"><Hero /><Audience /><HowItWorks /><TrainingTrack /><Analysis /><Compare /><Pricing /><Faq /><FinalCta /></main>
        <Footer />
      </Reveal>
    </div>
  </SiteContext.Provider>;
}

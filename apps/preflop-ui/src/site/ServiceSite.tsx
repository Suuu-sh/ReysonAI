import { useState, type ReactNode } from "react";
import { ArrowDown, ArrowRight, ArrowUpRight, Check, CircleNotch, CursorClick, List, Minus, Sparkle, X } from "@phosphor-icons/react";
import previewRanges from "./range-preview.json";
import { navigation, plans, responseExamples } from "./content";

type Action = "raise" | "call" | "fold";
type RangeMode = "opening" | "response";
type RangeRow = { hand: string; open?: number; three_bet?: number; call?: number; fold: number };

const ranks = [..."AKQJT98765432"];
const hands = ranks.flatMap((first, row) => ranks.map((second, column) =>
  row === column ? `${first}${second}` : row < column ? `${first}${second}s` : `${second}${first}o`,
));
const opening = new Map<string, RangeRow>(Object.entries(previewRanges.opening).map(([hand, row]) => [hand, { hand, ...row }]));
const response = new Map<string, RangeRow>(Object.entries(previewRanges.response).map(([hand, row]) => [hand, { hand, ...row }]));
const actionColors: Record<Action, string> = { raise: "#eb6ba2", call: "#5da5b0", fold: "#30333a" };

function frequencies(mode: RangeMode, hand: string): Record<Action, number> {
  const row = (mode === "opening" ? opening : response).get(hand);
  return { raise: mode === "opening" ? row?.open ?? 0 : row?.three_bet ?? 0, call: mode === "response" ? row?.call ?? 0 : 0, fold: row?.fold ?? 100 };
}

function dominantAction(values: Record<Action, number>): Action {
  return (Object.keys(values) as Action[]).reduce((best, action) => values[action] > values[best] ? action : best, "fold");
}

function cellBackground(values: Record<Action, number>) {
  const first = values.raise;
  const second = first + values.call;
  return `linear-gradient(90deg, ${actionColors.raise} 0 ${first}%, ${actionColors.call} ${first}% ${second}%, ${actionColors.fold} ${second}% 100%)`;
}

function Brand({ inverted = false }: { inverted?: boolean }) {
  return <a className={`site-brand${inverted ? " site-brand-footer" : ""}`} href="/" aria-label="Solvea home">
    <span className="site-brand-mark" aria-hidden="true"><span /></span>
    <span>Solvea<span className="site-brand-period">.</span></span>
  </a>;
}

function Eyebrow({ children, dot = false }: { children: ReactNode; dot?: boolean }) {
  return <span className="site-eyebrow">{dot && <span className="site-live-dot" aria-hidden="true" />}{children}</span>;
}

function SectionHeading({ eyebrow, title, description, light = false }: { eyebrow: string; title: ReactNode; description?: string; light?: boolean }) {
  return <div className={`site-section-heading${light ? " is-light" : ""}`}>
    <Eyebrow>{eyebrow}</Eyebrow>
    <h2>{title}</h2>
    {description && <p>{description}</p>}
  </div>;
}

function RangeMatrix({ mode, selected, onSelect, compact = false }: { mode: RangeMode; selected: string; onSelect: (hand: string) => void; compact?: boolean }) {
  return <section className={`site-matrix-scroll${compact ? " is-compact" : ""}`} aria-label={`${mode === "opening" ? "BTN opening" : "BB response"} range, horizontally scrollable on small screens`}>
    <fieldset className="site-matrix"><legend className="site-visually-hidden">13 by 13 starting hand matrix</legend>
      {hands.map(hand => {
        const values = frequencies(mode, hand);
        const action = dominantAction(values);
        return <button
          type="button"
          key={hand}
          className={`site-matrix-cell${selected === hand ? " is-selected" : ""}${values.raise > 0 && values.raise < 100 || values.call > 0 && values.call < 100 ? " is-mixed" : ""}`}
          style={{ background: cellBackground(values) }}
          aria-label={`${hand}: ${action} ${values[action]} percent`}
          aria-pressed={selected === hand}
          onClick={() => onSelect(hand)}
          title={`${hand} · ${action.toUpperCase()} ${values[action]}%`}
        >{hand}</button>;
      })}
    </fieldset>
  </section>;
}

function RangePreview({ compact = false }: { compact?: boolean }) {
  const [mode, setMode] = useState<RangeMode>("opening");
  const [selected, setSelected] = useState("K7s");
  const values = frequencies(mode, selected);
  const action = dominantAction(values);
  const isK7sOpening = mode === "opening" && selected === "K7s";

  function chooseMode(next: RangeMode) {
    setMode(next);
    setSelected("K7s");
  }

  return <div className={`site-product-frame${compact ? " site-product-frame-compact" : ""}`}>
    <div className="site-frame-top"><span className="site-frame-brand"><span className="site-frame-logo">✦</span> SOLVEA <span>/ RANGE EXPLORER</span></span><span className="site-frame-status"><span /> AI SOLUTION</span></div>
    <div className="site-frame-toolbar">
      <div><span className="site-frame-overline">CURRENT SPOT</span><strong>6-Max Cash <span>/</span> 100BB <span>/</span> {mode === "opening" ? "BTN Open" : "BB vs BTN"}</strong></div>
      <span className="site-frame-pill">PREFLOP <ArrowDown size={12} weight="bold" aria-hidden="true" /></span>
    </div>
    <fieldset className="site-range-switch"><legend className="site-visually-hidden">Preview spot</legend>
      <button type="button" aria-pressed={mode === "opening"} onClick={() => chooseMode("opening")}>BTN Open</button>
      <button type="button" aria-pressed={mode === "response"} onClick={() => chooseMode("response")}>BB vs BTN</button>
    </fieldset>
    <div className="site-preview-body">
      <div className="site-matrix-column">
        <div className="site-matrix-label"><span>HAND RANGE</span><span>13 × 13</span></div>
        <RangeMatrix mode={mode} selected={selected} onSelect={setSelected} compact={compact} />
        <div className="site-legend"><span><i className="site-legend-raise" /> Raise</span>{mode === "response" && <span><i className="site-legend-call" /> Call</span>}<span><i className="site-legend-fold" /> Fold</span></div>
      </div>
      <div className="site-hand-panel" aria-live="polite">
        <div className="site-panel-top"><span>SELECTED HAND</span><span className="site-panel-sparkle"><Sparkle size={17} weight="fill" aria-hidden="true" /></span></div>
        <div className="site-hand-name">{selected}<span>{selected.endsWith("s") ? "SUITED" : selected.endsWith("o") ? "OFFSUIT" : "POCKET PAIR"}</span></div>
        <div className="site-action"><span className={`site-action-dot is-${action}`} />{action.toUpperCase()}<small>{values[action]}%</small></div>
        <div className="site-why"><span className="site-why-label"><Sparkle size={15} weight="fill" aria-hidden="true" /> WHY THIS HAND?</span><p>{isK7sOpening
          ? "K7s is suited and playable after the flop. In this BTN opening estimate, it is raised every time."
          : `In this saved ${mode === "opening" ? "BTN opening" : "BB response"} range, ${selected} is ${action === "fold" ? "folded" : action === "raise" ? "raised" : "called"} ${values[action]}% of the time. Open the app for the full hand-level explanation.`}</p></div>
        <a className="site-panel-link" href="/app">Explore this range <ArrowUpRight size={15} weight="bold" aria-hidden="true" /></a>
      </div>
    </div>
    <div className="site-frame-foot"><span><span className="site-foot-pulse" /> SAVED AI ESTIMATE</span><span>Not a GTO solution</span></div>
  </div>;
}

function Header() {
  const [open, setOpen] = useState(false);
  return <header className="site-header">
    <div className="site-header-inner">
      <Brand />
      <nav className={`site-nav${open ? " is-open" : ""}`} aria-label="Main navigation">
        {navigation.map(item => <a key={item.href} href={item.href} onClick={() => setOpen(false)}>{item.label}</a>)}
        <span className="site-signin" title="Accounts are not available yet">Sign in <small>SOON</small></span>
        <a className="site-btn site-btn-small site-btn-primary site-mobile-cta" href="/app">Try Solvea <ArrowUpRight size={15} weight="bold" aria-hidden="true" /></a>
      </nav>
      <a className="site-btn site-btn-small site-btn-primary site-desktop-cta" href="/app">Try Solvea <ArrowUpRight size={15} weight="bold" aria-hidden="true" /></a>
      <button className="site-menu-button" type="button" onClick={() => setOpen(!open)} aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open}>{open ? <X size={23} /> : <List size={23} />}</button>
    </div>
  </header>;
}

function Hero() {
  return <section className="site-hero" aria-labelledby="site-hero-title">
    <div className="site-hero-glow" aria-hidden="true" />
    <div className="site-hero-inner">
      <div className="site-hero-copy">
        <Eyebrow dot>THE NEW WAY TO LEARN POKER STRATEGY</Eyebrow>
        <h1 id="site-hero-title">Less solving.<br /><span>More playing.</span></h1>
        <p className="site-hero-lead">AI-powered poker ranges made to be <em>understood, remembered, and played.</em> No endless trees. Just the strategy you can use.</p>
        <div className="site-hero-actions"><a className="site-btn site-btn-primary" href="/app">Try Solvea <ArrowUpRight size={18} weight="bold" aria-hidden="true" /></a><a className="site-btn site-btn-ghost" href="#how">See how it works <ArrowRight size={18} aria-hidden="true" /></a></div>
        <div className="site-hero-proof"><span className="site-proof-line" /><span>PRE-FLOP, MADE HUMAN</span><span>·</span><span>EXPLORE A REAL RANGE</span></div>
      </div>
      <div className="site-hero-product"><div className="site-product-halo" aria-hidden="true" /><RangePreview /><span className="site-product-caption"><span>01 / THE PRODUCT</span><span>Click any hand to explore</span></span></div>
    </div>
    <div className="site-hero-bottom"><span>STRATEGY THAT MAKES SENSE</span><a href="#why">SCROLL TO EXPLORE <ArrowDown size={15} aria-hidden="true" /></a></div>
  </section>;
}

function Problem() {
  return <section className="site-section site-problem" id="why">
    <div className="site-container">
      <div className="site-problem-intro"><Eyebrow>THE PROBLEM</Eyebrow><h2>Powerful tools.<br /><span>Too much to carry.</span></h2><p>Solvers are extraordinary for deep study. But most players don't need to memorize every branch and frequency to make better decisions at the table.</p></div>
      <div className="site-problem-grid">
        {[{ number: "01", title: "Hundreds of branches", detail: "The right answer can disappear inside a game tree." }, { number: "02", title: "Fractional decisions", detail: "47% raise. 38% call. 15% fold. Then what?" }, { number: "03", title: "Not built for recall", detail: "Useful theory is only useful if you can use it live." }].map(item => <div className="site-problem-item" key={item.number}><span>{item.number}</span><h3>{item.title}</h3><p>{item.detail}</p><ArrowUpRight size={19} aria-hidden="true" /></div>)}
      </div>
      <div className="site-thesis"><span className="site-thesis-symbol">✳</span><p>You don't have to study like a solver<br />to <em>think like a stronger player.</em></p></div>
    </div>
  </section>;
}

function HowItWorks() {
  return <section className="site-section site-how" id="how">
    <div className="site-container">
      <SectionHeading eyebrow="A BETTER WAY IN" title={<>From spot to strategy<br />in three simple moves.</>} description="No solver setup. No deciphering charts. Pick a situation and start learning." />
      <div className="site-steps">
        <article className="site-step"><span className="site-step-num">01 / CHOOSE</span><div className="site-step-visual site-spot-visual"><span>YOUR SPOT</span><strong>6-Max Cash</strong><div><b>100BB</b><b>BTN</b><b>vs BB</b></div><span className="site-spot-arrow"><ArrowRight size={18} /></span></div><h3>Choose your spot.</h3><p>Select the game, stack, and positions. That's enough to get going.</p></article>
        <article className="site-step"><span className="site-step-num">02 / SEE</span><div className="site-step-visual site-mini-range"><div className="site-mini-range-head"><span>BTN OPEN RANGE</span><span>13 × 13</span></div><div className="site-mini-cells">{["AA","AKs","AQs","AJs","ATs","KQs","KK","KJs","KTs","K9s","QJs","QTs","QQ","JTs","J9s","T9s","99","88","77","66"].map((hand, index) => <span className={index > 15 ? "dim" : index === 9 ? "picked" : ""} key={hand}>{hand}</span>)}</div></div><h3>See your range.</h3><p>A clear 13 × 13 map turns a complex strategy into a usable decision.</p></article>
        <article className="site-step"><span className="site-step-num">03 / UNDERSTAND</span><div className="site-step-visual site-ask-visual"><div><Sparkle size={16} weight="fill" /> WHY K7s?</div><p>“It's suited, plays well after the flop, and fits this BTN opening range.”</p><span>UNDERSTAND THE REASON <ArrowUpRight size={14} /></span></div><h3>Ask why.</h3><p>Go beyond memorizing cells. See the thinking behind the action.</p></article>
      </div>
    </div>
  </section>;
}

function SimpleStrategy() {
  return <section className="site-section site-simple">
    <div className="site-container site-simple-inner">
      <div className="site-simple-copy"><Eyebrow>CLARITY IS A FEATURE</Eyebrow><h2>Less to memorize.<br /><span>More to use.</span></h2><p>Start with the clearest decision. Look at the detail when you want it. Solvea meets you where you are—not where a solver expects you to be.</p><a className="site-text-link" href="/app">Explore simple mode <ArrowUpRight size={18} weight="bold" /></a></div>
      <div className="site-decision-cards">
        <div className="site-decision-card site-decision-complex"><span>ILLUSTRATIVE MIXED STRATEGY</span><strong>A5s</strong><div><span>Raise</span><b>47%</b></div><div><span>Call</span><b>38%</b></div><div><span>Fold</span><b>15%</b></div><small>Concept illustration; not a competitor's data.</small></div>
        <div className="site-decision-arrow"><ArrowRight size={22} weight="bold" /></div>
        <div className="site-decision-card site-decision-solvea"><span>SOLVEA · SIMPLE VIEW</span><strong>A5s</strong><div><span className="site-action-dot is-raise" />RAISE <Check size={23} weight="bold" /></div><small>One clear action to start with. Detail when you need it.</small></div>
      </div>
    </div>
  </section>;
}

function Solution() {
  return <section className="site-section site-solution" id="solution"><div className="site-container site-solution-inner"><div><Eyebrow>THE SOLVEA APPROACH</Eyebrow><h2>Not GTO.<br />Not guesswork.<br /><span>An AI Solution.</span></h2><p>Solvea's current preflop ranges are AI estimates, checked for structural consistency and explained in human language. They are not solver output or a claim of mathematical optimality.</p><a className="site-text-link" href="/app">See the current preview <ArrowUpRight size={18} weight="bold" /></a></div><div className="site-pipeline"><div className="site-pipeline-header"><Sparkle size={18} weight="fill" /><span>HOW WE BUILD TRUST</span><span>01—04</span></div><div className="site-pipeline-row"><span>01</span><strong>Generate</strong><small>AI-estimated strategy</small><Check size={18} /></div><div className="site-pipeline-row"><span>02</span><strong>Validate</strong><small>Structural checks</small><Check size={18} /></div><div className="site-pipeline-row"><span>03</span><strong>Explain</strong><small>Reasons you can learn from</small><Check size={18} /></div><div className="site-pipeline-row is-future"><span>04</span><strong>Refine together</strong><small>AI review pipeline · planned</small><CircleNotch size={18} /></div><div className="site-pipeline-end"><span className="site-pipeline-end-mark">✦</span><div><strong>Built for humans.</strong><small>Not for solving every edge case.</small></div></div></div></div></section>;
}

function Adaptive() {
  const [example, setExample] = useState(0);
  return <section className="site-section site-adaptive"><div className="site-container site-adaptive-inner"><div className="site-adaptive-copy"><span className="site-soon-tag">COMING SOON</span><Eyebrow>THE NEXT CHAPTER</Eyebrow><h2>Your table<br />isn't always <span>GTO.</span></h2><p>One day, ask Solvea about the people and patterns at your table. The goal: strategy that adapts to your context while staying easy to understand.</p><div className="site-prompt-list"><span>TRY A CONCEPT PROMPT</span>{responseExamples.map((item, index) => <button type="button" key={item.prompt} aria-pressed={example === index} onClick={() => setExample(index)}>“{item.prompt}” <ArrowUpRight size={15} /></button>)}</div><small className="site-concept-note">Interactive concept preview only. Natural-language range adjustment is not available in the current app.</small></div><div className="site-chat-frame" aria-live="polite"><div className="site-chat-top"><span><span className="site-chat-symbol">✦</span> SOLVEA / TABLE CONTEXT</span><span>CONCEPT</span></div><div className="site-chat-content"><span className="site-chat-divider">A MORE PERSONAL STRATEGY</span><div className="site-chat-user">{responseExamples[example].prompt}</div><div className="site-chat-answer"><span className="site-chat-avatar">✦</span><div><strong>Solvea <span>· PREVIEW</span></strong><p>{responseExamples[example].response}</p></div></div><div className="site-chat-note"><Minus size={16} /> Future feature preview, not a live AI response</div></div><div className="site-chat-input">Ask anything about your range... <ArrowUpRight size={18} /></div></div></div></section>;
}

function Learning() {
  return <section className="site-section site-learning"><div className="site-container site-learning-inner"><div className="site-learning-visual"><div className="site-learning-orbit orbit-one" /><div className="site-learning-orbit orbit-two" /><div className="site-learning-card"><span>HAND DETAIL / BTN OPEN</span><strong>K7s</strong><div><span className="site-action-dot is-raise" /> RAISE <b>100%</b></div><div className="site-learning-divider" /><small><Sparkle size={15} weight="fill" /> AI EXPLANATION</small><p>Suited hands like K7s can make strong flushes. On the button, this estimate opens it as a raise.</p></div><div className="site-question-chip chip-one">Why not fold?</div><div className="site-question-chip chip-two">Compare with K6s</div><div className="site-question-chip chip-three">What changes at 50BB?</div></div><div className="site-learning-copy"><Eyebrow>LEARN AS YOU PLAY</Eyebrow><h2>Don't just memorize.<br /><span>Understand.</span></h2><p>Every decision has a reason. Tap a hand and see the logic behind the range—in plain language, right beside the chart.</p><div className="site-learning-feature"><CursorClick size={22} /><div><strong>Click a hand</strong><span>Go from a colored square to a clear action.</span></div></div><div className="site-learning-feature"><Sparkle size={22} /><div><strong>See the reasoning</strong><span>Build intuition instead of memorizing a pattern.</span></div></div><small>Suggested follow-up questions shown are a future conversational experience.</small></div></div></section>;
}

function Levels() {
  const [level, setLevel] = useState(0);
  const levels = [{ label: "Beginner", headline: "Find your first clear answer.", body: "A simplified display shows the main action first, keeping the cognitive load low." }, { label: "Standard", headline: "See the full picture.", body: "Inspect the underlying action frequencies and learn where decisions mix." }, { label: "Advanced", headline: "Go deeper when you need to.", body: "More advanced training is on the roadmap. The current app offers simple and standard views." }];
  return <section className="site-section site-levels"><div className="site-container"><SectionHeading eyebrow="YOUR JOURNEY" title={<>Built for the player<br />you're becoming.</>} description="Choose the amount of detail that helps you grow. You can always look deeper." /><div className="site-levels-shell"><div className="site-level-tabs" role="tablist" aria-label="Learning level">{levels.map((item, index) => <button type="button" role="tab" id={`site-level-tab-${index}`} aria-controls="site-level-panel" aria-selected={level === index} onClick={() => setLevel(index)} key={item.label}><span>0{index + 1}</span>{item.label}{index === 2 && <small>PLANNED</small>}</button>)}</div><div className="site-level-panel" role="tabpanel" id="site-level-panel" aria-labelledby={`site-level-tab-${level}`}><div><span className="site-level-kicker">{levels[level].label.toUpperCase()} MODE</span><h3>{levels[level].headline}</h3><p>{levels[level].body}</p><a href="/app" className="site-text-link">Explore the current app <ArrowUpRight size={17} /></a></div><div className="site-level-demo"><span>SAME HAND. THE RIGHT AMOUNT OF DETAIL.</span><div><strong>K7s</strong><span>{level === 2 ? "ADVANCED · PLANNED" : level === 1 ? "STANDARD VIEW" : "SIMPLE VIEW"}</span></div><div className="site-level-action"><span className="site-action-dot is-raise" /> RAISE <b>{level === 0 ? "" : "100%"}</b></div>{level > 0 && <div className="site-level-bar"><span /></div>}{level === 2 && <small>Additional training tools are not yet available.</small>}</div></div></div></div></section>;
}

function Comparison() {
  return <section className="site-section site-comparison"><div className="site-container"><SectionHeading eyebrow="DIFFERENT TOOLS, DIFFERENT JOBS" title={<>The right tool depends<br />on what you're here to do.</>} description="Traditional solvers and Solvea serve different ways of learning. Neither needs to replace the other." /><div className="site-comparison-grid"><div className="site-comparison-card"><div className="site-comparison-icon">∑</div><h3>Traditional GTO Solver</h3><p>For deep theoretical study and detailed control.</p><ul><li>Large game trees</li><li>Precise mixed frequencies</li><li>Maximum configuration</li><li>Advanced analysis</li></ul><span>STUDY THE THEORY</span></div><div className="site-comparison-card is-solvea"><div className="site-comparison-icon">✦</div><h3>Solvea</h3><p>For making practical strategy easier to grasp.</p><ul><li>Approachable AI-estimated ranges</li><li>Plain-language explanations</li><li>Fast decisions</li><li>Designed for learning</li></ul><span>PLAY WITH CLARITY</span></div></div></div></section>;
}

function Pricing() {
  return <section className="site-section site-pricing" id="pricing"><div className="site-container"><SectionHeading eyebrow="PRICING" title={<>Start learning.<br /><span>Keep growing.</span></>} description="Explore the current preview for free. A paid plan is an early proposal, not a live subscription." /><div className="site-pricing-grid">{plans.map((plan, index) => <article className={`site-price-card${index === 1 ? " is-plus" : ""}`} key={plan.name}><div className="site-price-top"><span>{plan.name.toUpperCase()}</span><span>{plan.status}</span></div><div className="site-price-number">{plan.price}<small>{plan.cadence}</small></div><p>{plan.description}</p><div className="site-price-rule" /><ul>{plan.features.map(feature => <li key={feature}><Check size={17} weight="bold" />{feature}</li>)}</ul>{plan.href ? <a href={plan.href} className="site-btn site-btn-primary">{plan.action}<ArrowUpRight size={17} weight="bold" /></a> : <span className="site-btn site-btn-disabled" aria-disabled="true">{plan.action}</span>}</article>)}</div><p className="site-pricing-note">The ¥680 Plus price and all paid features are provisional. No billing or account system is available yet.</p></div></section>;
}

function FinalCta() {
  return <section className="site-final"><div className="site-final-glow" aria-hidden="true" /><div className="site-container site-final-inner"><Eyebrow>YOUR NEXT HAND STARTS HERE</Eyebrow><h2>Play smarter.<br /><span>Study lighter.</span></h2><p>Simple ranges. Clear explanations. Built for real players.</p><a className="site-btn site-btn-primary" href="/app">Start with Solvea <ArrowUpRight size={18} weight="bold" /></a><span className="site-final-micro">Free preview · No account required</span></div></section>;
}

function Footer() {
  return <footer className="site-footer"><div className="site-container"><div className="site-footer-top"><div><Brand inverted /><p>Poker strategy, made playable.</p></div><div className="site-footer-links"><div><span>PRODUCT</span><a href="#how">How it works</a><a href="#solution">AI Solution</a><a href="/app">Open the app</a></div><div><span>EXPLORE</span><a href="#pricing">Pricing</a><a href="#why">About Solvea</a><span className="site-footer-unavailable">Privacy · coming soon</span><span className="site-footer-unavailable">Terms · coming soon</span></div></div></div><p className="site-disclaimer">Solvea provides poker strategy and educational information. AI Solutions are estimates and are not guaranteed to be mathematically optimal or equivalent to GTO solutions. Please play responsibly.</p><div className="site-footer-bottom"><span>© {new Date().getFullYear()} Solvea</span><span>MADE FOR THE THINKING PLAYER <span>✦</span></span></div></div></footer>;
}

export function ServiceSite() {
  return <div className="site"><a className="site-skip" href="#site-main">Skip to content</a><Header /><main id="site-main"><Hero /><Problem /><HowItWorks /><SimpleStrategy /><Solution /><Adaptive /><Learning /><Levels /><Comparison /><Pricing /><FinalCta /></main><Footer /></div>;
}

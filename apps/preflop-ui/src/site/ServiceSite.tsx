import { createContext, useContext, useState, type ReactNode } from "react";
import { ArrowDown, ArrowRight, ArrowUpRight, Check, CircleNotch, CursorClick, List, Minus, Sparkle, X } from "@phosphor-icons/react";
import previewRanges from "./range-preview.json";
import { en, type SiteCopy, type SiteLocale } from "./content";
import { ja } from "./content-ja";

const SiteContext = createContext<{ locale: SiteLocale; copy: SiteCopy }>({ locale: "en", copy: en });
const useSite = () => useContext(SiteContext);

type Action = "raise" | "call" | "fold";
type RangeMode = "opening" | "response";
type RangeRow = { hand: string; open?: number; three_bet?: number; call?: number; fold: number };

const ranks = [..."AKQJT98765432"];
const hands = ranks.flatMap((first, row) => ranks.map((second, column) =>
  row === column ? `${first}${second}` : row < column ? `${first}${second}s` : `${second}${first}o`,
));
const opening = new Map<string, RangeRow>(Object.entries(previewRanges.opening).map(([hand, row]) => [hand, { hand, ...row }]));
const response = new Map<string, RangeRow>(Object.entries(previewRanges.response).map(([hand, row]) => [hand, { hand, ...row }]));

function frequencies(mode: RangeMode, hand: string): Record<Action, number> {
  const row = (mode === "opening" ? opening : response).get(hand);
  return { raise: mode === "opening" ? row?.open ?? 0 : row?.three_bet ?? 0, call: mode === "response" ? row?.call ?? 0 : 0, fold: row?.fold ?? 100 };
}

function dominantAction(values: Record<Action, number>): Action {
  return (Object.keys(values) as Action[]).reduce((best, action) => values[action] > values[best] ? action : best, "fold");
}

function Brand({ inverted = false }: { inverted?: boolean }) {
  const { locale, copy } = useSite();
  return <a className={`site-brand${inverted ? " site-brand-footer" : ""}`} href={locale === "ja" ? "/ja" : "/"} aria-label={copy.common.home}>
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
  const { copy } = useSite();
  return <section className={`site-matrix-scroll${compact ? " is-compact" : ""}`} aria-label={`${mode === "opening" ? copy.preview.spotOpening : copy.preview.spotResponse} ${copy.preview.scrollLabel}`}>
    <fieldset className="site-matrix"><legend className="site-visually-hidden">{copy.preview.matrixLabel}</legend>
      {hands.map(hand => {
        const values = frequencies(mode, hand);
        const action = dominantAction(values);
        const breakdown = (Object.keys(values) as Action[])
          .filter(option => values[option] > 0)
          .map(option => `${copy.common[option]} ${values[option]}%`)
          .join(" / ");
        return <button
          type="button"
          key={hand}
          className={`site-matrix-cell is-${action}${selected === hand ? " is-selected" : ""}`}
          aria-label={`${hand}: ${breakdown}`}
          aria-pressed={selected === hand}
          onClick={() => onSelect(hand)}
          title={`${hand} · ${breakdown}`}
        >{hand}</button>;
      })}
    </fieldset>
  </section>;
}

function RangePreview({ compact = false }: { compact?: boolean }) {
  const { copy: c } = useSite();
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
    <div className="site-frame-top"><span className="site-frame-brand"><span className="site-frame-logo">✦</span> SOLVEA <span>{c.preview.explorer}</span></span><span className="site-frame-status"><span /> AI SOLUTION</span></div>
    <div className="site-frame-toolbar">
      <div><span className="site-frame-overline">{c.preview.currentSpot}</span><strong>{c.preview.cash} <span>/</span> 100BB <span>/</span> {mode === "opening" ? c.preview.open : c.preview.response}</strong></div>
      <span className="site-frame-pill">{c.preview.preflop} <ArrowDown size={12} weight="bold" aria-hidden="true" /></span>
    </div>
    <fieldset className="site-range-switch"><legend className="site-visually-hidden">{c.preview.spotLabel}</legend>
      <button type="button" aria-pressed={mode === "opening"} onClick={() => chooseMode("opening")}>{c.preview.open}</button>
      <button type="button" aria-pressed={mode === "response"} onClick={() => chooseMode("response")}>{c.preview.response}</button>
    </fieldset>
    <div className="site-preview-body">
      <div className="site-matrix-column">
        <div className="site-matrix-label"><span>{c.preview.handRange}</span><span>13 × 13</span></div>
        <RangeMatrix mode={mode} selected={selected} onSelect={setSelected} compact={compact} />
        <div className="site-legend"><span><i className="site-legend-raise" /> {c.common.raise}</span>{mode === "response" && <span><i className="site-legend-call" /> {c.common.call}</span>}<span><i className="site-legend-fold" /> {c.common.fold}</span></div>
      </div>
      <div className="site-hand-panel" aria-live="polite">
        <div className="site-panel-top"><span>{c.preview.selectedHand}</span><span className="site-panel-sparkle"><Sparkle size={17} weight="fill" aria-hidden="true" /></span></div>
        <div className="site-hand-name">{selected}<span>{selected.endsWith("s") ? c.preview.suited : selected.endsWith("o") ? c.preview.offsuit : c.preview.pair}</span></div>
        <div className="site-action"><span className={`site-action-dot is-${action}`} />{c.common[action]}<small>{values[action]}%</small></div>
        <div className="site-why"><span className="site-why-label"><Sparkle size={15} weight="fill" aria-hidden="true" /> {c.preview.why}</span><p>{isK7sOpening
          ? c.preview.k7s
          : c.preview.other(mode === "opening" ? c.preview.spotOpening : c.preview.spotResponse, selected, c.preview.actionPast[action], values[action])}</p></div>
        <a className="site-panel-link" href="/app">{c.preview.explore} <ArrowUpRight size={15} weight="bold" aria-hidden="true" /></a>
      </div>
    </div>
    <div className="site-frame-foot"><span><span className="site-foot-pulse" /> {c.preview.saved}</span><span>{c.preview.notGto}</span></div>
  </div>;
}

function Header() {
  const { locale, copy: c } = useSite();
  const [open, setOpen] = useState(false);
  return <header className="site-header">
    <div className="site-header-inner">
      <Brand />
      <nav className={`site-nav${open ? " is-open" : ""}`} aria-label={locale === "ja" ? "メインメニュー" : "Main navigation"}>
        {c.navigation.map(item => <a key={item.href} href={item.href} onClick={() => setOpen(false)}>{item.label}</a>)}
        <span className="site-signin" title={c.common.signInHint}>{c.common.signIn} <small>{c.common.soon}</small></span>
        <a className="site-btn site-btn-small site-btn-primary site-mobile-cta" href="/app">{c.common.try} <ArrowUpRight size={15} weight="bold" aria-hidden="true" /></a>
      </nav>
      <div className="site-header-actions"><a className="site-language-link" href={locale === "ja" ? `/${window.location.hash}` : `/ja${window.location.hash}`} hrefLang={locale === "ja" ? "en" : "ja"} aria-label={locale === "ja" ? "Switch to English" : "日本語に切り替える"}>{locale === "ja" ? "EN" : "日本語"}</a><a className="site-btn site-btn-small site-btn-primary site-desktop-cta" href="/app">{c.common.try} <ArrowUpRight size={15} weight="bold" aria-hidden="true" /></a></div>
      <button className="site-menu-button" type="button" onClick={() => setOpen(!open)} aria-label={open ? c.common.menuClose : c.common.menuOpen} aria-expanded={open}>{open ? <X size={23} /> : <List size={23} />}</button>
    </div>
  </header>;
}

function Hero() {
  const { copy: c } = useSite();
  return <section className="site-hero" aria-labelledby="site-hero-title">
    <div className="site-hero-glow" aria-hidden="true" />
    <div className="site-hero-inner">
      <div className="site-hero-copy">
        <Eyebrow dot>{c.hero.eyebrow}</Eyebrow>
        <h1 id="site-hero-title">{c.hero.title1}<br /><span>{c.hero.title2}</span></h1>
        <p className="site-hero-lead">{c.hero.lead1} <em>{c.hero.leadEmphasis}</em> {c.hero.lead2}</p>
        <div className="site-hero-actions"><a className="site-btn site-btn-primary" href="/app">{c.common.try} <ArrowUpRight size={18} weight="bold" aria-hidden="true" /></a><a className="site-btn site-btn-ghost" href="#how">{c.hero.secondary} <ArrowRight size={18} aria-hidden="true" /></a></div>
        <div className="site-hero-proof"><span className="site-proof-line" /><span>{c.hero.proof1}</span><span>·</span><span>{c.hero.proof2}</span></div>
      </div>
      <div className="site-hero-product"><div className="site-product-halo" aria-hidden="true" /><RangePreview /><span className="site-product-caption"><span>{c.hero.product}</span><span>{c.hero.clickHand}</span></span></div>
    </div>
    <div className="site-hero-bottom"><span>{c.hero.bottom}</span><a href="#why">{c.hero.scroll} <ArrowDown size={15} aria-hidden="true" /></a></div>
  </section>;
}

function Problem() {
  const { copy: c } = useSite();
  return <section className="site-section site-problem" id="why">
    <div className="site-container">
      <div className="site-problem-intro"><Eyebrow>{c.problem.eyebrow}</Eyebrow><h2>{c.problem.title1}<br /><span>{c.problem.title2}</span></h2><p>{c.problem.description}</p></div>
      <div className="site-problem-grid">
        {c.problem.items.map(item => <div className="site-problem-item" key={item.number}><span>{item.number}</span><h3>{item.title}</h3><p>{item.detail}</p><ArrowUpRight size={19} aria-hidden="true" /></div>)}
      </div>
      <div className="site-thesis"><span className="site-thesis-symbol">✳</span><p>{c.problem.thesis1}<br /><em>{c.problem.thesis2}</em></p></div>
    </div>
  </section>;
}

function HowItWorks() {
  const { copy: c } = useSite();
  return <section className="site-section site-how" id="how">
    <div className="site-container">
      <SectionHeading eyebrow={c.how.eyebrow} title={<>{c.how.title1}<br />{c.how.title2}</>} description={c.how.description} />
      <div className="site-steps">
        <article className="site-step"><span className="site-step-num">{c.how.steps[0].number}</span><div className="site-step-visual site-spot-visual"><span>{c.how.yourSpot}</span><strong>{c.preview.cash}</strong><div><b>100BB</b><b>BTN</b><b>{c.how.versusBb}</b></div><span className="site-spot-arrow"><ArrowRight size={18} /></span></div><h3>{c.how.steps[0].title}</h3><p>{c.how.steps[0].description}</p></article>
        <article className="site-step"><span className="site-step-num">{c.how.steps[1].number}</span><div className="site-step-visual site-mini-range"><div className="site-mini-range-head"><span>{c.how.range}</span><span>13 × 13</span></div><div className="site-mini-cells">{["AA","AKs","AQs","AJs","ATs","KQs","KK","KJs","KTs","K9s","QJs","QTs","QQ","JTs","J9s","T9s","99","88","77","66"].map((hand, index) => <span className={index > 15 ? "dim" : index === 9 ? "picked" : ""} key={hand}>{hand}</span>)}</div></div><h3>{c.how.steps[1].title}</h3><p>{c.how.steps[1].description}</p></article>
        <article className="site-step"><span className="site-step-num">{c.how.steps[2].number}</span><div className="site-step-visual site-ask-visual"><div><Sparkle size={16} weight="fill" /> {c.how.whyK7s}</div><p>{c.how.exampleReason}</p><span>{c.how.understand} <ArrowUpRight size={14} /></span></div><h3>{c.how.steps[2].title}</h3><p>{c.how.steps[2].description}</p></article>
      </div>
    </div>
  </section>;
}

function SimpleStrategy() {
  const { copy: c } = useSite();
  return <section className="site-section site-simple">
    <div className="site-container site-simple-inner">
      <div className="site-simple-copy"><Eyebrow>{c.simple.eyebrow}</Eyebrow><h2>{c.simple.title1}<br /><span>{c.simple.title2}</span></h2><p>{c.simple.description}</p><a className="site-text-link" href="/app">{c.simple.link} <ArrowUpRight size={18} weight="bold" /></a></div>
      <div className="site-decision-cards">
        <div className="site-decision-card site-decision-complex"><span>{c.simple.mixed}</span><strong>A5s</strong><div><span>{c.common.raise}</span><b>47%</b></div><div><span>{c.common.call}</span><b>38%</b></div><div><span>{c.common.fold}</span><b>15%</b></div><small>{c.simple.illustration}</small></div>
        <div className="site-decision-arrow"><ArrowRight size={22} weight="bold" /></div>
        <div className="site-decision-card site-decision-solvea"><span>{c.simple.simpleView}</span><strong>A5s</strong><div><span className="site-action-dot is-raise" />{c.common.raise} <Check size={23} weight="bold" /></div><small>{c.simple.oneDecision}</small></div>
      </div>
    </div>
  </section>;
}

function Solution() {
  const { copy: c } = useSite();
  return <section className="site-section site-solution" id="solution"><div className="site-container site-solution-inner"><div><Eyebrow>{c.solution.eyebrow}</Eyebrow><h2>{c.solution.title1}<br />{c.solution.title2}<br /><span>{c.solution.title3}</span></h2><p>{c.solution.description}</p><a className="site-text-link" href="/app">{c.solution.link} <ArrowUpRight size={18} weight="bold" /></a></div><div className="site-pipeline"><div className="site-pipeline-header"><Sparkle size={18} weight="fill" /><span>{c.solution.trust}</span><span>01—04</span></div>{c.solution.stages.map((stage, index) => <div className={`site-pipeline-row${index === 3 ? " is-future" : ""}`} key={stage.title}><span>0{index + 1}</span><strong>{stage.title}</strong><small>{stage.detail}</small>{index === 3 ? <CircleNotch size={18} /> : <Check size={18} />}</div>)}<div className="site-pipeline-end"><span className="site-pipeline-end-mark">✦</span><div><strong>{c.solution.built}</strong><small>{c.solution.edge}</small></div></div></div></div></section>;
}

function Adaptive() {
  const { copy: c } = useSite();
  const [example, setExample] = useState(0);
  return <section className="site-section site-adaptive"><div className="site-container site-adaptive-inner"><div className="site-adaptive-copy"><span className="site-soon-tag">{c.common.comingSoon}</span><Eyebrow>{c.adaptive.eyebrow}</Eyebrow><h2>{c.adaptive.title1}<br />{c.adaptive.title2} <span>{c.adaptive.title3}</span></h2><p>{c.adaptive.description}</p><div className="site-prompt-list"><span>{c.adaptive.promptLabel}</span>{c.adaptive.examples.map((item, index) => <button type="button" key={item.prompt} aria-pressed={example === index} onClick={() => setExample(index)}>“{item.prompt}” <ArrowUpRight size={15} /></button>)}</div><small className="site-concept-note">{c.adaptive.note}</small></div><div className="site-chat-frame" aria-live="polite"><div className="site-chat-top"><span><span className="site-chat-symbol">✦</span> {c.adaptive.tableContext}</span><span>{c.adaptive.concept}</span></div><div className="site-chat-content"><span className="site-chat-divider">{c.adaptive.personal}</span><div className="site-chat-user">{c.adaptive.examples[example].prompt}</div><div className="site-chat-answer"><span className="site-chat-avatar">✦</span><div><strong>Solvea <span>· {c.adaptive.preview}</span></strong><p>{c.adaptive.examples[example].response}</p></div></div><div className="site-chat-note"><Minus size={16} /> {c.adaptive.future}</div></div><div className="site-chat-input">{c.adaptive.input} <ArrowUpRight size={18} /></div></div></div></section>;
}

function Learning() {
  const { copy: c } = useSite();
  return <section className="site-section site-learning"><div className="site-container site-learning-inner"><div className="site-learning-visual"><div className="site-learning-orbit orbit-one" /><div className="site-learning-orbit orbit-two" /><div className="site-learning-card"><span>{c.learning.card}</span><strong>K7s</strong><div><span className="site-action-dot is-raise" /> {c.common.raise} <b>100%</b></div><div className="site-learning-divider" /><small><Sparkle size={15} weight="fill" /> {c.learning.explanation}</small><p>{c.learning.cardReason}</p></div>{c.learning.questions.map((question, index) => <div className={`site-question-chip chip-${["one", "two", "three"][index]}`} key={question}>{question}</div>)}</div><div className="site-learning-copy"><Eyebrow>{c.learning.eyebrow}</Eyebrow><h2>{c.learning.title1}<br /><span>{c.learning.title2}</span></h2><p>{c.learning.description}</p><div className="site-learning-feature"><CursorClick size={22} /><div><strong>{c.learning.feature1}</strong><span>{c.learning.feature1Detail}</span></div></div><div className="site-learning-feature"><Sparkle size={22} /><div><strong>{c.learning.feature2}</strong><span>{c.learning.feature2Detail}</span></div></div><small>{c.learning.note}</small></div></div></section>;
}

function Levels() {
  const { copy: c } = useSite();
  const [level, setLevel] = useState(0);
  const levels = c.levels.items;
  return <section className="site-section site-levels"><div className="site-container"><SectionHeading eyebrow={c.levels.eyebrow} title={<>{c.levels.title1}<br />{c.levels.title2}</>} description={c.levels.description} /><div className="site-levels-shell"><div className="site-level-tabs" role="tablist" aria-label={c.levels.tabLabel}>{levels.map((item, index) => <button type="button" role="tab" id={`site-level-tab-${index}`} aria-controls="site-level-panel" aria-selected={level === index} onClick={() => setLevel(index)} key={item.label}><span>0{index + 1}</span>{item.label}{index === 2 && <small>{c.common.planned}</small>}</button>)}</div><div className="site-level-panel" role="tabpanel" id="site-level-panel" aria-labelledby={`site-level-tab-${level}`}><div><span className="site-level-kicker">{levels[level].label} {c.levels.mode}</span><h3>{levels[level].headline}</h3><p>{levels[level].body}</p><a href="/app" className="site-text-link">{c.levels.link} <ArrowUpRight size={17} /></a></div><div className="site-level-demo"><span>{c.levels.sameHand}</span><div><strong>K7s</strong><span>{level === 2 ? c.levels.advanced : level === 1 ? c.levels.standard : c.levels.simple}</span></div><div className="site-level-action"><span className="site-action-dot is-raise" /> {c.common.raise} <b>{level === 0 ? "" : "100%"}</b></div>{level > 0 && <div className="site-level-bar"><span /></div>}{level === 2 && <small>{c.levels.future}</small>}</div></div></div></div></section>;
}

function Comparison() {
  const { copy: c } = useSite();
  return <section className="site-section site-comparison"><div className="site-container"><SectionHeading eyebrow={c.comparison.eyebrow} title={<>{c.comparison.title1}<br />{c.comparison.title2}</>} description={c.comparison.description} /><div className="site-comparison-grid"><div className="site-comparison-card"><div className="site-comparison-icon">∑</div><h3>{c.comparison.solver}</h3><p>{c.comparison.solverDescription}</p><ul>{c.comparison.solverFeatures.map(feature => <li key={feature}>{feature}</li>)}</ul><span>{c.comparison.solverTag}</span></div><div className="site-comparison-card is-solvea"><div className="site-comparison-icon">✦</div><h3>Solvea</h3><p>{c.comparison.solveaDescription}</p><ul>{c.comparison.solveaFeatures.map(feature => <li key={feature}>{feature}</li>)}</ul><span>{c.comparison.solveaTag}</span></div></div></div></section>;
}

function Pricing() {
  const { copy: c } = useSite();
  return <section className="site-section site-pricing" id="pricing"><div className="site-container"><SectionHeading eyebrow={c.pricing.eyebrow} title={<>{c.pricing.title1}<br /><span>{c.pricing.title2}</span></>} description={c.pricing.description} /><div className="site-pricing-grid">{c.pricing.plans.map((plan, index) => <article className={`site-price-card${index === 1 ? " is-plus" : ""}`} key={plan.name}><div className="site-price-top"><span>{plan.name.toUpperCase()}</span><span>{plan.status}</span></div><div className="site-price-number">{plan.price}<small>{plan.cadence}</small></div><p>{plan.description}</p><div className="site-price-rule" /><ul>{plan.features.map(feature => <li key={feature}><Check size={17} weight="bold" />{feature}</li>)}</ul>{plan.href ? <a href={plan.href} className="site-btn site-btn-primary">{plan.action}<ArrowUpRight size={17} weight="bold" /></a> : <span className="site-btn site-btn-disabled" aria-disabled="true">{plan.action}</span>}</article>)}</div><p className="site-pricing-note">{c.pricing.note}</p></div></section>;
}

function FinalCta() {
  const { copy: c } = useSite();
  return <section className="site-final"><div className="site-final-glow" aria-hidden="true" /><div className="site-container site-final-inner"><Eyebrow>{c.final.eyebrow}</Eyebrow><h2>{c.final.title1}<br /><span>{c.final.title2}</span></h2><p>{c.final.description}</p><a className="site-btn site-btn-primary" href="/app">{c.final.action} <ArrowUpRight size={18} weight="bold" /></a><span className="site-final-micro">{c.final.note}</span></div></section>;
}

function Footer() {
  const { copy: c } = useSite();
  return <footer className="site-footer"><div className="site-container"><div className="site-footer-top"><div><Brand inverted /><p>{c.footer.tagline}</p></div><div className="site-footer-links"><div><span>{c.footer.product}</span><a href="#how">{c.footer.how}</a><a href="#solution">AI Solution</a><a href="/app">{c.footer.open}</a></div><div><span>{c.footer.explore}</span><a href="#pricing">{c.footer.pricing}</a><a href="#why">{c.footer.about}</a><span className="site-footer-unavailable">{c.footer.privacy}</span><span className="site-footer-unavailable">{c.footer.terms}</span></div></div></div><p className="site-disclaimer">{c.footer.disclaimer}</p><div className="site-footer-bottom"><span>© {new Date().getFullYear()} Solvea</span><span>{c.footer.madeFor} <span>✦</span></span></div></div></footer>;
}

export function ServiceSite({ locale }: { locale: SiteLocale }) {
  const copy = locale === "ja" ? ja : en;
  return <SiteContext.Provider value={{ locale, copy }}><div className={`site site-${locale}`}><a className="site-skip" href="#site-main">{copy.common.skip}</a><Header /><main id="site-main"><Hero /><Problem /><HowItWorks /><SimpleStrategy /><Solution /><Adaptive /><Learning /><Levels /><Comparison /><Pricing /><FinalCta /></main><Footer /></div></SiteContext.Provider>;
}

import { useEffect, useMemo, useState } from "react";
import {
  ArrowsDownUp,
  CaretDown,
  CaretRight,
  DotsThreeVertical,
  Funnel,
  GridFour,
  MagnifyingGlass,
  Rows,
  SquaresFour,
  Stack,
} from "@phosphor-icons/react";

const RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];
const POSITIONS = ["UTG", "HJ", "CO", "BTN", "SB", "BB"];
const ACTIONS = [
  { id: "allin", label: "All-in", amount: "100", tone: "allin" },
  { id: "raise", label: "Raise", amount: "28.5", tone: "raise" },
  { id: "call", label: "Call", amount: "2.5", tone: "call" },
  { id: "fold", label: "Fold", amount: "0", tone: "fold" },
];

const TOP_ACTIONS = {
  UTG: { label: "Fold", stack: "100" },
  HJ: { label: "Fold", stack: "100" },
  CO: { label: "Fold", stack: "100" },
  BTN: { label: "Raise 2.5", stack: "100" },
  SB: { label: "Fold", stack: "99.5" },
  BB: { label: "Raise 13.5", stack: "99" },
};

const HANDS = [["As", "5s"], ["Ah", "5h"], ["Ad", "5d"], ["Ac", "5c"]];

function handLabel(row, col) {
  if (row === col) return `${RANKS[row]}${RANKS[col]}`;
  return row < col ? `${RANKS[row]}${RANKS[col]}s` : `${RANKS[col]}${RANKS[row]}o`;
}

function handMix(row, col, position, selectedAction) {
  const hand = handLabel(row, col);
  const high = RANKS.indexOf(hand[0]);
  const low = RANKS.indexOf(hand[1]);
  const pair = row === col;
  const suited = hand.endsWith("s");
  const strength = pair
    ? 0.42 + ((12 - high) / 12) * 0.52
    : Math.max(0, 1 - (high / 12) * 0.86 - (low / 12) * 0.42);
  const positionBonus = position === "BTN" ? 0.1 : position === "SB" ? -0.07 : 0;
  const raise = Math.max(0, Math.min(0.94, strength * 0.38 + (pair ? 0.24 : 0) + positionBonus - (suited ? 0 : 0.04)));
  const call = Math.max(0, Math.min(0.42, (1 - strength) * 0.28 + (suited ? 0.08 : 0)));
  const allin = pair && high < 3 ? 0.12 : pair && high < 6 ? 0.04 : 0;
  const fold = Math.max(0, 1 - raise - call - allin);
  const frequencies = { allin, raise, call, fold };
  if (selectedAction && selectedAction !== "all") return frequencies[selectedAction] ?? 0;
  return frequencies;
}

function aggregateMix(position) {
  const positionAdjustment = position === "SB" ? -0.02 : position === "BB" ? 0.02 : 0;
  const raise = Math.max(0, 0.151 + positionAdjustment);
  const call = Math.max(0, 0.142 + positionAdjustment * 0.35);
  const fold = Math.max(0, 1 - raise - call);
  return { allin: 0, raise, call, fold };
}

function liveMixForHand(solutionNode, hand, position, selectedAction) {
  if (solutionNode && position === "BB") {
    const aggregate = solutionNode.handAggregates?.find((entry) => entry.hand === hand);
    if (aggregate) {
      const frequencies = { allin: 0, raise: 0, call: aggregate.actions.call ?? 0, fold: aggregate.actions.fold ?? 0 };
      for (const [action, frequency] of Object.entries(aggregate.actions)) {
        if (action.startsWith("raise_")) frequencies.raise += frequency;
        if (action === "all_in") frequencies.allin += frequency;
      }
      return selectedAction === "all" ? frequencies : frequencies[selectedAction] ?? 0;
    }
  }
  const row = RANKS.indexOf(hand[0]);
  const col = RANKS.indexOf(hand[1]);
  return handMix(row, col, position, selectedAction);
}

function percent(value) {
  return `${(value * 100).toFixed(value * 100 < 10 ? 1 : 0)}%`;
}

function App() {
  const [activePosition, setActivePosition] = useState("BTN");
  const [activeTab, setActiveTab] = useState("Strategy");
  const [selectedHand, setSelectedHand] = useState("A5s");
  const [selectedAction, setSelectedAction] = useState("all");
  const [rangeMode, setRangeMode] = useState("grid");
  const [showFilters, setShowFilters] = useState(false);
  const [inspectorTab, setInspectorTab] = useState("Overview");
  const [handsTab, setHandsTab] = useState("Hands");
  const [apiStatus, setApiStatus] = useState("mock");
  const [solutionNode, setSolutionNode] = useState(null);

  useEffect(() => {
    let active = true;
    fetch("/api/v1/preflop/solutions")
      .then((response) => {
        if (!response.ok) throw new Error("API unavailable");
        return response.json();
      })
      .then(async (solutions) => {
        if (!active || solutions.length === 0) return;
        const solutionId = solutions[solutions.length - 1].solutionId;
        const response = await fetch("/api/v1/preflop/resolve", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            solutionId,
            heroPosition: "BB",
            actions: [{ position: "BTN", action: "raise", sizeBb: 2.5 }],
          }),
        });
        if (!response.ok) throw new Error("Unable to resolve saved spot");
        const resolved = await response.json();
        if (active) {
          setSolutionNode(resolved.node);
          setApiStatus("connected");
        }
      })
      .catch(() => {
        if (active) setApiStatus("mock");
      });
    return () => { active = false; };
  }, []);

  const selectedMix = useMemo(() => {
    return liveMixForHand(solutionNode, selectedHand, activePosition, "all");
  }, [activePosition, selectedHand, solutionNode]);
  const spotMix = useMemo(() => aggregateMix(activePosition), [activePosition]);

  const chooseAction = (action) => setSelectedAction((current) => (current === action ? "all" : action));

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="utility-cluster">
          <button className="icon-button" aria-label="Switch table view"><ArrowsDownUp size={20} weight="bold" /></button>
          <button className="icon-button" aria-label="More options"><DotsThreeVertical size={22} weight="bold" /></button>
        </div>
        <div className="game-pill"><span>Cash</span><strong>100bb</strong></div>
        <div className="action-rail" aria-label="Action history">
          {POSITIONS.map((position) => (
            <button className={`history-chip ${activePosition === position ? "is-active" : ""}`} key={position} onClick={() => setActivePosition(position)}>
              <span className="chip-position">{position}</span>
              <span className="chip-stack">{TOP_ACTIONS[position].stack}</span>
              <span className={`chip-action ${TOP_ACTIONS[position].label.includes("Raise") ? "is-raise" : ""}`}>{TOP_ACTIONS[position].label}</span>
            </button>
          ))}
        </div>
        <div className="hero-turn"><strong>{activePosition}</strong><span>{TOP_ACTIONS[activePosition].stack}</span><span>Take action</span></div>
      </header>

      <div className="workspace">
        <section className="range-column">
          <div className="content-tabs">
            {["Strategy", "Ranges", "Breakdown"].map((tab) => (
              <button className={activeTab === tab ? "is-selected" : ""} key={tab} onClick={() => setActiveTab(tab)}>
                {tab}{tab === "Strategy" && <CaretDown size={14} weight="bold" />}
              </button>
            ))}
            <button className="report-tab" onClick={() => setActiveTab("Reports")}>Reports: Flops <CaretDown size={14} weight="bold" /></button>
            <span className="sample-count">3/100 <span aria-label="Information">?</span></span>
            <div className="view-actions">
              <button aria-label="Overview mode"><Stack size={16} weight="bold" /></button>
              <button aria-label="Range mode"><SquaresFour size={16} weight="bold" /></button>
              <button className={rangeMode === "grid" ? "is-active" : ""} aria-label="Grid mode" onClick={() => setRangeMode("grid")}><GridFour size={16} weight="bold" /></button>
              <button className={rangeMode === "rows" ? "is-active" : ""} aria-label="List mode" onClick={() => setRangeMode("rows")}><Rows size={16} weight="bold" /></button>
            </div>
          </div>

          {activeTab === "Strategy" && rangeMode === "grid" ? (
            <div className="range-grid" role="grid" aria-label="169 hand range matrix">
              {RANKS.map((_, row) => RANKS.map((__, col) => {
                const hand = handLabel(row, col);
                const mix = liveMixForHand(solutionNode, hand, activePosition, selectedAction);
                const frequencies = liveMixForHand(solutionNode, hand, activePosition, "all");
                const selected = selectedHand === hand;
                return (
                  <button
                    className={`range-cell ${selected ? "is-picked" : ""} ${frequencies.raise > 0.55 ? "strong" : ""}`}
                    key={hand}
                    onClick={() => setSelectedHand(hand)}
                    style={{
                      "--fold-pct": `${frequencies.fold * 100}%`,
                      "--call-pct": `${frequencies.call * 100}%`,
                      "--raise-pct": `${frequencies.raise * 100}%`,
                      "--allin-pct": `${frequencies.allin * 100}%`,
                      "--action-focus": selectedAction === "all" ? "transparent" : `color-mix(in srgb, var(--${selectedAction}-color) 72%, transparent)`,
                    }}
                    role="gridcell"
                  >
                    <span>{hand}</span>{selectedAction !== "all" && <small>{percent(mix)}</small>}
                  </button>
                );
              }))}
            </div>
          ) : (
            <div className="alternate-view">
              <div className="alternate-icon"><SquaresFour size={22} weight="duotone" /></div>
              <strong>{activeTab} view</strong>
              <p>Switch back to Strategy to inspect the combo-frequency matrix.</p>
            </div>
          )}
        </section>

        <aside className="inspector">
          <div className="spot-header">
            <div className="spot-tabs">{["Overview", "Table", "Equity chart"].map((tab) => <button className={inspectorTab === tab ? "is-selected" : ""} key={tab} onClick={() => setInspectorTab(tab)}>{tab}</button>)}</div>
            <div className="seat-summary">
              {POSITIONS.map((position) => <button className={position === activePosition ? "is-active" : ""} key={position} onClick={() => setActivePosition(position)}><strong>{position}</strong><span>{TOP_ACTIONS[position].stack}</span></button>)}
              <div className="pot-summary"><strong>16.5 BB</strong><span>1.5 BB</span><small>Pot odds: 40%</small></div>
            </div>
          </div>

          {inspectorTab === "Overview" ? <div className="action-section">
            <div className="section-title"><span>Actions</span><CaretDown size={15} weight="bold" /></div>
            <div className="action-grid">
              {ACTIONS.map((action) => {
                const row = RANKS.indexOf(selectedHand[0]);
                const col = RANKS.indexOf(selectedHand[1]);
                const frequency = spotMix[action.id];
                const comboCount = selectedHand.length === 2 ? 6 : selectedHand.endsWith("s") ? 4 : 12;
                const combos = (frequency * comboCount).toFixed(2);
                return (
                  <button className={`action-card ${action.tone} ${selectedAction === action.id ? "is-selected" : ""}`} key={action.id} onClick={() => chooseAction(action.id)}>
                    <span className="action-label">{action.label} <strong>{action.amount}</strong></span>
                    <span className="action-value">{percent(frequency)}</span>
                    <span className="action-combos">{combos}<small> combos</small></span>
                  </button>
                );
              })}
            </div>
            <div className="action-bar" aria-label="Action mix">{ACTIONS.slice().reverse().map((action) => <span key={action.id} className={action.tone} style={{ flex: Math.max(0.02, spotMix[action.id]) }} />)}</div>
          </div> : <div className="inspector-alternate"><div className="alternate-icon"><SquaresFour size={22} weight="duotone" /></div><strong>{inspectorTab}</strong><p>Select Overview to inspect action frequencies.</p></div>}

          <div className="hands-section">
            <div className="hands-header">
              <div className="hands-tabs"><button className={handsTab === "Hands" ? "is-selected" : ""} onClick={() => setHandsTab("Hands")}>Hands</button><button className={handsTab === "Summary" ? "is-selected" : ""} onClick={() => setHandsTab("Summary")}>Summary</button></div>
              <button className={showFilters ? "is-filter-active" : ""} onClick={() => setShowFilters((visible) => !visible)}><Funnel size={15} weight="bold" /> Filters</button>
              <button><MagnifyingGlass size={15} weight="bold" /> Blockers</button>
            </div>
            {showFilters && <div className="filter-row"><span>Selected: {selectedHand}</span><button onClick={() => setSelectedAction("all")}>Clear action filter</button></div>}
            {handsTab === "Hands" ? <div className="combo-grid">{HANDS.map(([first, second], index) => <ComboCard first={first} second={second} index={index} selectedAction={selectedAction} key={`${first}${second}`} />)}</div> : <div className="hands-summary"><strong>{selectedHand}</strong><span>4 combos in this suited class</span><div><b>Raise</b><span>{percent(selectedMix.raise)}</span></div><div><b>Call</b><span>{percent(selectedMix.call)}</span></div><div><b>Fold</b><span>{percent(selectedMix.fold)}</span></div></div>}
          </div>
        </aside>
      </div>

      <footer className="statusbar">
        <span><span className={`status-dot ${apiStatus === "connected" ? "connected" : ""}`} />{apiStatus === "connected" ? "Saved solution connected" : "Preview data · API ready"}</span>
        <span>cash-6max-100bb-v1 <CaretRight size={13} weight="bold" /></span>
      </footer>
    </main>
  );
}

function ComboCard({ first, second, index, selectedAction }) {
  const values = [0, 0, 0, 1];
  const actions = ["All-in 100", "Raise 28.5", "Call", "Fold"];
  return (
    <article className={`combo-card ${index === 0 ? "is-featured" : ""}`}>
      <div className="combo-head"><span className="cards"><b className={index === 1 ? "red" : ""}>{first}</b><b className={index === 1 ? "red" : ""}>{second}</b><i>◆</i></span><span>%</span></div>
      <div className="combo-body">{actions.map((label, actionIndex) => <div className={selectedAction !== "all" && selectedAction !== ["allin", "raise", "call", "fold"][actionIndex] ? "is-muted" : ""} key={label}><span>{label}</span><strong>{values[actionIndex]}</strong></div>)}</div>
    </article>
  );
}

export { App };

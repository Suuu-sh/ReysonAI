import { useMemo, useState } from "react";
import { App } from "../App.jsx";
import { AppFooter, Sidebar } from "../components/layout.jsx";
import { StrategyMatrix } from "../components/StrategyMatrix.jsx";
import { ActionBars, Field, Panel, SectionHeading, StatList, StatusState } from "../components/primitives.jsx";
import source from "./preflop-ranges.json";
import downloadUrl from "./preflop-ranges.json?url";
import { availableHeroes, findSpot, matrixModel, positions, validateDataset } from "./ranges.js";
import "./ranges.css";

let dataset;
let dataError;
try { dataset = validateDataset(source); } catch (error) { dataError = error.message; }

function EstimatedRanges() {
  const [opener, setOpener] = useState("BTN");
  const [hero, setHero] = useState("BB");
  const [selected, setSelected] = useState("AKo");
  const [filter, setFilter] = useState("all");
  const spot = dataset ? findSpot(dataset, opener, hero) : null;
  const model = useMemo(() => spot ? matrixModel(spot) : null, [spot]);
  const hand = spot?.hands.find(row => row.hand === selected);
  function changeOpener(value) {
    setOpener(value);
    if (!availableHeroes(value).includes(hero)) setHero(availableHeroes(value)[0]);
    setFilter("all");
  }

  return <div className="shell">
    <Sidebar activeSection="プリフロップ" onSectionChange={() => {}} />
    <main>
      {dataError ? <StatusState tone="error">{dataError}</StatusState> : <>
        <Panel className="estimate-settings">
          <div><h2>推定レンジ</h2><small>6max Cash · 100BB · Open 2.5BB</small></div>
          <Field label="オープナー"><select value={opener} onChange={e => changeOpener(e.target.value)}>
            {positions.slice(0, -1).map(p => <option key={p}>{p}</option>)}
          </select></Field>
          <Field label="Hero"><select value={hero} onChange={e => { setHero(e.target.value); setFilter("all"); }}>
            {availableHeroes(opener).map(p => <option key={p}>{p}</option>)}
          </select></Field>
          <a href={downloadUrl} download="preflop-ranges.json">JSONを保存</a>
        </Panel>
        <div className="estimate-context">
          <strong>{hero} vs {opener} · {spot.hero_position_vs_opener}</strong>
          <span>全15局面 / 各169ハンド · AI推定・GTO計算なし</span>
        </div>
        <div className="results estimate-results">
          <StrategyMatrix node={{ actingPosition: hero }} aggregates={model.aggregates} actions={model.actions}
            selected={selected} filter={filter} onSelect={setSelected} onFilterChange={setFilter} />
          <div className="detail-column">
            <Panel>
              <SectionHeading title="選択ハンド" />
              <div className="hand-title"><strong>{selected}</strong><span>{model.aggregates.get(selected).comboCount} Combos</span></div>
              <ActionBars items={model.actions.map(action => ({ action, frequency: model.aggregates.get(selected).actions[action] }))} />
              <StatList items={[
                { label: "3betサイズ（合計）", value: hand.three_bet_size_bb === null ? "—（3betなし）" : `${hand.three_bet_size_bb} BB` },
                { label: "頻度合計", value: `${hand.fold + hand.call + hand.three_bet}%` },
              ]} />
            </Panel>
            <Panel className="ai-reason-copy"><SectionHeading title="この配分の理由" /><p>{hand.reason}</p></Panel>
            <Panel className="estimate-notes">
              <SectionHeading title="データの条件" />
              <small>Heroまで他のプレイヤーは全員フォールド。UTGはオープナーのみ。レーキ未調整・アンティ未モデル化。頻度は5%刻みの概算です。</small>
              {hero === "SB" && <p><small>SBは3bet-or-foldに簡略化しています。</small></p>}
              <details><summary>選択ハンドのJSON</summary><pre>{JSON.stringify(hand, null, 2)}</pre></details>
            </Panel>
          </div>
        </div>
      </>}
      <AppFooter />
    </main>
  </div>;
}

export function RangeWorkspace() {
  const [view, setView] = useState("estimate");
  return <div className="range-workspace">
    <nav className="range-source-switch" aria-label="レンジの表示元">
      <button aria-pressed={view === "estimate"} onClick={() => setView("estimate")}>推定レンジ（JSON）</button>
      <button aria-pressed={view === "api"} onClick={() => setView("api")}>既存のAPI表示</button>
    </nav>
    {view === "estimate" ? <EstimatedRanges /> : <App />}
  </div>;
}

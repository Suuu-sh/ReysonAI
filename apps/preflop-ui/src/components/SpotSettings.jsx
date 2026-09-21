import { ArrowClockwise } from "@phosphor-icons/react";
import { OPEN_SIZE_BB, positions, presets, responders, solutionStackBb, STACK_OPTIONS, spotModes } from "../spot.js";
import { Field, Panel } from "./primitives.jsx";

export function SpotSettings({
  solutions,
  solutionId,
  spot,
  stackBb,
  loading,
  validation,
  onSolutionChange,
  onStackChange,
  onSpotChange,
  onDisplay,
}) {
  const allowedResponders = responders(spot.opener);

  function updateSpot(next) {
    onSpotChange(next);
  }

  return (
    <Panel className="settings matchup-settings">
      <div className="solution-setting">
        <h3>保存済みSolution</h3>
        <Field label="計算結果">
          <select aria-label="Solution" value={solutionId} onChange={event => onSolutionChange(event.target.value)} disabled={!solutions.length}>
            {!solutions.length && <option value="">保存済み結果なし</option>}
            {!solutionId && solutions.length > 0 && <option value="">このスタックの保存済み結果なし</option>}
            {solutions.map(solution => <option key={solution.solutionId} value={solution.solutionId}>{solution.solutionId}</option>)}
          </select>
        </Field>
        <Field label="所持スタック">
          <select aria-label="所持スタック" value={stackBb} onChange={event => onStackChange(Number(event.target.value))}>
            {STACK_OPTIONS.map(option => {
              const available = solutions.some(solution => solutionStackBb(solution) === option);
              return <option key={option} value={option}>{option} BB{available ? "" : "（未計算）"}</option>;
            })}
          </select>
        </Field>
        <small>APIから取得 · 閲覧時の計算なし</small>
      </div>

      <div className="spot-setting">
        <div className="spot-heading">
          <h3>局面設定</h3>
          <small>オープンサイズ：{OPEN_SIZE_BB} BB固定</small>
        </div>
        <div className="spot-fields">
          <Field label="局面タイプ">
            <select aria-label="局面タイプ" value={spot.mode} onChange={event => updateSpot({ ...spot, mode: event.target.value })}>
              {spotModes.map(mode => <option key={mode.id} value={mode.id}>{mode.label}</option>)}
            </select>
          </Field>
          <Field label="オープン位置">
            <select aria-label="オープン位置" value={spot.opener} onChange={event => {
              const opener = event.target.value;
              const allowed = responders(opener);
              updateSpot({ ...spot, opener, actor: allowed.includes(spot.actor) ? spot.actor : allowed[0] });
            }}>
              {positions.slice(0, -1).map(position => <option key={position}>{position}</option>)}
            </select>
          </Field>
          <Field label={spot.mode === "open" ? "対応位置" : "3bettor位置"}>
            <select aria-label="相手位置" value={spot.actor} onChange={event => updateSpot({ ...spot, actor: event.target.value })}>
              {allowedResponders.map(position => <option key={position}>{position}</option>)}
            </select>
          </Field>
        </div>
        <div className="spot-presets" aria-label="局面プリセット">
          {presets.map((preset, index) => {
            const isSelected = spot.mode === preset.mode && spot.opener === preset.opener && spot.actor === preset.actor;
            const label = preset.mode === "open"
              ? `${preset.opener} vs ${preset.actor}`
              : `${preset.opener} → ${preset.actor} ${preset.mode === "three_bet" ? "3bet" : "4bet"}`;
            return <button key={`${preset.mode}-${preset.opener}-${preset.actor}-${index}`} aria-pressed={isSelected} onClick={() => updateSpot({ ...spot, ...preset })}>{label}</button>;
          })}
        </div>
      </div>

      <button className="primary display-button" onClick={onDisplay} disabled={Boolean(loading) || Boolean(validation)}>
        <ArrowClockwise size={17} />
        局面を表示
      </button>
    </Panel>
  );
}

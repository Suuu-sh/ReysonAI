import { ArrowClockwise } from "@phosphor-icons/react";
import { OPEN_SIZE_BB, positions, presets, responders, solutionStackBb, STACK_OPTIONS, spotModes } from "../spot.js";
import { Field, Panel } from "./primitives.jsx";

export function SpotSettings({
  solutions,
  spot,
  stackBb,
  loading,
  validation,
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
      <div className="range-setting">
        <h3>推定レンジ</h3>
        <Field label="有効スタック">
          <select aria-label="有効スタック" value={stackBb} onChange={event => onStackChange(Number(event.target.value))}>
            {STACK_OPTIONS.map(option => {
              const available = solutions.some(solution => solutionStackBb(solution) === option);
              return <option key={option} value={option}>{option} BB{available ? "" : "（未提供）"}</option>;
            })}
          </select>
        </Field>
        <small>提供済みの推定データから取得 · 閲覧時の計算なし</small>
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

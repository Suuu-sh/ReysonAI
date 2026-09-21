import { label, pct } from "../data.js";
import { Panel } from "./primitives.jsx";

export function ComboTable({ selected, combos, tab, section }) {
  if (!combos.length || (tab !== "Combo別EV" && section !== "ハンド詳細")) return null;

  return (
    <Panel className="combo-table">
      <h2>{selected} · Combo別の頻度とEV</h2>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Combo</th>
              {combos[0]?.actions.map(action => <th key={action.action}>{label(action.action)}<small>頻度 / EV (BB)</small></th>)}
            </tr>
          </thead>
          <tbody>
            {combos.map(combo => (
              <tr key={combo.combo}>
                <th>{combo.combo}</th>
                {combo.actions.map(action => <td key={action.action}>{pct(action.frequency)}{Number.isFinite(action.evBb) && <> / {action.evBb.toFixed(3)}</>}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

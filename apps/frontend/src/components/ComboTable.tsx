import { label, pct, sortActions } from "../data.ts";
import { Panel } from "./primitives.tsx";

export function ComboTable({ selected, combos }) {
  if (!combos.length) return null;
  const columns = sortActions(combos[0]?.actions ?? []);

  return (
    <details className="combo-disclosure">
      <summary>Combo別EVを表示 · {selected}</summary>
      <Panel className="combo-table">
        <h2>{selected} · Combo別の頻度とEV</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Combo</th>
                {columns.map(action => <th key={action.action}>{label(action.action)}<small>頻度 / EV (BB)</small></th>)}
              </tr>
            </thead>
            <tbody>
              {combos.map(combo => (
                <tr key={combo.combo}>
                  <th>{combo.combo}</th>
                  {sortActions(combo.actions).map(action => <td key={action.action}>{pct(action.frequency)}{Number.isFinite(action.evBb) && <> / {action.evBb.toFixed(3)}</>}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </details>
  );
}

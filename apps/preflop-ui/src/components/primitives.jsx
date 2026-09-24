import { label, color, pct } from "../data.js";

export function Panel({ children, className = "", ...props }) {
  return <section className={`panel ${className}`.trim()} {...props}>{children}</section>;
}

export function SectionHeading({ title, action, className = "" }) {
  return (
    <div className={`panel-heading ${className}`.trim()}>
      <h2>{title}</h2>
      {action}
    </div>
  );
}

// Matrix cells keep fold near the background on purpose; bars sit on a dark track, so fold needs contrast there.
const barColor = action => action === "fold" ? "#6e6e78" : color(action);

export function ActionBars({ items, labels = {} }) {
  if (!items.length) return null;

  return (
    <div className="bars">
      {items.map((item, index) => (
        <div className="bar-row" key={item.action} style={{ "--i": index }}>
          <span><i style={{ background: barColor(item.action) }} />{labels[item.action] ?? label(item.action)}</span>
          <div className="track" aria-hidden="true">
            <div style={{ width: pct(item.frequency), background: barColor(item.action) }} />
          </div>
          <b>{pct(item.frequency)}</b>
        </div>
      ))}
    </div>
  );
}

export function StatList({ items, className = "" }) {
  return (
    <dl className={`stat-list ${className}`.trim()}>
      {items.map(({ label: itemLabel, value }) => (
        <div className="stat-row" key={itemLabel}>
          <dt>{itemLabel}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function StatusState({ title, children, tone = "neutral", action }) {
  return (
    <div className={`state state-${tone}`} role={tone === "error" ? "alert" : "status"}>
      {title && <h2>{title}</h2>}
      {children && <div className="state-content">{children}</div>}
      {action}
    </div>
  );
}

export function Field({ label: fieldLabel, hint, children }) {
  return (
    <label className="field">
      <span className="field-label">{fieldLabel}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

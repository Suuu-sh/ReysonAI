import type { ComponentPropsWithoutRef, CSSProperties, ReactNode } from "react";
import { label, color, pct } from "./action-format.ts";

export type PanelProps = ComponentPropsWithoutRef<"section">;

export type SectionHeadingProps = {
  title?: ReactNode;
  action?: ReactNode;
  className?: string;
};

export type ActionBarItem = {
  action: string;
  frequency?: number | null;
};

export type ActionBarsProps = {
  items: readonly ActionBarItem[];
  labels?: Readonly<Record<string, ReactNode>>;
};

export type StatListProps = {
  items: readonly { label: string; value: ReactNode }[];
  className?: string;
};

export type StatusStateProps = {
  title?: ReactNode;
  children?: ReactNode;
  tone?: string;
  action?: ReactNode;
};

export type FieldProps = {
  label?: ReactNode;
  hint?: ReactNode;
  children?: ReactNode;
};

type BarStyle = CSSProperties & { "--i": number };
const barStyle = (index: number): BarStyle => ({ "--i": index });

export function Panel({ children, className = "", ...props }: PanelProps) {
  return <section className={`panel ${className}`.trim()} {...props}>{children}</section>;
}

export function SectionHeading({ title, action, className = "" }: SectionHeadingProps) {
  return (
    <div className={`panel-heading ${className}`.trim()}>
      <h2>{title}</h2>
      {action}
    </div>
  );
}

// Matrix cells keep fold near the background on purpose; bars sit on a dark track, so fold needs contrast there.
export const barColor = (action: string): string => action === "fold" ? "#6e6e78" : color(action);

export function ActionBars({ items, labels = {} }: ActionBarsProps) {
  if (!items.length) return null;

  return (
    <div className="bars">
      {items.map((item, index) => (
        <div className="bar-row" key={item.action} style={barStyle(index)}>
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

export function StatList({ items, className = "" }: StatListProps) {
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

export function StatusState({ title, children, tone = "neutral", action }: StatusStateProps) {
  return (
    <div className={`state state-${tone}`} role={tone === "error" ? "alert" : "status"}>
      {title && <h2>{title}</h2>}
      {children && <div className="state-content">{children}</div>}
      {action}
    </div>
  );
}

export function Field({ label: fieldLabel, hint, children }: FieldProps) {
  return (
    <label className="field">
      <span className="field-label">{fieldLabel}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

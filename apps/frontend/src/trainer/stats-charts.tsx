// Shared Stats panels: metric tiles with sparklines, time-series lines with a crosshair, stacked
// columns and diverging bars. Presentation only — callers pass already-computed values, so each
// Stats scope keeps its own data source, classifier and meaning.
import { useId, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import type { Icon } from "@phosphor-icons/react";
import { Info } from "@phosphor-icons/react";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

// Long method notes stay available but out of the way.
export function InfoTip({ label = "説明", children }: { label?: string; children: ReactNode }) {
  return <details className="analysis-info">
    <summary aria-label={label} title={label}><Info size={14} /></summary>
    <div className="analysis-info-body">{children}</div>
  </details>;
}

export function PanelHead({ id, title, caption, info, children }: { id?: string; title: ReactNode; caption?: ReactNode; info?: ReactNode; children?: ReactNode }) {
  return <header className="analysis-card-head">
    <h2 id={id}>{title}</h2>
    {caption && <span className="analysis-caption">{caption}</span>}
    {children}
    {info}
  </header>;
}

// Clean axis ticks between min and max (about `count` steps).
export function niceTicks(min: number, max: number, count = 4, integer = false) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  if (min === max) { min -= 1; max += 1; }
  const raw = (max - min) / count, power = 10 ** Math.floor(Math.log10(raw));
  const step = Math.max(integer ? 1 : 0, [1, 2, 2.5, 5, 10].map(f => f * power).find(s => s >= raw && (!integer || Number.isInteger(s))) ?? raw);
  const ticks = [];
  for (let v = Math.floor(min / step) * step; v <= max + step * 1e-6; v += step) ticks.push(Math.round(v / step) * step);
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}

// Evenly thinned copy of a long series, always keeping the last point.
export function thin<T>(values: T[], limit = 48) {
  if (values.length <= limit) return values;
  const step = (values.length - 1) / (limit - 1);
  return Array.from({ length: limit }, (_, i) => values[Math.round(i * step)]);
}

export function Sparkline({ values, kind = "line", min, max }: { values: number[]; kind?: "line" | "bars"; min?: number; max?: number }) {
  if (values.length < (kind === "bars" ? 1 : 2)) return null;
  const lo = min ?? Math.min(...values), hi = max ?? Math.max(...values), span = hi - lo || 1;
  const y = (v: number) => 28 - (clamp(v, lo, hi) - lo) / span * 26;
  if (kind === "bars") {
    const w = 100 / values.length;
    return <svg className="stats-spark is-bars" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
      {values.map((v, i) => <rect key={i} className={i === values.length - 1 ? "is-last" : ""} x={i * w + w * .15} width={w * .7} y={v > 0 ? y(v) : 28} height={v > 0 ? Math.max(1.5, 28 - y(v)) : 0} />)}
      <line x1="0" x2="100" y1="29.5" y2="29.5" />
    </svg>;
  }
  const points = values.map((v, i) => `${(i / (values.length - 1) * 100).toFixed(2)},${y(v).toFixed(2)}`).join(" ");
  return <svg className="stats-spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
    <polygon points={`0,30 ${points} 100,30`} />
    <polyline points={points} />
  </svg>;
}

// A single-stat panel: label, value, optional delta/sub line and a sparkline.
export function StatPanel({ label, icon: IconTag, value, sub, accent, spark, className = "", children }: {
  label: ReactNode; icon?: Icon; value: ReactNode; sub?: ReactNode; accent?: boolean; spark?: ReactNode; className?: string; children?: ReactNode;
}) {
  return <div className={`analysis-kpi stats-panel${accent ? " accent" : ""}${className ? ` ${className}` : ""}`}>
    <span className="analysis-kpi-label">{IconTag && <i aria-hidden="true"><IconTag size={13} /></i>}{label}</span>
    <strong>{value}</strong>
    {sub && <small>{sub}</small>}
    {children}
    {spark && <span className="stats-panel-spark">{spark}</span>}
  </div>;
}

export type TimeSeriesLine = { id: string; label: string; values: number[]; className?: string; area?: boolean };

// Time-series panel body: y ticks, hairline grid, one or more lines and a crosshair that snaps to the
// nearest point on pointer or arrow keys. The summary row lists min / avg / max / last per series.
export function TimeSeries({ series, min, max, ticks, format, xLabel, ariaLabel, zero, height = 150, svgClassName, summary = true, summaryLabels }: {
  series: TimeSeriesLine[]; min?: number; max?: number; ticks?: number[]; format: (value: number) => string; xLabel: (index: number) => string;
  ariaLabel: string; zero?: boolean; height?: number; svgClassName?: string; summary?: boolean; summaryLabels: [string, string, string, string];
}) {
  const fillId = `ts-fill-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const [hover, setHover] = useState<number | null>(null);
  const length = Math.max(0, ...series.map(line => line.values.length));
  const all = series.flatMap(line => line.values);
  const axis = ticks ?? niceTicks(Math.min(min ?? Infinity, ...all, zero ? 0 : Infinity), Math.max(max ?? -Infinity, ...all, zero ? 0 : -Infinity));
  const lo = min ?? axis[0], hi = max ?? axis[axis.length - 1], span = hi - lo || 1;
  const x = (i: number) => length <= 1 ? 50 : i / (length - 1) * 100;
  const y = (v: number) => 100 - (clamp(v, lo, hi) - lo) / span * 100;
  const pick = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width) setHover(Math.round(clamp((event.clientX - rect.left) / rect.width, 0, 1) * (length - 1)));
  };
  const keys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    setHover(index => clamp((index ?? length - 1) + (event.key === "ArrowLeft" ? -1 : 1), 0, length - 1));
  };
  const at = hover ?? null;
  const middle = Math.floor((length - 1) / 2);
  const yWidth = Math.max(26, Math.max(...axis.map(tick => format(tick).length)) * 6 + 8);
  return <figure className="stats-ts" style={{ "--ts-y": `${yWidth}px` } as CSSProperties}>
    <div className="stats-ts-frame" style={{ height } as CSSProperties}>
      <div className="stats-ts-y" aria-hidden="true">{axis.map(tick => <span key={tick} style={{ top: `${y(tick)}%` }}>{format(tick)}</span>)}</div>
      <div className="stats-ts-plot" tabIndex={length ? 0 : -1} onPointerMove={pick} onPointerLeave={() => setHover(null)} onKeyDown={keys} onBlur={() => setHover(null)}>
        <svg className={svgClassName} viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={ariaLabel}>
          <defs><linearGradient id={fillId} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="currentColor" stopOpacity=".16" /><stop offset="1" stopColor="currentColor" stopOpacity="0" /></linearGradient></defs>
          {axis.map(tick => <line key={tick} className="grid" x1="0" x2="100" y1={y(tick)} y2={y(tick)} />)}
          {zero && lo < 0 && hi > 0 && <line className="zero" x1="0" x2="100" y1={y(0)} y2={y(0)} />}
          {series.map(line => {
            const points = line.values.map((v, i) => `${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(" ");
            const base = zero && lo < 0 ? y(0) : 100;
            return <g key={line.id} className={`stats-ts-series series-${line.id}`}>
              {line.area !== false && line.values.length > 1 && <polygon className="area" style={{ fill: `url(#${fillId})` }} points={`${x(0)},${base} ${points} ${x(line.values.length - 1)},${base}`} />}
              {line.values.length > 1 && <polyline className={line.className} points={points} pathLength="1" />}
            </g>;
          })}
        </svg>
        {series.map(line => line.values.length > 0 && <i key={line.id} className={`stats-ts-dot series-${line.id}`} aria-hidden="true"
          style={{ left: `${x(line.values.length - 1)}%`, top: `${y(line.values.at(-1)!)}%` }} />)}
        {at != null && <>
          <span className="stats-ts-cross" aria-hidden="true" style={{ left: `${x(at)}%` }} />
          {series.map(line => line.values[at] != null && <i key={line.id} className={`stats-ts-dot is-hover series-${line.id}`} aria-hidden="true" style={{ left: `${x(at)}%`, top: `${y(line.values[at])}%` }} />)}
          <div className={`stats-ts-tip${x(at) > 70 ? " is-left" : ""}`} role="status" style={{ left: `${x(at)}%` }}>
            <small>{xLabel(at)}</small>
            {series.map(line => line.values[at] != null && <span key={line.id}><i className={`series-${line.id}`} /><b>{format(line.values[at])}</b>{series.length > 1 && line.label}</span>)}
          </div>
        </>}
      </div>
    </div>
    <figcaption className="stats-ts-x" aria-hidden="true">
      <span>{length ? xLabel(0) : ""}</span>{length > 2 && <span>{xLabel(middle)}</span>}<span>{length > 1 ? xLabel(length - 1) : ""}</span>
    </figcaption>
    {summary && length > 0 && <dl className="stats-ts-summary">{series.map(line => {
      const values = line.values, avg = values.reduce((sum, v) => sum + v, 0) / values.length;
      return <div key={line.id}>
        {series.length > 1 && <dt><i className={`series-${line.id}`} />{line.label}</dt>}
        {([[summaryLabels[0], Math.min(...values)], [summaryLabels[1], avg], [summaryLabels[2], Math.max(...values)], [summaryLabels[3], values.at(-1)!]] as [string, number][]).map(([name, value]) =>
          <dd key={name}><small>{name}</small>{format(value)}</dd>)}
      </div>;
    })}</dl>}
  </figure>;
}

export type ColumnKey = { id: string; label: string };

// Stacked columns (e.g. answers per day by result). Each column is its own hover/focus target.
export function StackedColumns({ buckets, keys, ariaLabel, height = 150, unit = "" }: {
  buckets: { label: string; parts: number[] }[]; keys: ColumnKey[]; ariaLabel: string; height?: number; unit?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const top = Math.max(1, ...buckets.map(bucket => bucket.parts.reduce((a, b) => a + b, 0)));
  const axis = niceTicks(0, top, 3, true), hi = axis[axis.length - 1];
  const totals = keys.map((_, k) => buckets.reduce((sum, bucket) => sum + (bucket.parts[k] ?? 0), 0));
  return <figure className="stats-cols" role="group" aria-label={ariaLabel}>
    <div className="stats-ts-frame" style={{ height } as CSSProperties}>
      <div className="stats-ts-y" aria-hidden="true">{axis.map(tick => <span key={tick} style={{ top: `${100 - tick / hi * 100}%` }}>{tick}</span>)}</div>
      <div className="stats-cols-plot" onPointerLeave={() => setHover(null)}>
        {axis.map(tick => <span key={tick} className="stats-cols-grid" style={{ top: `${100 - tick / hi * 100}%` }} aria-hidden="true" />)}
        {buckets.map((bucket, index) => {
          const total = bucket.parts.reduce((a, b) => a + b, 0);
          const text = `${bucket.label}: ${total}${unit}${total ? ` (${keys.map((key, k) => `${key.label} ${bucket.parts[k]}`).join(", ")})` : ""}`;
          return <div key={bucket.label} className={`stats-col${hover === index ? " is-hover" : ""}`} tabIndex={0} aria-label={text}
            onPointerEnter={() => setHover(index)} onFocus={() => setHover(index)} onBlur={() => setHover(null)}>
            <span className="stats-col-stack" style={{ height: `${total / hi * 100}%` }}>
              {bucket.parts.map((part, k) => part > 0 && <i key={keys[k].id} className={`part-${keys[k].id}`} style={{ flexGrow: part }} />)}
            </span>
            {hover === index && <span className={`stats-ts-tip${index > buckets.length * .65 ? " is-left" : ""}`} role="status">
              <small>{bucket.label}</small><span><b>{total}{unit}</b></span>
              {keys.map((key, k) => <span key={key.id}><i className={`part-${key.id}`} /><b>{bucket.parts[k]}</b>{key.label}</span>)}
            </span>}
          </div>;
        })}
      </div>
    </div>
    <figcaption className="stats-ts-x" aria-hidden="true">
      <span>{buckets[0]?.label}</span>{buckets.length > 2 && <span>{buckets[Math.floor((buckets.length - 1) / 2)].label}</span>}<span>{buckets.at(-1)?.label}</span>
    </figcaption>
    <ul className="stats-legend">{keys.map((key, k) => <li key={key.id}><i className={`part-${key.id}`} />{key.label}<b>{totals[k]}</b></li>)}</ul>
  </figure>;
}

// Horizontal bars around a zero line (positive right, negative left), one row per label.
export function DivergingBars({ rows, format, ariaLabel }: { rows: { id: string; label: ReactNode; value: number | null; note?: ReactNode }[]; format: (value: number) => string; ariaLabel: string }) {
  const extent = Math.max(1e-9, ...rows.map(row => Math.abs(row.value ?? 0)));
  return <ul className="stats-div" aria-label={ariaLabel}>{rows.map(row => {
    const share = row.value == null ? 0 : Math.abs(row.value) / extent * 50;
    const tone = row.value == null || row.value === 0 ? "even" : row.value > 0 ? "up" : "down";
    return <li key={row.id}>
      <span className="stats-div-label">{row.label}{row.note && <small>{row.note}</small>}</span>
      <span className="stats-div-track" aria-hidden="true"><b className={tone} style={{ width: `${share}%`, [row.value != null && row.value < 0 ? "right" : "left"]: "50%" } as CSSProperties} /></span>
      <span className={`stats-div-value ${tone}`}>{row.value == null ? "—" : format(row.value)}</span>
    </li>;
  })}</ul>;
}

// Recent days ending today (local time), oldest first.
export function lastDays(count: number, now = Date.now()) {
  const end = new Date(now); end.setHours(0, 0, 0, 0);
  return Array.from({ length: count }, (_, i) => {
    const start = new Date(end); start.setDate(end.getDate() - (count - 1 - i));
    const next = new Date(start); next.setDate(start.getDate() + 1);
    return { start: start.getTime(), end: next.getTime(), label: `${start.getMonth() + 1}/${start.getDate()}` };
  });
}

// Rolling share of `hit` over the latest `window` items, one value per item.
export function rollingRate<T>(items: T[], hit: (item: T) => number, window: number) {
  const out: number[] = [];
  let sum = 0;
  items.forEach((item, i) => {
    sum += hit(item);
    if (i >= window) sum -= hit(items[i - window]);
    out.push(sum / Math.min(i + 1, window));
  });
  return out;
}

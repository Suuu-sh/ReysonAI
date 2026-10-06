import type { CSSProperties, ReactNode } from "react";

// Shared loading UI. Skeletons keep the final layout in place; spinners mark short waits.
// Every variant announces itself once through role="status" with a text label. Styles: loading.css (loaded globally by main.tsx).

type Vars = CSSProperties & Record<`--${string}`, string | number>;

export function Spinner({ size = 16 }: { size?: number }) {
  return <span className="spinner" style={{ "--spinner-size": `${size}px` } as Vars} aria-hidden="true" />;
}

/** Three pulsing dots that trail a sentence ("Agents are thinking"). */
export function LoadingDots() {
  return <span className="loading-dots" aria-hidden="true"><i /><i /><i /></span>;
}

/** A spinner next to a short sentence, for waits inside a page section. */
export function LoadingInline({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`loading-inline ${className}`.trim()} role="status" aria-live="polite">
    <Spinner size={14} /><span>{children}</span>
  </p>;
}

/** Panel-sized placeholder: spinner, title and an optional line of detail. */
export function LoadingState({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return <div className="state state-loading" role="status" aria-live="polite" aria-busy="true">
    <Spinner size={20} />
    <div><h2>{title}</h2>{children && <div className="state-content">{children}</div>}</div>
  </div>;
}

export function Skeleton({ width = "100%", height = 12, radius }: { width?: number | string; height?: number | string; radius?: number }) {
  return <span className="skeleton" aria-hidden="true"
    style={{ width, height, ...(radius === undefined ? {} : { borderRadius: radius }) }} />;
}

const LINE_WIDTHS = ["96%", "88%", "92%", "64%", "82%", "54%"];

/** Placeholder paragraph while an explanation is computed or fetched. */
export function SkeletonText({ lines = 3, label, className = "" }: { lines?: number; label?: string; className?: string }) {
  return <div className={`skeleton-text ${className}`.trim()} {...(label ? { role: "status", "aria-busy": true } : { "aria-hidden": true })}>
    {label && <span className="loading-sr">{label}</span>}
    {Array.from({ length: lines }, (_, index) =>
      <Skeleton key={index} height={10} width={index === lines - 1 ? "58%" : LINE_WIDTHS[index % LINE_WIDTHS.length]} />)}
  </div>;
}

/** Placeholder table rows with the real column count. */
export function SkeletonTable({ rows = 6, columns, label }: { rows?: number; columns: number; label: string }) {
  return <div className="skeleton-table" role="status" aria-busy="true">
    <span className="loading-sr">{label}</span>
    {Array.from({ length: rows }, (_, row) => <div className="skeleton-table-row" key={row}
      style={{ "--columns": columns, "--row": row } as Vars}>
      {Array.from({ length: columns }, (_, column) => <Skeleton key={column} height={column === 1 ? 14 : 10}
        width={column === 1 ? "72%" : column === 0 ? 22 : "48%"} />)}
    </div>)}
  </div>;
}

/** 13×13 range grid outline. The diagonal pulse follows the same wave as the real matrix entrance. */
export function RangeMatrixSkeleton({ title, label, ariaLabel, className = "" }: { title?: ReactNode; label: string; ariaLabel?: string; className?: string }) {
  return <section className={`panel matrix-panel matrix-skeleton ${className}`.trim()} aria-label={ariaLabel} aria-busy="true">
    <div className="panel-heading">{title ? <h2>{title}</h2> : <Skeleton width="42%" height={13} />}<Spinner size={14} /></div>
    <span className="loading-sr" role="status">{label}</span>
    <div className="matrix-scroll" aria-hidden="true">
      <div className="matrix">
        {Array.from({ length: 169 }, (_, index) =>
          <span key={index} style={{ "--wave": Math.floor(index / 13) + index % 13 } as Vars} />)}
      </div>
    </div>
    <div className="matrix-skeleton-legend" aria-hidden="true">
      {[56, 44, 62].map(width => <span key={width}><i /><Skeleton width={width} height={9} /></span>)}
    </div>
  </section>;
}

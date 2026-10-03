import type { CSSProperties, ReactNode } from "react";
import "./mode-release.css";

// One layout for every trainer mode (drills, ranked matches, the Agent table, the leaderboard
// summary): visual | body | actions, tinted by `theme`, with an optional full-width foot.
export function ModeBlock({ theme, className = "", visual, visualClass = "", eyebrow, title, status, description, children, actions, foot, label }: {
  theme: string; className?: string; visual: ReactNode; visualClass?: string; eyebrow: ReactNode; title: ReactNode;
  status?: ReactNode; description?: ReactNode; children?: ReactNode; actions?: ReactNode; foot?: ReactNode; label?: string;
}) {
  return <section className={`mode-block ${className}`.trim()} style={{ "--mode-theme": theme } as CSSProperties} aria-label={label}>
    <div className={`mode-visual ${visualClass}`.trim()}>{visual}</div>
    <div className="mode-body">
      <span className="mode-eyebrow">{eyebrow}</span>
      <h3>{title}{status && <span className="mode-release-status">{status}</span>}</h3>
      {description && <p>{description}</p>}
      {children}
    </div>
    {actions && <div className="mode-actions">{actions}</div>}
    {foot && <div className="mode-foot">{foot}</div>}
  </section>;
}

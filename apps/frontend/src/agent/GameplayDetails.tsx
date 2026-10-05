import { Children, isValidElement, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { profileCopy as t } from "./OpponentProfile.tsx";
import "./gameplay-mobile.css";

/** Nonmodal details: opening a panel never remounts or pauses the table. */
export function GamePanel({ id, label, children, mobileOnly = false }: { id: string; label: string; children: ReactNode; mobileOnly?: boolean }) {
  return <div className={`game-detail-panel${mobileOnly ? " mobile-only" : ""}`} data-panel={id}>{children}</div>;
}
export function GameplayDetails({ profile, children, requestedPanel, onClose }: { profile?: ReactNode; children: ReactNode; requestedPanel?: string | null; onClose?: () => void }) {
  const [active, setActive] = useState<string | null>(null);
  const uid = useId();
  const nav = useRef<HTMLElement>(null);
  const panels = Children.toArray(children).filter(isValidElement<{ id: string; label: string }>);
  const profileData = isValidElement<{ profile: unknown }>(profile) ? profile.props.profile : profile;
  useEffect(() => { if (profileData) setActive("profile"); else setActive(current => current === "profile" ? null : current); }, [profileData]);
  useEffect(() => { if (requestedPanel) setActive(requestedPanel); }, [requestedPanel]);
  const select = (id: string) => { onClose?.(); setActive(current => current === id ? null : id); };
  const close = () => { onClose?.(); setActive(null); nav.current?.querySelector<HTMLButtonElement>('[aria-expanded="true"]')?.focus(); };
  return <aside className="agent-side game-details" data-open={active ?? ""} onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); close(); } }}>
    {profile}
    <nav ref={nav} className="game-details-nav" aria-label={t("Table details", "卓の詳細", "牌桌详情", "Detalles de mesa")}>
      {profile && <button type="button" aria-expanded={active === "profile"} onClick={() => select("profile")}>{t("Profile", "プロフィール", "资料", "Perfil")}</button>}
      {panels.map(panel => <button type="button" key={panel.props.id} aria-expanded={active === panel.props.id} aria-controls={`${uid}-${panel.props.id}`} onClick={() => select(panel.props.id)}>{panel.props.label}</button>)}
    </nav>
    {panels.map(panel => <div className="game-detail-slot" key={panel.props.id} id={`${uid}-${panel.props.id}`} data-active={active === panel.props.id ? "true" : "false"} role="region" aria-label={panel.props.label}>{panel}</div>)}
    {active && <button type="button" className="game-details-close" onClick={close} aria-label={t("Close details", "詳細を閉じる", "关闭详情", "Cerrar detalles")}>×</button>}
  </aside>;
}

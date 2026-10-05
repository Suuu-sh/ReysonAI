import type { CSSProperties } from "react";
import type { Profile } from "../profile.ts";
import { CreditCard, Palette, SignOut, UserCircle } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { levelLabel } from "../profile.ts";
import "./account.css";
import { localized } from "../i18n.ts";

const t = (ja: string, en: string) => localized(en, ja);
export const ACCOUNT_SECTION = "アカウント";

export function initialOf(profile: Profile | null) {
  return (profile?.nickname?.trim()?.[0] ?? "G").toUpperCase();
}

// Profile chip at the bottom of the sidebar; opens an upward menu like a typical account menu.
export function AccountMenu({ profile, collapsed, onNavigate, onLogout }: { profile: Profile; collapsed: boolean; onNavigate: (tab: string) => void; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<CSSProperties | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const chipRef = useRef<HTMLButtonElement>(null);
  // Portal outside the sidebar's clipping and stacking context; keep chip-relative coordinates.
  const toggleMenu = () => {
    if (open) { setOpen(false); return; }
    const rect = chipRef.current!.getBoundingClientRect();
    setPosition(collapsed
      ? { left: rect.right + 10, bottom: Math.max(8, window.innerHeight - rect.bottom) }
      : { left: rect.left, width: rect.width, bottom: window.innerHeight - rect.top + 6 });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return undefined;
    const close = (event: MouseEvent) => { if (!rootRef.current?.contains(event.target as Node | null) && !popoverRef.current?.contains(event.target as Node | null)) { setOpen(false); } };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); } };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const go = (tab: string) => { setOpen(false); onNavigate(tab); };
  const name = profile?.nickname || t("ゲスト", "Guest");

  return <div className={`account-menu${collapsed ? " collapsed" : ""}`} ref={rootRef}>
    {open && createPortal(<div ref={popoverRef} className="account-popover" role="menu" aria-label={t("アカウントメニュー", "Account menu")} style={position ?? undefined}>
      <button type="button" role="menuitem" onClick={() => go("account")}><UserCircle size={18} />{t("アカウント", "Account")}</button>
      <button type="button" role="menuitem" onClick={() => go("subscription")}><CreditCard size={18} />{t("サブスクリプション", "Subscription")}<em>Free</em></button>
      <button type="button" role="menuitem" onClick={() => go("appearance")}><Palette size={18} />{t("外観", "Appearance")}</button>
      <hr />
      <button type="button" role="menuitem" className="danger" onClick={() => { setOpen(false); onLogout(); }}><SignOut size={18} />{t("ログアウト", "Log out")}</button>
    </div>, document.body)}
    <button type="button" ref={chipRef} className={`account-chip${open ? " open" : ""}`} aria-haspopup="menu" aria-expanded={open}
      aria-label={t("アカウント", "Account")} title={t("アカウント", "Account")} onClick={toggleMenu}>
      <span className="account-avatar">{initialOf(profile)}</span>
      <span className="account-chip-text"><strong translate="no">{name}</strong><small>{levelLabel(profile?.level)} · Free</small></span>
    </button>
  </div>;
}

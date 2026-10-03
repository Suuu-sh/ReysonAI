import { CaretRight, Check, CreditCard, Palette, SignOut, Translate, UserCircle } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { levelLabel } from "../profile.ts";
import "./account.css";
import { localized, productLocale, selectProductLocale } from "../i18n.ts";

const t = (ja, en) => localized(en, ja);
export const ACCOUNT_SECTION = "アカウント";

export function initialOf(profile) {
  return (profile?.nickname?.trim()?.[0] ?? "G").toUpperCase();
}

// Profile chip at the bottom of the sidebar; opens an upward menu like a typical account menu.
export function AccountMenu({ profile, collapsed, onNavigate, onLogout }) {
  const [open, setOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [position, setPosition] = useState(null);
  const rootRef = useRef(null);
  const chipRef = useRef(null);
  // The sidebar clips overflow, so the menu is placed with fixed coordinates next to the chip.
  const toggleMenu = () => {
    if (open) { setOpen(false); setLanguageOpen(false); return; }
    const rect = chipRef.current.getBoundingClientRect();
    setPosition(collapsed
      ? { left: rect.right + 10, bottom: Math.max(8, window.innerHeight - rect.bottom) }
      : { left: rect.left, width: rect.width, bottom: window.innerHeight - rect.top + 6 });
    setOpen(true);
  };
  const locale = productLocale();

  useEffect(() => {
    if (!open) return undefined;
    const close = event => { if (!rootRef.current?.contains(event.target)) { setOpen(false); setLanguageOpen(false); } };
    const onKey = event => { if (event.key === "Escape") { setOpen(false); setLanguageOpen(false); } };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const go = tab => { setOpen(false); setLanguageOpen(false); onNavigate(tab); };
  const name = profile?.nickname || t("ゲスト", "Guest");

  return <div className={`account-menu${collapsed ? " collapsed" : ""}`} ref={rootRef}>
    {open && <div className="account-popover" role="menu" aria-label={t("アカウントメニュー", "Account menu")} style={position ?? undefined}>
      <button type="button" role="menuitem" onClick={() => go("account")}><UserCircle size={18} />{t("アカウント", "Account")}</button>
      <button type="button" role="menuitem" onClick={() => go("subscription")}><CreditCard size={18} />{t("サブスクリプション", "Subscription")}<em>Free</em></button>
      <button type="button" role="menuitem" onClick={() => go("appearance")}><Palette size={18} />{t("外観", "Appearance")}</button>
      <div className="account-submenu-wrap" onMouseEnter={() => setLanguageOpen(true)} onMouseLeave={() => setLanguageOpen(false)}>
        <button type="button" role="menuitem" aria-haspopup="menu" aria-expanded={languageOpen} onClick={() => setLanguageOpen(true)}>
          <Translate size={18} />{t("言語", "Languages")}<small translate="no">{locale === "ja" ? "日本語" : "English"}</small><CaretRight size={14} className="account-caret" />
        </button>
        {languageOpen && <div className="account-submenu" role="menu" aria-label={t("言語", "Languages")}>
          {[["en", "English"], ["ja", "日本語"]].map(([value, label]) =>
            <button type="button" role="menuitemradio" aria-checked={locale === value} key={value} onClick={() => locale !== value && selectProductLocale(value)}>
              <span translate="no">{label}</span>{locale === value && <Check size={15} weight="bold" />}
            </button>)}
        </div>}
      </div>
      <hr />
      <button type="button" role="menuitem" className="danger" onClick={() => { setOpen(false); onLogout(); }}><SignOut size={18} />{t("ログアウト", "Log out")}</button>
    </div>}
    <button type="button" ref={chipRef} className={`account-chip${open ? " open" : ""}`} aria-haspopup="menu" aria-expanded={open}
      aria-label={t(`アカウント：${name}`, `Account: ${name}`)} title={name} onClick={toggleMenu}>
      <span className="account-avatar">{initialOf(profile)}</span>
      <span className="account-chip-text"><strong>{name}</strong><small>{levelLabel(profile?.level)} · Free</small></span>
    </button>
  </div>;
}

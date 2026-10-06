import { Children, isValidElement, useEffect, useId, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Dialog } from "../components/Dialog.tsx";
import { PlayingCard } from "../components/PlayingCard.tsx";
import { profileCopy as t } from "./OpponentProfile.tsx";
import "./gameplay-mobile.css";

export type TableHistoryHand = { id: string | number; cards?: string[]; resultBb: number | null; details?: ReactNode };
/** Presentation only. Neither opening details nor a profile pauses the mounted game. */
export function GamePanel({ id, children }: { id: string; label: string; children: ReactNode; mobileOnly?: boolean }) {
  return <div className="game-detail-panel" data-panel={id}>{children}</div>;
}
export function GameplayDetails({ profile, children, requestedPanel, onClose, currentCards = [], history = [], profileSwitches }: { profile?: ReactNode; children: ReactNode; requestedPanel?: string | null; onClose?: () => void; currentCards?: string[]; history?: TableHistoryHand[]; profileSwitches?: ReactNode }) {
  const [active, setActive] = useState<"history" | "details" | null>(null);
  const [selected, setSelected] = useState<string | number | null>(null);
  const uid = useId();
  const panels = Children.toArray(children).filter(isValidElement<{ id: string; label: string; children: ReactNode }>);
  const profileData = isValidElement<{ profile: unknown }>(profile) ? profile.props.profile : profile;
  useEffect(() => { if (profileData) { setActive(null); onClose?.(); } }, [profileData]);
  useEffect(() => { if (requestedPanel) setActive("details"); }, [requestedPanel]);
  const close = () => { onClose?.(); setActive(null); };
  const historyPanels = panels.filter(panel => ["hand", "recent"].includes(panel.props.id));
  const otherPanels = panels.filter(panel => !["hand", "recent"].includes(panel.props.id));
  const chosen = active === "history" ? history.find(hand => hand.id === selected) : undefined;
  return <div className="game-details">
    <div className="game-history-rail" aria-label={t("Hand history", "ハンド履歴", "手牌历史", "Historial de manos")}>
      <div className="game-history-items">
        <button type="button" className="game-current-hand" onClick={() => { setSelected(null); setActive("history"); }} aria-label={t("Current hand and action log", "現在のハンドと操作履歴", "当前手牌与行动记录", "Mano actual y registro de acciones")}>
          {currentCards.length === 2 ? currentCards.map((card, i) => <PlayingCard variant="agent" card={card} size="is-history" key={i}/>) : <span>{t("Hand", "ハンド", "手牌", "Mano")}</span>}
        </button>
        {history.slice(0, 3).map(hand => <button type="button" className="game-history-hand" key={hand.id} onClick={() => { setSelected(hand.id); setActive("history"); }} aria-label={`${t("Hand", "ハンド", "手牌", "Mano")} #${hand.id}${hand.resultBb == null ? "" : ` · ${hand.resultBb > 0 ? "+" : ""}${hand.resultBb} bb`}`}>
          <span className="game-history-cards">{hand.cards?.length === 2 ? hand.cards.map((card, i) => <PlayingCard variant="agent" card={card} size="is-history" key={i}/>) : <span>#{hand.id}</span>}</span>
          {hand.resultBb != null && <b className={hand.resultBb > 0 ? "up" : hand.resultBb < 0 ? "down" : ""}>{hand.resultBb > 0 ? "+" : ""}{Number(hand.resultBb.toFixed(2))} bb</b>}
        </button>)}
      </div>
      <button type="button" className="game-controls-trigger" onClick={() => setActive("details")} aria-label={t("Session, rank and controls", "セッション・ランク・設定", "会话、评分与设置", "Sesión, rango y controles")}>•••</button>
    </div>
    {(profile || active) && createPortal(<Dialog labelledBy={`${uid}-details`} onClose={() => { if (profile && isValidElement<{ onClose: () => void }>(profile)) profile.props.onClose(); else close(); }} className={`game-details-modal${profile ? " game-profile-modal" : ""}`}>
      {profile ? <><h2 id={`${uid}-details`}>{t("Profile", "プロフィール", "资料", "Perfil")}</h2>{profile}
        {profileSwitches && <div className="game-profile-players" role="group" aria-label={t("Players", "プレイヤー", "玩家", "Personas")}>{profileSwitches}</div>}
      </> : <>
        <header className="game-modal-header"><h2 id={`${uid}-details`}>{active === "history" ? t("Hand history", "ハンド履歴", "手牌历史", "Historial de manos") : t("Session, rank and controls", "セッション・ランク・設定", "会话、评分与设置", "Sesión, rango y controles")}</h2><button type="button" onClick={close}>{t("Close", "閉じる", "关闭", "Cerrar")}</button></header>
        {chosen && <section className="game-selected-history"><b>#{chosen.id}</b>{chosen.cards?.map((card, i) => <PlayingCard variant="agent" card={card} size="is-history" key={i}/>)}{chosen.resultBb != null && <strong>{chosen.resultBb > 0 ? "+" : ""}{Number(chosen.resultBb.toFixed(2))} bb</strong>}</section>}
        {chosen?.details}{(active === "history" ? historyPanels.filter(panel => selected == null || panel.props.id === "recent") : otherPanels).map(panel => <div key={panel.props.id}>{panel}</div>)}
      </>}
    </Dialog>, document.body)}

  </div>;
}

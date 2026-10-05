import type { ReactNode } from "react";
import { PlayingCard } from "../components/PlayingCard.tsx";
import "./agent.css";

/** Presentation only: callers own the deck, visibility, accounting and actions. */
export function PokerTable({ board, center, children, paused = false }: { board: string[]; center: ReactNode; children: ReactNode; paused?: boolean }) {
  return <div className={`agent-felt-wrap${paused ? " is-paused" : ""}`}>
    <div className="agent-felt">
      <span className="agent-felt-logo" aria-hidden="true">ReysonAI</span>
      <div className="agent-center">
        <div className="agent-board">{[0, 1, 2, 3, 4].map(i => board[i]
          ? <PlayingCard variant="agent" key={`${i}-${board[i]}`} card={board[i]} size="is-board" />
          : <span key={i} className="agent-card is-slot is-board" />)}</div>
        {center}
      </div>
      {children}
    </div>
  </div>;
}

export function PokerChip({ slot, amount }: { slot: number; amount: ReactNode }) {
  return <span className={`agent-chip slot-${slot}`}><i aria-hidden="true" />{amount}</span>;
}

export function PokerSeat({ slot, human, folded, won, acting, cards, showCards, handKey, avatar, name, stack, position, bubble, children, onProfile, profileLabel, fullName }: {
  slot: number; human?: boolean; folded?: boolean; won?: boolean; acting?: boolean; cards: string[]; showCards: boolean; handKey: string | number;
  avatar?: ReactNode; name: ReactNode; stack?: ReactNode; position: string; bubble?: ReactNode; children?: ReactNode; onProfile?: () => void; profileLabel?: string; fullName?: string;
}) {
  return <div className={`agent-seat slot-${slot}${human ? " is-human" : ""}${folded ? " is-folded" : ""}${won ? " is-winner" : ""}${acting ? " is-acting" : ""}`}>
    <div className="agent-hole">{cards.map((card, i) => <PlayingCard variant="agent" key={`${handKey}-${i}`} card={card} hidden={!showCards} size={human ? "is-hero" : ""} />)}</div>
    <div className="agent-plate">
      <div className="agent-avatar">
        {onProfile && <button type="button" className="agent-profile-trigger" onClick={onProfile} aria-label={profileLabel} title={profileLabel} />}
        {avatar ?? <span className="agent-you">YOU</span>}
        {acting && !human && <span className="agent-dots" aria-hidden="true"><i /><i /><i /></span>}
      </div>
      <div className="agent-meta"><b title={fullName}>{name}</b><small>{stack}</small></div>
      <span className="agent-pos">{position}</span>
      {position === "BTN" && <span className="agent-dealer" aria-label="Dealer">D</span>}
    </div>
    {bubble}
    {children}
  </div>;
}

export function PokerActionButton({ tone, className = "", disabled, onClick, children }: { tone: string; className?: string; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" className={`agent-act tone-${tone}${className ? ` ${className}` : ""}`} disabled={disabled} onClick={onClick}>{children}</button>;
}

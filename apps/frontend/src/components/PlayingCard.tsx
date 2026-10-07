import type { ComponentPropsWithoutRef, CSSProperties } from "react";
import { Club, Diamond, Heart, Spade } from "@phosphor-icons/react";

export type CardSuit = "s" | "h" | "d" | "c";
const SUITS: Record<string, string> = { s: "♠", h: "♥", d: "♦", c: "♣" };
const SITE_SUITS: Record<string, typeof Spade> = { s: Spade, h: Heart, d: Diamond, c: Club };

type PlayingCardProps = Omit<ComponentPropsWithoutRef<"span">, "children"> & {
  /** Concrete rank/suit notation, e.g. As or Td (ten stays T). */
  card?: string;
  variant?: "trainer" | "agent" | "site" | "text";
  size?: string;
  /** The service site's existing deal/fan animation offset. */
  index?: number;
};

/** Shared four-colour face, retaining each surface's existing DOM and CSS hooks. */
export function PlayingCard({ card, variant = "trainer", hidden = false, size = "", index = 0, className = "", style, ...attributes }: PlayingCardProps) {
  if (variant === "agent" && (hidden || !card)) {
    return <span {...attributes} className={["agent-card", "is-back", size, className].filter(Boolean).join(" ")} style={style} />;
  }
  const rank = card?.[0];
  const suit = card?.[1];
  const glyph = suit ? SUITS[suit] : undefined;
  const SuitIcon = variant === "site" && suit ? SITE_SUITS[suit] : undefined;
  const classes = [variant === "site" ? "site-card" : variant === "text" ? "" : "trainer-card",
    `suit-${suit}`, variant === "agent" ? "agent-card" : "", size, className].filter(Boolean).join(" ");
  const cardStyle = variant === "site" ? { "--i": index, ...style } as CSSProperties : style;
  return <span {...attributes} className={classes} style={cardStyle}>
    {variant === "text" ? <>{rank}{glyph ?? suit}</> : <><b>{rank}</b><i>{SuitIcon ? <><SuitIcon weight="fill" size="1em" aria-hidden="true" focusable="false" /><span className="site-visually-hidden">{glyph}</span></> : glyph}</i></>}
  </span>;
}

import { PlayingCard } from "../components/PlayingCard.tsx";

/** Shared compact card pair/board markup for saved practice and Agent hand history. */
export function SessionCards({ cards }: { cards: string[] }) {
  return <span className="sessions-cards">{cards.map((card, index) => <PlayingCard key={`${card}-${index}`} card={card} variant="text" />)}</span>;
}

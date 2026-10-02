// A six-seat ring game session: the button moves one seat per hand, every hand starts at 100BB
// (the depth of every saved dataset) and results accumulate as points (1BB = 100 points).
import { POSITIONS, type Position } from "./preflop.ts";
import { GUEST_AGENT, agentTableById } from "./characters.ts";

export const POINTS_PER_BB = 100;
export const toPoints = (bb: number) => Math.round(bb * POINTS_PER_BB);

export type SessionSeat = { kind: "human" | "agent"; agentId: string | null; points: number };
export type Session = { tableId: string; seed: string; seats: SessionSeat[]; button: number; handNo: number };

// Each table has five characters. In spectator mode (`humanSeat: null`) the sixth seat is taken by
// the guest agent Evi, so the game stays six-handed like every saved dataset.
export function createSession({ tableId, seed, humanSeat = 0 }: { tableId: string; seed: string; humanSeat?: number | null }): Session {
  const table = agentTableById(tableId);
  if (!table) throw new Error(`Unknown agent table: ${tableId}`);
  const agents = [...table.agents];
  const seats: SessionSeat[] = Array.from({ length: 6 }, (_, index) => {
    if (index === humanSeat) return { kind: "human", agentId: null, points: 0 };
    const character = agents.shift() ?? GUEST_AGENT;
    return { kind: "agent", agentId: character.id, points: 0 };
  });
  return { tableId, seed, seats, button: 0, handNo: 0 };
}

// Position of each seat for the current hand (button seat = BTN, then SB, BB, UTG, HJ, CO).
export function seatPositions(session: Session): Record<number, Position> {
  const order: Position[] = ["BTN", "SB", "BB", "UTG", "HJ", "CO"];
  return Object.fromEntries(order.map((pos, offset) => [(session.button + offset) % 6, pos]));
}

export const seatOf = (session: Session, pos: Position) => Number(Object.entries(seatPositions(session)).find(([, p]) => p === pos)![0]);
export const handSeed = (session: Session) => `${session.seed}|hand|${session.handNo}`;

// Applies a finished hand's returns (BB by position) and moves the button.
export function finishHand(session: Session, returns: Record<string, number>): Session {
  const positions = seatPositions(session);
  const seats = session.seats.map((seat, index) => ({ ...seat, points: seat.points + toPoints(returns[positions[index]] ?? 0) }));
  return { ...session, seats, button: (session.button + 1) % 6, handNo: session.handNo + 1 };
}

export { POSITIONS };

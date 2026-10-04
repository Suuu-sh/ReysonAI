import { evaluate } from "../../scripts/lib/equity.mjs";
import { cardText } from "../../scripts/postflop-ai/flop-isomorphism.mjs";
import { playMw3WithPolicies } from "../../scripts/postflop-ai/mw3-runtime.mjs";
import { isVerifiedMw3Kit, type Mw3Kit } from "../estimated/mw3-browser.ts";
import { POSITIONS, STACK_BB, type Position, type PreflopState } from "./preflop.ts";
import type { HandResult, LogEntry } from "./hand.ts";

// Preserve all six dealt hands outside the runtime. Only the exact original
// three source seats belong in its hole map; folded outside-seat blind money
// remains in the actual preflop pot and in the six-seat returns below.
export function playMw3AgentHand({ kit, state, hole, board, human, humanActions, random }: {
  kit: Mw3Kit; state: PreflopState; hole: Record<string, number[]>; board: number[];
  human: Position | null; humanActions: string[]; random: () => number;
}): Partial<HandResult> & { log: LogEntry[] } {
  if (!isVerifiedMw3Kit(kit)) throw new Error("MW3 Agent requires a verified dedicated delivery");
  const seats: Position[] = kit.inputs.spot.seats;
  const active = POSITIONS.filter(seat => !state.folded.has(seat));
  const pot = Object.values(state.committed).reduce((sum, value) => sum + value, 0);
  if (active.length !== 3 || seats.length !== 3 || !seats.every(seat => active.includes(seat)) || Math.abs(pot - kit.inputs.spot.potBb) > 1e-9
    || seats.some(seat => state.committed[seat] !== kit.inputs.spot.openBb || STACK_BB - state.committed[seat] !== kit.inputs.spot.stackBb)) throw new Error("MW3 Agent source geometry mismatch");
  const hands = Object.fromEntries(seats.map(seat => [seat, hole[seat]]));
  const result = playMw3WithPolicies(kit.inputs, kit.policies, { hands, board,
    human: human && seats.includes(human) ? human : null, humanActions, random });
  const bets: Record<string, Record<string, number>> = {};
  const log: LogEntry[] = result.table.log.map((entry: any) => {
    const totals = bets[entry.street] ??= Object.fromEntries(seats.map(seat => [seat, 0]));
    totals[entry.seat] = entry.committedBb + entry.amountBb;
    return { street: entry.street, pos: entry.seat, action: entry.action,
      to: entry.action === "fold" || entry.action === "check" ? undefined : totals[entry.seat],
      allIn: entry.amountBb > 0 && entry.amountBb === entry.stackBb,
      amountBb: entry.amountBb, pot: entry.pot + entry.amountBb, bets: { ...totals },
      source: `mw3:${kit.spotId}:${entry.street}:${entry.node}`, originalRole: entry.role };
  });
  const shownBoard = result.board.map(cardText);
  if (result.status === "awaiting") {
    const pending = result.pending;
    return { status: "awaiting", postflopKind: "mw3_srp", spotId: kit.spotId, board: shownBoard, log,
      pending: { street: pending.street, pos: pending.seat, pot: pending.potBb, board: shownBoard, toCall: pending.callBb,
        options: pending.actionGroups.map((group: any) => ({ key: group.action,
          to: group.action === "fold" || group.action === "check" ? undefined : group.toBb,
          amountBb: group.amountBb, allIn: group.allIn, aliases: [...group.actions] })) } };
  }
  const settled = result.settlement;
  const returns = Object.fromEntries(POSITIONS.map(seat => [seat,
    seats.includes(seat) ? settled.finalStacks[seat] - STACK_BB : 0 - (state.committed[seat] ?? 0)]));
  const total = Object.values(returns).reduce((sum, value) => sum + value, 0) + settled.rakeBb;
  if (Math.abs(total) > 1e-8) throw new Error("MW3 six-seat settlement conservation failed");
  const showdown = result.table.streetState.end.type !== "fold";
  const survivors = seats.filter(seat => !result.table.folded.includes(seat));
  const handRanks = showdown ? Object.fromEntries(survivors.map(seat => [seat, Math.floor(evaluate([...hole[seat], ...board]) / 16 ** 5)])) : undefined;
  return { status: "done", postflopKind: "mw3_srp", spotId: kit.spotId, board: shownBoard, log,
    winners: settled.winners, showdown, returns, rake: settled.rakeBb, pot: settled.potBb, handRanks };
}

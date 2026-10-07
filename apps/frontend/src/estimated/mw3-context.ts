import { multiwaySpots } from "./multiway-responses.ts";
import { positions } from "./sizing.ts";

const postflopOrder = ["SB", "BB", "UTG", "HJ", "CO", "BTN"];
// Frequency-free routing only. Source support and all strategy identities are
// checked by the dedicated delivery client before either consumer can play.
export function mw3OriginForEvents(events: any[]) {
  if (!Array.isArray(events) || events.some(event => !event || typeof event !== "object" || Array.isArray(event))) return null;
  const normalized = events.map(event => ({ pos: event.pos ?? event.seat,
    type: event.type ?? (event.action === "open" ? "raise" : event.action), key: event.key ?? event.action,
    to: event.to ?? event.to_size_bb }));
  if (normalized.some(event => !positions.includes(event.pos) || !["raise", "call", "fold", "check"].includes(event.type))) return null;
  const voluntary = normalized.filter(event => event.type !== "fold" && event.type !== "check");
  if (voluntary.map(event => event.key).join() !== "open,call,call" || voluntary[0].type !== "raise"
    || voluntary.slice(1).some(event => event.type !== "call" || event.key !== "call")) return null;
  const [open, first, second] = voluntary;
  if (new Set(voluntary.map(event => event.pos)).size !== 3 || voluntary.some(event => event.to != null && event.to !== 2.5)
    || normalized.some(event => event.type === "fold" && voluntary.some(active => active.pos === event.pos))
    || positions.indexOf(open.pos) >= positions.indexOf(first.pos) || positions.indexOf(first.pos) >= positions.indexOf(second.pos)
    || !multiwaySpots.some(spot => spot.opener === open.pos && spot.caller === first.pos && spot.hero === second.pos)) return null;
  const seats = postflopOrder.filter(seat => voluntary.some(event => event.pos === seat));
  const deadBlindBb = (seats.includes("SB") ? 0 : 0.5) + (seats.includes("BB") ? 0 : 1);
  return { id: `${open.pos}_open_${first.pos}_call_${second.pos}_call`, kind: "mw3_srp", opener: open.pos,
    firstCaller: first.pos, secondCaller: second.pos, seats,
    roles: Object.fromEntries(seats.map((seat, index) => [seat, ["first", "middle", "last"][index]])),
    potBb: 7.5 + deadBlindBb, stackBb: 97.5, openBb: 2.5 };
}
export function mw3OriginForSelection({ rangeType, opener, callers, pendingRaise }: any) {
  if (rangeType !== "response" || pendingRaise || !Array.isArray(callers) || callers.length !== 2) return null;
  return mw3OriginForEvents([{ pos: opener, type: "raise", key: "open", to: 2.5 },
    ...callers.map(pos => ({ pos, type: "call", key: "call", to: 2.5 }))]);
}

import { applyMw3Action, createMw3Table, mw3Decision, settleMw3, startMw3Street } from "../../scripts/postflop-ai/mw3-engine.mjs";
import { cardIds } from "../../scripts/postflop-ai/flop-isomorphism.mjs";
import { cloneMw3Table, mw3ActionGroups } from "../../scripts/postflop-ai/mw3-actions.mjs";
import { mw3ActionLabel, mw3Copy } from "./mw3-copy.ts";

const streets = ["flop", "turn", "river"];
const cardsToInt = (cards: string[]) => cardIds(cards.join(""), cards.length);
const validCards = (cards: string[], count: number) => cards.length === count && cards.every(card => /^[2-9TJQKA][shdc]$/.test(card)) && new Set(cards).size === count;
export type Mw3RangeSelection = { flopCards: string[]; flopActions: string[]; turnCard: string; turnActions: string[]; riverCard: string; riverActions: string[] };

// Chronological chip/action presentation uses the dedicated state machine even
// after 3→2. It never creates a strategy; the view needs a verified delivery kit.
export function buildMw3RangeNavigation(spot: any, selection: Mw3RangeSelection, locale = "en") {
  if (!spot || !validCards(selection.flopCards, 3)) return null;
  const text = [...selection.flopCards, ...[selection.turnCard, selection.riverCard].filter(Boolean)];
  if (!validCards(text, text.length) || selection.riverCard && !selection.turnCard) throw new Error("Invalid mw3 board");
  const board = cardsToInt(text), table = createMw3Table(spot), blocks: any[] = [], paths: Record<string, string[]> = {};
  const t = mw3Copy(locale as any);
  for (const [streetIndex, street] of streets.entries()) {
    if (streetIndex > 0) {
      const card = street === "turn" ? selection.turnCard : selection.riverCard;
      blocks.push({ key: `mw3-${street}-board`, kind: "board", cards: card ? [card] : [], street, pending: !card, potBb: table.pot });
      if (!card) break;
    }
    startMw3Street(table, street);
    paths[street] = [];
    const actions = selection[`${street}Actions` as keyof Mw3RangeSelection] as string[];
    for (let index = 0; index <= actions.length; index++) {
      const decision = mw3Decision(table);
      if (decision.end) {
        if (index !== actions.length) throw new Error("Action after mw3 street completion");
        break;
      }
      const groups = mw3ActionGroups(table), chosen = actions[index];
      const observed = chosen == null ? null : groups.find((group: any) => group.actions.includes(chosen));
      if (chosen != null && !observed) throw new Error("Illegal mw3 observable action");
      blocks.push({ key: `mw3-${street}-${index}`, kind: "flop", mw3: true, position: decision.seat,
        ...(street === "flop" ? { flopIndex: index } : { street, laterIndex: index }),
        stack: String(decision.stackBb), originalRole: decision.role, chosen: observed?.action ?? null,
        active: index === actions.length,
        options: groups.map((group: any) => ({ action: group.action, label: mw3ActionLabel(group, locale as any),
          amountBb: group.amountBb, toBb: group.toBb, allIn: group.allIn, aliases: [...group.actions] })) });
      if (!observed) break;
      paths[street].push(observed.action);
      applyMw3Action(table, observed.action);
    }
    if (!table.streetState.end) break;
    if (table.winner || street === "river") {
      const displayPotBb = table.winner ? settleMw3(cloneMw3Table(table)).potBb : table.pot;
      blocks.push({ key: `mw3-${street}-end`, kind: "end", result: table.winner ? `${table.winner} ${t.wins}` : t.showdown,
        pot: `${t.pot} ${displayPotBb}BB`, options: [] });
      break;
    }
  }
  return { blocks, paths, table, settledPotBb: table.winner ? settleMw3(cloneMw3Table(table)).potBb : null, board: board.slice(0, { flop: 3, turn: 4, river: 5 }[table.street]),
    pendingStreet: blocks.find(block => block.kind === "board" && block.pending)?.street ?? null };
}

// Imported URLs preserve only the legal observable prefix. Missing policy data
// does not change this frequency-free validation or authorize playing that path.
export function canonicalMw3RangeSelection(spot: any, selection: Partial<Mw3RangeSelection>): Mw3RangeSelection {
  const source: Mw3RangeSelection = { flopCards: selection.flopCards ?? ["", "", ""], flopActions: selection.flopActions ?? [],
    turnCard: selection.turnCard ?? "", turnActions: selection.turnActions ?? [], riverCard: selection.riverCard ?? "", riverActions: selection.riverActions ?? [] };
  const result = { ...source, flopActions: [], turnActions: [], riverActions: [] } as Mw3RangeSelection;
  if (!validCards(source.flopCards, 3)) return result;
  const table = createMw3Table(spot);
  for (const [index, street] of streets.entries()) {
    if (index && (!table.streetState.end || table.winner)) {
      if (street === "turn") result.turnCard = "";
      result.riverCard = "";
      break;
    }
    if (index && !result[`${street}Card` as keyof Mw3RangeSelection]) break;
    startMw3Street(table, street);
    const prefix = result[`${street}Actions` as keyof Mw3RangeSelection] as string[];
    for (const action of source[`${street}Actions` as keyof Mw3RangeSelection] as string[]) {
      const group = mw3ActionGroups(table).find((item: any) => item.actions.includes(action));
      if (!group) break;
      prefix.push(group.action); applyMw3Action(table, group.action);
    }
  }
  return result;
}

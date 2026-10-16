import type { MultiwaySpot } from './spots.ts';
import type { FrequencyRow, SourceDataset, SourceSpot } from './types.ts';
// Saved action products only. Folded seats contribute chips and source identity,
// never hole cards to the heads-up postflop deck.
export function multiwayInputData(spot: MultiwaySpot, read: (file: string) => SourceDataset | null | undefined): {
  sources: { dataset: string; spot: SourceSpot }[]; seatRows: Record<string, FrequencyRow[]>;
};
export function multiwayInputData(spot?: any, read?: any) : any {
  const sources: any[] = [], seen = new Map();
  for (const factors of Object.values<any>(spot.ranges)) for (const [file, id] of factors) {
    const key = `${file}/${id}`;
    if (seen.has(key)) continue;
    const source = read(file)?.spots?.find((row: any) : any => row.id === id);
    if (!source || source.effective_stack_bb !== 100 || !Array.isArray(source.hands) || source.hands.length !== 169 ||
        new Set(source.hands.map((row: any) : any => row.hand)).size !== 169) throw new Error(`${spot.id}: missing or malformed source ${key}`);
    sources.push({ dataset: file, spot: source }); seen.set(key, source);
  }
  // Check each source decision against the exact recorded street totals. A
  // source-size edit must stop fresh authoring, not merely stale an old policy.
  const contributions: any = { UTG: 0, HJ: 0, CO: 0, BTN: 0, SB: 0.5, BB: 1 };
  const cursors = new Map(); let facing = 1;
  const receivedField: any = {
    "preflop-ranges": "open_size_bb", "multiway-responses": "open_size_bb", "multiway2-responses": "open_size_bb",
    "squeeze-responses": "squeeze_size_bb", "cold-three-bet-responses": "three_bet_size_bb", "cold-four-bet-responses": "four_bet_size_bb",
  };
  for (const step of spot.history) {
    const index = cursors.get(step.seat) ?? 0;
    const factor = spot.ranges[step.seat]?.[index]; cursors.set(step.seat, index + 1);
    if (!factor || factor[2] !== step.action) throw new Error(`${spot.id}: source action history differs`);
    const [file, id, action] = factor, source = seen.get(`${file}/${id}`);
    if (source.hero !== step.seat || source.open_size_bb !== spot.openBb || source.opener && source.opener !== spot.opener ||
        receivedField[file] && source[receivedField[file]] !== facing ||
        file === "continuation-responses" && (source.facing_size_bb !== facing ||
          Object.entries<any>(contributions).some(([seat, amount]: any) : any => source.contributions_bb?.[seat] !== amount))) {
      throw new Error(`${spot.id}: source geometry changed ${file}/${id}`);
    }
    if (action !== "fold") {
      const field: any = ({ open: "open_size_bb", three_bet: "three_bet_size_bb", squeeze: "squeeze_size_bb", four_bet: "four_bet_size_bb", all_in: "all_in_size_bb" } as any)[action];
      const size = file === "continuation-responses" ? source.action_sizes_bb?.[action] : action === "call" ? source[receivedField[file]] : source[field];
      if (size !== step.to_size_bb || source.hands.some((row: any) : any => row[action] > 0 && action !== "call" &&
          row[file === "continuation-responses" ? "raise_to_size_bb" : field] !== size)) {
        throw new Error(`${spot.id}: source action size changed ${file}/${id}`);
      }
      contributions[step.seat] = size;
      if (action !== "call") facing = size;
    }
  }
  if (Object.entries<any>(spot.ranges).some(([seat, factors]: any) : any => cursors.get(seat) !== factors.length) ||
      Object.entries<any>(contributions).some(([seat, amount]: any) : any => spot.contributionsBb[seat] !== amount) ||
      Object.values<any>(contributions).reduce((sum?: any, value?: any) : any => sum + value, 0) !== spot.potBb ||
      [spot.ip, spot.oop].some((seat: any) : any => 100 - contributions[seat] !== spot.stackBb)) throw new Error(`${spot.id}: final geometry changed`);
  const products = (factors: any) : any => {
    const maps = factors.map(([file, id, action]: any) : any => ({ action, rows: new Map(seen.get(`${file}/${id}`).hands.map((row: any) : any => [row.hand, row])) }));
    const hands = [...maps[0].rows.keys()];
    return hands.map((hand: any) : any => ({ hand, freq: maps.reduce((weight: any, { action, rows }: any) : any => {
      const frequency = rows.get(hand)?.[action];
      if (!Number.isFinite(frequency) || frequency < 0 || frequency > 100) throw new Error(`${spot.id}: invalid saved action ${hand}/${action}`);
      return weight * frequency / 100;
    }, 100) }));
  };
  const allRows = Object.fromEntries(Object.entries<any>(spot.ranges).map(([seat, factors]: any) : any => [seat, products(factors)]));
  if (Object.values<any>(allRows).some((rows: any) : any => !rows.some((row: any) : any => row.freq > 0))) throw new Error(`${spot.id}: saved history is unreachable`);
  return { sources, seatRows: { [spot.oop]: allRows[spot.oop], [spot.ip]: allRows[spot.ip] } };
}

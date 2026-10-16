// Shared read-only inputs for the advisory 3bet EV report and EQR sensitivity.
// Cached Monte Carlo equities avoid re-running expensive range-vs-hand samples.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { equityVsRange, seededRandom, seedFor, weightedRange } from "./equity.ts";
import { raiseEv, replyShares } from "./raise-ev.ts";

const SAMPLES = 3000;
const hash = (value: any) : any => createHash("sha1").update(JSON.stringify(value)).digest("hex").slice(0, 12);

export function createRaiseEquityCache(root?: any, hands?: any) : any {
  const cachePath = join(root, ".local/raise-ev-cache.json");
  const cache = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, "utf8")) : {};
  let dirty = false;
  return {
    table(key?: any, rows?: any) : any {
      const id = `${key}|${hash(rows)}|${SAMPLES}`;
      if (cache[id]) return cache[id];
      const range = weightedRange(rows.map(([hand, weight]: any) : any => ({ hand, weight })));
      const values: Record<string, any> = {};
      for (const hand of hands) values[hand] = equityVsRange(hand, range, SAMPLES, seededRandom(seedFor(`${id}|${hand}`)));
      cache[id] = values;
      dirty = true;
      return values;
    },
    save() : any {
      if (!dirty) return;
      mkdirSync(join(root, ".local"), { recursive: true });
      writeFileSync(cachePath, JSON.stringify(cache));
    },
  };
}

export function createOpenResponseRaiseModel(spot?: any, data?: any, callEquities?: any, equityTable?: any) : any {
  const open = data.opening.spots.find((candidate: any) : any => candidate.hero === spot.opener);
  const reply = data.threeBets.spots.find((candidate: any) : any => candidate.opener === spot.opener && candidate.three_bettor === spot.hero);
  const four = data.fourBets.spots.find((candidate: any) : any => candidate.opener === spot.opener && candidate.hero === spot.hero);
  if (!open || !reply || !spot.three_bet_size_bb) return null;
  const openBy = new Map<string, number>(open.hands.map((row: any) : any => [row.hand, row.open / 100]));
  const weightedReply: any = (action: any) : any => (reply.hands.map((row: any) : any => [row.hand, (openBy.get(row.hand) ?? 0) * row[action] / 100]) as any).filter(([, weight]: any) : any => weight > 0);
  const vsCall = equityTable(`${spot.id}|call`, weightedReply("call"));
  const vsFour = callEquities.spots[four?.id]?.equities ?? equityTable(`${spot.id}|four`, weightedReply("four_bet"));
  const fourBy = new Map((four?.hands ?? ([] as any[])).map((row: any) : any => [row.hand, row]));
  const geometry = { hero: spot.hero, opener: spot.opener, open: spot.open_size_bb, threeBet: spot.three_bet_size_bb, fourBet: reply.four_bet_size_bb, stack: spot.effective_stack_bb };
  const sharesByHand = new Map();
  return {
    evaluate(hand?: any, eqrScale: any = 1) : any {
      if (!sharesByHand.has(hand)) sharesByHand.set(hand, replyShares(hand, open.hands, reply.hands));
      const shares = sharesByHand.get(hand);
      const result = raiseEv(hand, shares, fourBy.get(hand), { vsCall: vsCall[hand], vsFourBet: vsFour[hand] }, geometry, { eqrScale });
      return { ...result, shares };
    },
  };
}

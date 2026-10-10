// Agent戦 results for プレー分析: one record per hand the human played at an Reyson Agent table,
// synced to the account when signed in, or kept in this browser as a guest. Separate from drill history.
import type { HandResult } from "./hand.ts";
import { decodeAgentHistory } from "./agent-history-codec.ts";
import { accountStorage, AGENT_HANDS_KEY, LEGACY_AGENT_HANDS_KEY } from "../account/session.ts";

const KEY = AGENT_HANDS_KEY;
const LIMIT = 3000;
const RAISES = new Set(["open", "raise", "three_bet", "squeeze", "four_bet", "all_in"]);

export type AgentHandRecord = {
  at: number; tableId: string; pos: string; returnBb: number;
  vpip: boolean; pfr: boolean;
  threeBetOpp: boolean; threeBet: boolean;
  facedThreeBet: boolean; foldedToThreeBet: boolean;
  sawFlop: boolean; showdown: boolean; wonShowdown: boolean;
  // Postflop decision counts (absent on records saved before 2026-10-04).
  pfBets?: number; pfCalls?: number; pfFacing?: number; pfFolds?: number;
};

const storage = () => { try { return typeof window === "undefined" ? null : accountStorage(); } catch { return null; } };

export function loadAgentHands(): AgentHandRecord[] {
  try { const store = storage(); const saved = JSON.parse(store?.getItem(KEY) ?? store?.getItem(LEGACY_AGENT_HANDS_KEY) ?? "[]"); const value = decodeAgentHistory(saved); return Array.isArray(value) ? value as AgentHandRecord[] : []; } catch { return []; }
}

export function saveAgentHand(record: AgentHandRecord) {
  const next = [...loadAgentHands(), record].slice(-LIMIT);
  try { storage()?.setItem(KEY, JSON.stringify(next)); } catch { /* storage full or blocked */ }
  return next;
}

// The human's flags for one finished hand.
export function handRecord(result: HandResult, tableId: string, pos: string, at = Date.now()): AgentHandRecord {
  if (result.status !== "done" || !result.returns || !Number.isFinite(result.returns[pos] ?? 0)) throw new Error("Cannot record an unfinished Agent hand");
  const preflop = result.log.filter(entry => entry.street === "preflop");
  const mine = preflop.filter(entry => entry.pos === pos);
  const firstIndex = preflop.findIndex(entry => entry.pos === pos);
  const raisesBefore = preflop.slice(0, Math.max(0, firstIndex)).filter(entry => RAISES.has(entry.action)).length;
  const first = mine[0]?.action;
  const opened = mine.some(entry => entry.action === "open");
  const openIndex = preflop.findIndex(entry => entry.pos === pos && entry.action === "open");
  const reraised = openIndex >= 0 && preflop.slice(openIndex + 1).some(entry => entry.pos !== pos && (entry.action === "three_bet" || entry.action === "squeeze"));
  const afterReraise = reraised ? mine.slice(1)[0]?.action : undefined;
  const foldedPreflop = mine.some(entry => entry.action === "fold");
  const folded = result.log.some(entry => entry.pos === pos && entry.action === "fold");
  const showdown = Boolean(result.showdown) && !folded;
  const postflop = result.log.filter(entry => entry.street !== "preflop" && entry.pos === pos);
  const isBet = (action: string) => action === "raise" || action === "allin" || action.startsWith("bet");
  return {
    at, tableId, pos, returnBb: result.returns?.[pos] ?? 0,
    vpip: mine.some(entry => entry.action !== "fold" && entry.action !== "check"),
    pfr: mine.some(entry => RAISES.has(entry.action)),
    threeBetOpp: raisesBefore === 1 && first !== undefined,
    threeBet: raisesBefore === 1 && (first === "three_bet" || first === "squeeze"),
    facedThreeBet: opened && reraised && afterReraise !== undefined,
    foldedToThreeBet: opened && reraised && afterReraise === "fold",
    sawFlop: !foldedPreflop && result.board.length >= 3 && preflop.length > 0 && (result.log.some(entry => entry.street !== "preflop") || Boolean(result.showdown)),
    showdown, wonShowdown: showdown && Boolean(result.winners?.includes(pos as any)),
    pfBets: postflop.filter(entry => isBet(entry.action)).length,
    pfCalls: postflop.filter(entry => entry.action === "call").length,
    // Facing a bet: the answer is a fold, a call or a raise.
    pfFacing: postflop.filter(entry => ["fold", "call", "raise"].includes(entry.action)).length,
    pfFolds: postflop.filter(entry => entry.action === "fold").length,
  };
}

const rate = (hit: number, total: number) => total ? hit / total : null;

export function summarizeAgentHands(hands: AgentHandRecord[]) {
  const count = (pick: (hand: AgentHandRecord) => boolean) => hands.filter(pick).length;
  const net = hands.reduce((sum, hand) => sum + hand.returnBb, 0);
  const total = (key: "pfBets" | "pfCalls" | "pfFacing" | "pfFolds") => hands.reduce((sum, hand) => sum + (hand[key] ?? 0), 0);
  // Cumulative result in BB, hand by hand (for the trend line).
  let running = 0;
  const trend = hands.map(hand => (running += hand.returnBb));
  return {
    hands: hands.length, netBb: net, bbPer100: hands.length ? net / hands.length * 100 : null,
    vpip: rate(count(h => h.vpip), hands.length),
    pfr: rate(count(h => h.pfr), hands.length),
    threeBet: rate(count(h => h.threeBet), count(h => h.threeBetOpp)),
    foldToThreeBet: rate(count(h => h.foldedToThreeBet), count(h => h.facedThreeBet)),
    wtsd: rate(count(h => h.showdown), count(h => h.sawFlop)),
    wsd: rate(count(h => h.wonShowdown), count(h => h.showdown)),
    // Postflop aggression factor: (bets + raises) / calls; fold to a postflop bet per decision.
    af: total("pfCalls") ? total("pfBets") / total("pfCalls") : null,
    foldToBet: rate(total("pfFolds"), total("pfFacing")),
    samples: { threeBetOpp: count(h => h.threeBetOpp), facedThreeBet: count(h => h.facedThreeBet), sawFlop: count(h => h.sawFlop),
      showdown: count(h => h.showdown), pfFacing: total("pfFacing"), pfCalls: total("pfCalls") },
    trend,
  };
}

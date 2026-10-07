import type { AgentHandRecord } from "../agent/agent-stats.ts";
import type { SessionRow } from "./types.ts";

export type RankedSeason = "human-fastfold-v1" | "fastfold-v1" | "quiz-v1";
export const RANKED_SEASONS: RankedSeason[] = ["human-fastfold-v1", "fastfold-v1", "quiz-v1"];
export type RankedHistoryItem = {
  id: string; at: number; beforeRating: number; afterRating: number;
  answered?: number; accuracy?: number; hero?: string | null; netBb?: number | null;
  heroCards?: string[]; board?: string[]; showdown?: boolean | null;
  log?: { pos: string; street: string; action: string }[] | null;
};
export type RankedHistoryPage = { season: RankedSeason; items: RankedHistoryItem[]; nextCursor: string | null };
export type HistoryRow =
  | { key: string; at: number; mode: "drills"; record: SessionRow }
  | { key: string; at: number; mode: "agent"; record: AgentHandRecord }
  | { key: string; at: number; mode: "ranked"; season: RankedSeason; record: RankedHistoryItem };

export function sessionHistoryRows(practice: SessionRow[], agent: AgentHandRecord[], pages: Partial<Record<RankedSeason, RankedHistoryItem[]>>): HistoryRow[] {
  // Legacy Agent storage has no session/card/action log. Preserve every valid
  // saved hand separately; this display key is never written as a session ID.
  const agentRows: HistoryRow[] = agent.flatMap((record, index) => Number.isFinite(record?.at) && typeof record?.tableId === "string" && typeof record?.pos === "string" && Number.isFinite(record?.returnBb)
    ? [{ key: `agent-hand:${index}:${record.at}`, at: record.at, mode: "agent", record }] : []);
  return [...practice.map(record => ({ key: record.key, at: record.at, mode: "drills" as const, record })), ...agentRows,
    ...RANKED_SEASONS.flatMap(season => (pages[season] ?? []).map(record => ({ key: `ranked:${season}:${record.id}`, at: record.at, mode: "ranked" as const, season, record })))].sort((a, b) => b.at - a.at);
}

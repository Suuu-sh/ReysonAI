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
  | { key: string; at: number; mode: "agent"; record: AgentHandRecord; session?: { id: string; startedAt: number; endedAt?: number; hands: AgentHandRecord[] } }
  | { key: string; at: number; mode: "ranked"; season: RankedSeason; record: RankedHistoryItem };

export function sessionHistoryRows(practice: SessionRow[], agent: AgentHandRecord[], pages: Partial<Record<RankedSeason, RankedHistoryItem[]>>): HistoryRow[] {
  // Only an explicit entry ID groups hands. Never guess a legacy session by table/time.
  const agentRows: Extract<HistoryRow, { mode: "agent" }>[] = [];
  const grouped = new Map<string, Extract<HistoryRow, { mode: "agent" }>>();
  agent.forEach((record, index) => {
    if (!Number.isFinite(record?.at) || typeof record?.tableId !== "string" || typeof record?.pos !== "string" || !Number.isFinite(record?.returnBb)) return;
    const entry = record.session;
    if (!entry?.id || !Number.isFinite(entry.startedAt)) {
      agentRows.push({ key: `agent-hand:${index}:${record.at}`, at: record.at, mode: "agent", record }); return;
    }
    let row = grouped.get(entry.id);
    if (!row) {
      row = { key: `agent-session:${entry.id}`, at: entry.startedAt, mode: "agent", record,
        session: { ...entry, hands: [] } };
      grouped.set(entry.id, row); agentRows.push(row);
    }
    row.session!.hands.push(record);
    if (entry.endedAt != null) row.session!.endedAt = Math.max(row.session!.endedAt ?? 0, entry.endedAt);
  });
  for (const row of grouped.values()) row.session!.hands.sort((a, b) => a.at - b.at);
  return [...practice.map(record => ({ key: record.key, at: record.at, mode: "drills" as const, record })), ...agentRows,
    ...RANKED_SEASONS.flatMap(season => (pages[season] ?? []).map(record => ({ key: `ranked:${season}:${record.id}`, at: record.at, mode: "ranked" as const, season, record })))].sort((a, b) => b.at - a.at);
}

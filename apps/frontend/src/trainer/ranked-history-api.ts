import { humanRequest } from "./human-api.ts";
import type { RankedHistoryPage, RankedSeason } from "./session-history.ts";

export async function loadRankedHistory(season: RankedSeason, cursor: string | null = null): Promise<RankedHistoryPage> {
  const query = new URLSearchParams({ season });
  if (cursor) query.set("cursor", cursor);
  const page = await humanRequest<RankedHistoryPage>(`history?${query}`);
  if (page.season !== season || !Array.isArray(page.items) || page.items.length > 50 || !(page.nextCursor === null || typeof page.nextCursor === "string") ||
    page.items.some(item => typeof item?.id !== "string" || !Number.isFinite(item.at) || !Number.isFinite(item.beforeRating) || !Number.isFinite(item.afterRating))) throw new Error("invalid_history_page");
  return page;
}

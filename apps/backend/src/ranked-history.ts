import { RANKED_LENGTH } from "../../shared/ranked-rules.ts";
import type { D1Database } from "./postflop.ts";

const SOURCES = {
  "human-fastfold-v1": { table: "human_rank_results", id: "table_id", at: "at" },
  "fastfold-v1": { table: "fastfold_results", id: "id", at: "at" },
  "quiz-v1": { table: "ranked_matches", id: "id", at: "completed_at" },
} as const;
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });
const POSITIONS = ["UTG", "HJ", "CO", "BTN", "SB", "BB"];
const cards = (v: unknown) => Array.isArray(v) ? v.filter((c): c is string => typeof c === "string" && /^[2-9TJQKA][shdc]$/.test(c)).slice(0, 5) : [];
type Row = { id: string; at: number; before_rating: number; after_rating: number; public_json?: string; score?: number };

// Read only the authenticated owner's already-saved results. The cursor is a
// result ID resolved again within that owner/season, never client SQL or time.
export async function rankedHistory(db: D1Database, user: string, params: URLSearchParams) {
  const season = params.get("season") ?? "human-fastfold-v1";
  if (!Object.hasOwn(SOURCES, season) || [...params.keys()].some(k => !["season", "cursor"].includes(k) || params.getAll(k).length !== 1)) return reply({ error: "invalid_history_query" }, 400);
  const source = SOURCES[season as keyof typeof SOURCES], quiz = season === "quiz-v1";
  const query = async <T>(sql: string, ...args: unknown[]) => (await db.prepare(sql).bind(...args).all<T>()).results;
  const complete = quiz ? " AND status='complete'" : "";
  const cursor = params.get("cursor");
  let boundary: { id: string; at: number } | undefined;
  if (cursor !== null) {
    if (!/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(cursor)) return reply({ error: "invalid_history_cursor" }, 400);
    [boundary] = await query<{ id: string; at: number }>(`SELECT ${source.id} id,${source.at} at FROM ${source.table} WHERE user_id=? AND ${source.id}=?${complete}`, user, cursor);
    if (!boundary) return reply({ error: "invalid_history_cursor" }, 400);
  }
  const columns = quiz ? "score" : "public_json";
  const rows = await query<Row>(`SELECT ${source.id} id,${source.at} at,before_rating,after_rating,${columns} FROM ${source.table} WHERE user_id=?${complete}${boundary ? ` AND (${source.at}<? OR (${source.at}=? AND ${source.id}<?))` : ""} ORDER BY ${source.at} DESC,${source.id} DESC LIMIT 51`, user, ...(boundary ? [boundary.at, boundary.at, boundary.id] : []));
  const page = rows.slice(0, 50);
  const items = page.map(row => {
    const base = { id: row.id, at: row.at, beforeRating: row.before_rating, afterRating: row.after_rating };
    if (quiz) return { ...base, answered: RANKED_LENGTH, accuracy: row.score! / RANKED_LENGTH };
    const saved = JSON.parse(row.public_json!);
    // Never return arbitrary public_json: exclude identities, private cards,
    // engine state, future boards, seeds, observations and policy internals.
    const hero = POSITIONS.includes(saved.hero) ? saved.hero : null;
    const log = Array.isArray(saved.log) ? saved.log.slice(0, 500).flatMap((entry: any) => {
      const pos = POSITIONS.includes(entry.pos) ? entry.pos : Number.isInteger(entry.seat) ? POSITIONS[entry.seat] : null;
      return pos && ["preflop", "flop", "turn", "river"].includes(entry.street) && typeof entry.action === "string" && /^(fold|call|check|open|raise|three_bet|squeeze|four_bet|all_in|allin|bet(?:\d+)?|raise_\d+|bet_\d+)$/.test(entry.action)
        ? [{ pos, street: entry.street, action: entry.action }] : [];
    }) : null;
    return { ...base, hero, netBb: Number.isFinite(saved.netBb) ? saved.netBb : null,
      heroCards: hero ? cards(saved.holeCards?.[hero]).slice(0, 2) : [], board: cards(saved.board),
      showdown: typeof saved.showdown === "boolean" ? saved.showdown : null, log };
  });
  return reply({ season, items, nextCursor: rows.length > 50 ? page.at(-1)!.id : null });
}

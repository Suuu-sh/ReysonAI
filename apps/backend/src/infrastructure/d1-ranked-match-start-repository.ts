import type { RankedMatchStartRepository, RankedStartMatch } from '../application/ranked-match-start.ts';
import type { D1Database } from '../postflop.ts';

export class D1RankedMatchStartRepository implements RankedMatchStartRepository {
  private readonly db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  async ensurePlayer(userId: string, publicName: string): Promise<void> {
    await this.db.prepare('INSERT OR IGNORE INTO ranked_players(user_id,public_name) VALUES (?,?)')
      .bind(userId, publicName).all();
  }

  async expireActiveMatches(userId: string, now: number): Promise<void> {
    await this.db.prepare("UPDATE ranked_matches SET status='expired' WHERE user_id=? AND status='active' AND expires_at<=?")
      .bind(userId, now).all();
  }

  async findActiveMatch(userId: string): Promise<RankedStartMatch | null> {
    const { results } = await this.db.prepare("SELECT * FROM ranked_matches WHERE user_id=? AND status='active'")
      .bind(userId).all<RankedStartMatch>();
    return results[0] ?? null;
  }

  async reserveDailyStart(input: {
    id: string;
    userId: string;
    day: string;
    now: number;
    expiresAt: number;
    questionsJson: string;
    dailyLimit: number;
  }): Promise<RankedStartMatch | null> {
    const { results } = await this.db.prepare(`INSERT OR IGNORE INTO ranked_matches(id,user_id,day,slot,started_at,expires_at,questions_json) SELECT ?,?,?,COUNT(*)+1,?,?,? FROM ranked_matches WHERE user_id=? AND day=? HAVING COUNT(*)<? RETURNING *`)
      .bind(input.id, input.userId, input.day, input.now, input.expiresAt, input.questionsJson, input.userId, input.day, input.dailyLimit)
      .all<RankedStartMatch>();
    return results[0] ?? null;
  }
}

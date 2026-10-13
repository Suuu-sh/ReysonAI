import type { RankedFinalizationRepository, RankedMatchRecord, RankedPlayerRecord } from '../application/ranked-finalization.ts';
import type { D1Database } from '../postflop.ts';

export class D1RankedFinalizationRepository implements RankedFinalizationRepository {
  private readonly db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  async loadOwnedMatch(matchId: string, userId: string): Promise<RankedMatchRecord | null> {
    const { results } = await this.db.prepare('SELECT * FROM ranked_matches WHERE id=? AND user_id=?')
      .bind(matchId, userId).all<RankedMatchRecord>();
    return results[0] ?? null;
  }

  async loadPlayer(userId: string): Promise<RankedPlayerRecord | null> {
    const { results } = await this.db.prepare('SELECT * FROM ranked_players WHERE user_id=?')
      .bind(userId).all<RankedPlayerRecord>();
    return results[0] ?? null;
  }

  async compareAndFinalize(input: {
    matchId: string;
    userId: string;
    now: number;
    actionsJson: string;
    beforeRating: number;
    afterRating: number;
    score: number;
  }): Promise<void> {
    await this.db.prepare("UPDATE ranked_matches SET status='complete',actions_json=?,completed_at=?,before_rating=?,after_rating=?,score=? WHERE id=? AND user_id=? AND status='active' AND expires_at>? AND (SELECT rating FROM ranked_players WHERE user_id=?)=? RETURNING id")
      .bind(input.actionsJson, input.now, input.beforeRating, input.afterRating, input.score, input.matchId, input.userId, input.now, input.userId, input.beforeRating)
      .all<{ id: string }>();
  }

  async reloadOwnedMatch(matchId: string, userId: string): Promise<RankedMatchRecord | null> {
    const { results } = await this.db.prepare('SELECT * FROM ranked_matches WHERE id=? AND user_id=?')
      .bind(matchId, userId).all<RankedMatchRecord>();
    return results[0] ?? null;
  }
}

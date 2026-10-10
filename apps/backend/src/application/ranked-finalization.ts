import { gradeRanked } from '../domain/ranked-quiz.ts';
import type { RankedQuestion } from '../domain/ranked-quiz.ts';
import { rateMatch } from '../../../shared/ranked-rules.ts';

export type RankedMatchRecord = {
  id: string;
  user_id: string;
  questions_json: string;
  actions_json: string | null;
  status: string;
  expires_at: number;
  completed_at: number;
  before_rating: number;
  after_rating: number;
  score: number;
};

export type RankedPlayerRecord = {
  user_id: string;
  public_name: string;
  rating: number;
  peak: number;
  matches: number;
};

export type RankedFinalizationRepository = {
  loadOwnedMatch(matchId: string, userId: string): Promise<RankedMatchRecord | null>;
  loadPlayer(userId: string): Promise<RankedPlayerRecord | null>;
  compareAndFinalize(input: {
    matchId: string;
    userId: string;
    now: number;
    actionsJson: string;
    beforeRating: number;
    afterRating: number;
    score: number;
  }): Promise<void>;
  reloadOwnedMatch(matchId: string, userId: string): Promise<RankedMatchRecord | null>;
};

export type RankedFinalizationResult =
  | { kind: 'not_found' }
  | { kind: 'conflict' }
  | { kind: 'expired' }
  | { kind: 'finalized'; match: RankedMatchRecord };

export async function finalizeRankedMatch(
  repository: RankedFinalizationRepository,
  userId: string,
  matchId: string,
  actions: unknown,
  now: number,
): Promise<RankedFinalizationResult> {
  const match = await repository.loadOwnedMatch(matchId, userId);
  if (!match) return { kind: 'not_found' };

  const log = gradeRanked(JSON.parse(match.questions_json) as RankedQuestion[], actions);
  const actionsJson = JSON.stringify(actions);

  if (match.status === 'complete') {
    return match.actions_json === actionsJson
      ? { kind: 'finalized', match }
      : { kind: 'conflict' };
  }
  if (match.status !== 'active' || match.expires_at <= now) return { kind: 'expired' };

  const player = await repository.loadPlayer(userId);
  // Preserve the route's existing failure behavior if a player row is missing.
  const beforeRating = player!.rating;
  const afterRating = Math.max(0, rateMatch(beforeRating, log));
  const score = log.reduce((sum, value) => sum + value.score, 0);

  await repository.compareAndFinalize({
    matchId: match.id,
    userId,
    now,
    actionsJson,
    beforeRating,
    afterRating,
    score,
  });

  const saved = await repository.reloadOwnedMatch(match.id, userId);
  if (saved!.status !== 'complete' || saved!.actions_json !== actionsJson) return { kind: 'conflict' };
  return { kind: 'finalized', match: saved! };
}

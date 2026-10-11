import type { RankedQuestion } from '../domain/ranked-quiz.ts';

export type RankedStartMatch = {
  id: string;
  user_id: string;
  questions_json: string;
  status: string;
  expires_at: number;
};

export type RankedMatchStartRepository = {
  ensurePlayer(userId: string, publicName: string): Promise<void>;
  expireActiveMatches(userId: string, now: number): Promise<void>;
  findActiveMatch(userId: string): Promise<RankedStartMatch | null>;
  reserveDailyStart(input: {
    id: string;
    userId: string;
    day: string;
    now: number;
    expiresAt: number;
    questionsJson: string;
    dailyLimit: number;
  }): Promise<RankedStartMatch | null>;
};

export type RankedMatchStartResult =
  | { kind: 'existing'; match: RankedStartMatch }
  | { kind: 'started'; match: RankedStartMatch }
  | { kind: 'daily_limit' };

export async function startRankedMatch(
  repository: RankedMatchStartRepository,
  input: {
    userId: string;
    day: string;
    now: number;
    publicName: string;
    questions: RankedQuestion[];
    dailyLimit: number;
  },
  createMatchId: () => string,
): Promise<RankedMatchStartResult> {
  await repository.ensurePlayer(input.userId, input.publicName);
  await repository.expireActiveMatches(input.userId, input.now);

  const existing = await repository.findActiveMatch(input.userId);
  if (existing) return { kind: 'existing', match: existing };

  // Keep ID generation after the active-match check, as in the original route.
  const inserted = await repository.reserveDailyStart({
    id: createMatchId(),
    userId: input.userId,
    day: input.day,
    now: input.now,
    expiresAt: input.now + 3600000,
    questionsJson: JSON.stringify(input.questions),
    dailyLimit: input.dailyLimit,
  });
  if (inserted) return { kind: 'started', match: inserted };

  // A concurrent request may have won the partial unique active-match index.
  const raced = await repository.findActiveMatch(input.userId);
  return raced ? { kind: 'existing', match: raced } : { kind: 'daily_limit' };
}

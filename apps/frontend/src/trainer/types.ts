export interface TrainerSettings {
  kinds: string[]; positions: string[]; count: number;
  difficulty: string; strictness: string; review: boolean;
}
export interface TrainerSpot {
  id: string; kind: "open" | "response"; hero: string; opener: string | null; openSize: number;
  actions: { key: string; label: string }[]; byHand: Map<string, Record<string, number>>;
}
export type AnswerResult = "best" | "mixed" | "miss";
export interface GradedAnswer { result: AnswerResult; frequency: number; best: string; mix: Record<string, number>; score: number }
export interface AnswerEntry {
  spotId: string; hand: string; cards?: string[]; action: string; result: AnswerResult;
  score: number; best?: string; mix?: Record<string, number>; at?: number; frequency?: number;
}
export interface PracticeSession {
  id?: string; at: number; answered: number; score: number; best?: number; mixed?: number; miss?: number;
  durationMs: number | null; hands: AnswerEntry[] | null;
}
export interface Drill { id: string; name: string; settings: TrainerSettings; preset?: boolean; createdAt: number; sessions: PracticeSession[] }
export interface DrillQuestion { spot: TrainerSpot; hand: string; cards: string[]; review: boolean }
export interface SessionProgress { answered: number; score: number; streak: number; bestStreak: number; results: AnswerResult[]; log: AnswerEntry[] }
export interface DrillDraft {
  key: string; drillId: string; drillName: string; reviewOnly: boolean; settings: TrainerSettings; savedAt: number; elapsedMs: number;
  question: { spotId: string; hand: string; cards: string[]; review: boolean }; answerAction: string | null; session: SessionProgress;
}
export type DrillDrafts = Record<string, DrillDraft>;
export interface SessionRow { key: string; drillId?: string; name: string; status: string; kind: string; at: number; answered: number; score: number; durationMs: number | null; hands: AnswerEntry[] | null }

export type NamedDrill = Pick<Drill, "id" | "name" | "settings">;
export interface RankedMatch { id?: string; at: number; before: number; after: number; accuracy: number; answered: number }
export interface IssuedMatch { id: string; expiresAt?: number; questions: { spotId: string; hand: string; mix: Record<string, number> }[] }
export interface RankState { rating: number; peak: number; matches: RankedMatch[]; remaining?: number; totalMatches?: number; active?: IssuedMatch | null }
export interface LeaderboardPlayer { id?: string; name: string; rating: number; gain: number; matches: number; accuracy: number; self?: boolean; place?: number | null }

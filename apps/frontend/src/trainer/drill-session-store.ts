// In-progress drills are separate from completed attempts and answer history.
// They are stored in this browser so a learner can leave and resume later.
import { grade, normalizeSettings, randomSuits, spotById, spotsForSettings } from "./trainer-data.ts";

const KEY = "solveaai.trainer.drafts.v1";
const VALID_RESULTS = new Set(["best", "mixed", "miss"]);
const RANKS = new Set([ ..."23456789TJQKA" ]);
const SUITS = new Set(["s", "h", "d", "c"]);

function validHand(spot, hand) {
  return typeof hand === "string" && spot?.byHand.has(hand);
}

function validCards(cards, hand) {
  if (!Array.isArray(cards) || cards.length !== 2 || !cards.every(card => typeof card === "string" && card.length === 2
    && RANKS.has(card[0]) && SUITS.has(card[1]))) return false;
  if (cards[0] === cards[1] || cards[0][0] !== hand[0] || cards[1][0] !== hand[1]) return false;
  if (hand.length === 2) return cards[0][1] !== cards[1][1];
  return hand[2] === "s" ? cards[0][1] === cards[1][1] : cards[0][1] !== cards[1][1];
}

function cardsFor(cards, hand) {
  return validCards(cards, hand) ? [...cards] : randomSuits(hand, () => 0.1);
}

function validEntry(entry, strictness) {
  const spot = spotById.get(entry?.spotId);
  if (!validHand(spot, entry?.hand) || !spot.actions.some(action => action.key === entry?.action)) return null;
  const graded = grade(spot, entry.hand, entry.action, { strictness });
  return { spotId: spot.id, hand: entry.hand, cards: cardsFor(entry.cards, entry.hand), action: entry.action,
    result: graded.result, score: graded.score, best: graded.best, mix: graded.mix };
}

function validateDraft(key, value) {
  if (!value || typeof value !== "object" || value.key !== key || typeof value.drillName !== "string") return null;
  const reviewOnly = Boolean(value.reviewOnly);
  if (key !== "review" && (typeof value.drillId !== "string" || value.drillId !== key)) return null;
  const settings = normalizeSettings(value.settings);
  const questionSpot = spotById.get(value.question?.spotId);
  if (!validHand(questionSpot, value.question?.hand)) return null;
  if (!reviewOnly && !spotsForSettings(settings).some(spot => spot.id === questionSpot.id)) return null;

  const question = { spot: questionSpot, hand: value.question.hand, cards: cardsFor(value.question.cards, value.question.hand),
    review: Boolean(value.question.review) };
  const log = (Array.isArray(value.session?.log) ? value.session.log : []).map(entry => validEntry(entry, settings.strictness)).filter(Boolean);
  const answeredEntry = log.at(-1);
  const requestedAction = typeof value.answerAction === "string" ? value.answerAction : null;
  const answerMatches = requestedAction && answeredEntry?.spotId === question.spot.id && answeredEntry.hand === question.hand
    && answeredEntry.action === requestedAction;
  const answer = answerMatches && questionSpot.actions.some(action => action.key === requestedAction)
    ? { action: requestedAction, ...grade(questionSpot, question.hand, requestedAction, { strictness: settings.strictness }) } : null;

  let streak = 0, bestStreak = 0;
  for (const entry of log) {
    streak = entry.result === "miss" ? 0 : streak + 1;
    bestStreak = Math.max(bestStreak, streak);
  }
  return {
    key, drillId: key === "review" ? "review" : key, drillName: value.drillName.slice(0, 40) || "無題のドリル", reviewOnly,
    settings, savedAt: Number.isFinite(value.savedAt) ? value.savedAt : Date.now(),
    elapsedMs: Math.max(0, Number.isFinite(value.elapsedMs) ? value.elapsedMs : 0),
    question: { spotId: question.spot.id, hand: question.hand, cards: question.cards, review: question.review },
    answerAction: answer?.action ?? null,
    session: { answered: log.length, score: log.reduce((sum, entry) => sum + entry.score, 0), streak, bestStreak,
      results: log.slice(-10).map(entry => entry.result), log },
  };
}

export function restoreDrillDraft(draft) {
  const safe = validateDraft(draft?.key, draft);
  if (!safe) return null;
  const spot = spotById.get(safe.question.spotId);
  return { ...safe, question: { ...safe.question, spot },
    answer: safe.answerAction ? { action: safe.answerAction, ...grade(spot, safe.question.hand, safe.answerAction, { strictness: safe.settings.strictness }) } : null };
}

export function loadDrillDrafts() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(KEY) ?? "{}");
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) return {};
    return Object.fromEntries(Object.entries(stored).map(([key, value]) => [key, validateDraft(key, value)]).filter(([, value]) => value));
  } catch { return {}; }
}

function persist(drafts) {
  try { window.localStorage.setItem(KEY, JSON.stringify(drafts)); } catch {}
}

export function saveDrillDraft(drafts, draft) {
  const safe = validateDraft(draft?.key, draft);
  if (!safe) return drafts;
  const updated = { ...drafts, [safe.key]: safe };
  persist(updated);
  return updated;
}

export function removeDrillDraft(drafts, key) {
  if (!Object.hasOwn(drafts, key)) return drafts;
  const updated = { ...drafts };
  delete updated[key];
  persist(updated);
  return updated;
}

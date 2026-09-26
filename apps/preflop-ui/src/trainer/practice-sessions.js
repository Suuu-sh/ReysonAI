// Completed attempts and their exact answer logs stay in this browser.
// Named drill attempts live with their drill; review attempts are separate.
const REVIEW_KEY = "solveaai.trainer.review-sessions.v1";
const SESSION_LIMIT = 50;
const RESULTS = new Set(["best", "mixed", "miss"]);

function validAnswer(entry) {
  return entry && typeof entry.spotId === "string" && typeof entry.hand === "string"
    && Array.isArray(entry.cards) && entry.cards.length === 2 && entry.cards.every(card => typeof card === "string")
    && typeof entry.action === "string" && RESULTS.has(entry.result) && Number.isFinite(entry.score);
}

export function validSession(session) {
  if (!Number.isFinite(session?.at) || !Number.isFinite(session?.answered) || session.answered <= 0
    || !Number.isFinite(session?.score)) return null;
  const hands = Array.isArray(session.hands) && session.hands.length === session.answered && session.hands.every(validAnswer)
    ? session.hands.map(entry => ({ ...entry, cards: [...entry.cards] })) : null;
  return { ...session, hands, durationMs: Number.isFinite(session.durationMs) ? session.durationMs : null };
}

export function newSessionRecord(log, durationMs, at = Date.now()) {
  const counts = { best: 0, mixed: 0, miss: 0 };
  for (const entry of log) counts[entry.result]++;
  return { id: `session-${at.toString(36)}-${Math.random().toString(36).slice(2, 8)}`, at,
    answered: log.length, score: log.reduce((sum, entry) => sum + entry.score, 0),
    ...counts, durationMs: Math.max(0, durationMs), hands: log.map(entry => ({ ...entry, cards: [...entry.cards] })) };
}

export function loadReviewSessions() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(REVIEW_KEY) ?? "[]");
    return Array.isArray(saved) ? saved.map(validSession).filter(Boolean).slice(-SESSION_LIMIT) : [];
  } catch { return []; }
}

export function recordReviewSession(sessions, session) {
  const next = [...sessions, session].slice(-SESSION_LIMIT);
  try { window.localStorage.setItem(REVIEW_KEY, JSON.stringify(next)); } catch {}
  return next;
}

export function practiceSessionRows(drills, reviews, drafts) {
  const completed = drills.flatMap(drill => drill.sessions.map((session, index) => ({
    ...session, key: `drill:${drill.id}:${session.id ?? `${session.at}:${index}`}`,
    drillId: drill.id, name: drill.name, status: "completed", kind: "drill",
  })));
  const reviewRows = reviews.map((session, index) => ({
    ...session, key: `review:${session.id ?? `${session.at}:${index}`}`,
    name: "復習ドリル", status: "completed", kind: "review",
  }));
  const ongoing = Object.entries(drafts).map(([key, draft]) => ({
    key: `draft:${key}`, drillId: key, name: draft.drillName, status: "draft", kind: draft.reviewOnly ? "review" : "drill",
    at: draft.savedAt, answered: draft.session.answered, score: draft.session.score,
    durationMs: draft.elapsedMs, hands: draft.session.log,
  }));
  return [...ongoing, ...completed, ...reviewRows].sort((a, b) => b.at - a.at);
}

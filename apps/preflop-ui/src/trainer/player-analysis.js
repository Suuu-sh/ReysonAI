// Practice-choice analysis. Compare each answer with the saved policy for the
// *same* spot and hand; raw VPIP/3bet rates would be distorted by drill setup.
import { spotById, spotTitle } from "./trainer-data.js";

const MIN_SAMPLES = 30;
const MIN_PER_KIND = 10;

function validSample(entry) {
  const spot = spotById.get(entry?.spotId);
  const rawMix = spot?.byHand.get(entry?.hand);
  if (!rawMix || !spot.actions.some(action => action.key === entry.action)) return null;
  // SB's saved open range also contains limp, but this version of the drill
  // offers only fold/open. Compare conditionally on the available choices.
  const offeredTotal = spot.actions.reduce((sum, action) => sum + (rawMix[action.key] ?? 0), 0);
  if (offeredTotal <= 0) return null;
  const mix = Object.fromEntries(spot.actions.map(action => [action.key, (rawMix[action.key] ?? 0) / offeredTotal]));
  return { spot, hand: entry.hand, action: entry.action, mix };
}

function cohort(samples, actual, expected) {
  const count = samples.length;
  if (!count) return { count: 0, actual: null, expected: null, delta: null };
  const actualRate = samples.reduce((sum, item) => sum + actual(item), 0) / count;
  const expectedRate = samples.reduce((sum, item) => sum + expected(item), 0) / count;
  return { count, actual: actualRate, expected: expectedRate, delta: actualRate - expectedRate };
}

export function analyzePlayer(history) {
  // Review drills may ask the same hand repeatedly. Keep its latest answer so
  // one difficult hand cannot decide the player's entire style label.
  const latest = new Map();
  for (const entry of Array.isArray(history) ? history : []) {
    const sample = validSample(entry);
    if (sample) latest.set(`${sample.spot.id}|${sample.hand}`, sample);
  }
  const samples = [...latest.values()];
  const opens = samples.filter(item => item.spot.kind === "open");
  const responses = samples.filter(item => item.spot.kind === "response");
  const distinctSpots = new Set(samples.map(item => item.spot.id)).size;
  const ready = samples.length >= MIN_SAMPLES && opens.length >= MIN_PER_KIND && responses.length >= MIN_PER_KIND && distinctSpots >= 3;

  const metrics = {
    fold: cohort(samples, item => +(item.action === "fold"), item => item.mix.fold),
    open: cohort(opens, item => +(item.action === "open"), item => item.mix.open),
    continue: cohort(responses, item => +(item.action !== "fold"), item => item.mix.call + item.mix.three_bet),
    call: cohort(responses, item => +(item.action === "call"), item => item.mix.call),
    threeBet: cohort(responses, item => +(item.action === "three_bet"), item => item.mix.three_bet),
  };

  let style = { label: "分析中", key: "pending", explanation: "オープンと対オープンの両方を、複数の局面で練習すると傾向を表示します。" };
  if (ready) {
    const fold = metrics.fold.delta, threeBet = metrics.threeBet.delta, call = metrics.call.delta;
    if (fold >= 0.15 && threeBet <= 0.05) style = { label: "NIT寄り", key: "nit", explanation: "同じ問題に対する推定方針よりフォールドが多く、3betも増えていません。" };
    else if (fold >= 0.10 && threeBet >= 0.10) style = { label: "TAG寄り", key: "tag", explanation: "参加は絞りつつ、対オープンでは3betを多く選んでいます。" };
    else if (fold <= -0.10 && threeBet >= 0.10) style = { label: "LAG寄り", key: "lag", explanation: "参加が広く、対オープンでは3betも多く選んでいます。" };
    else if (fold <= -0.10 && call >= 0.10) style = { label: "コール過多寄り", key: "calling", explanation: "参加が広く、対オープンではコールを多く選んでいます。" };
    else if (fold >= 0.10) style = { label: "タイト寄り", key: "tight", explanation: "同じ問題に対する推定方針よりフォールドを多く選んでいます。" };
    else if (threeBet >= 0.10) style = { label: "攻撃的寄り", key: "aggressive", explanation: "対オープンで3betを多く選んでいます。" };
    else if (threeBet <= -0.10) style = { label: "受動的寄り", key: "passive", explanation: "対オープンで3betを少なく選んでいます。" };
    else style = { label: "基準に近い", key: "balanced", explanation: "練習した問題では、主な行動頻度が保存済み推定方針に近い状態です。" };
  }

  const bySpot = [...new Set(samples.map(item => item.spot))].map(spot => {
    const spotSamples = samples.filter(item => item.spot.id === spot.id);
    return { id: spot.id, label: spotTitle(spot), ...cohort(spotSamples, item => +(item.action === "fold"), item => item.mix.fold) };
  }).filter(item => item.count >= 5).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || b.count - a.count);

  return { answered: Array.isArray(history) ? history.length : 0, samples: samples.length, openSamples: opens.length,
    responseSamples: responses.length, distinctSpots, ready, style, metrics, bySpot };
}

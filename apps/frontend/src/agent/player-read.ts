// What the Evion Agents "know" about the human: statistics over the latest 1000 Agent-game hands,
// compared with the agents' own balanced play (agent-baseline.json). The read names a play
// style and the tendencies an opponent would target. Exploiting them needs opponent-adjusted
// range tables (not made yet), so today the read is shown and handed to the agents, who still
// play the balanced estimate. Labels describe practice tendencies, not a diagnosis.
import baseline from "./agent-baseline.json" with { type: "json" };
import { summarizeAgentHands, type AgentHandRecord } from "./agent-stats.ts";

export const READ_WINDOW = 1000;
export const READ_MIN_HANDS = 30;
export const READ_SETTLED_HANDS = 300;
export const AGENT_BASELINE = baseline;

type Text = { ja: string; en: string };
export type StyleId = "collecting" | "balanced" | "nit" | "tag" | "tight_passive" | "lag" | "station" | "passive" | "aggressive";
export type PlayStyle = { id: StyleId; name: Text; summary: Text };
export type Tendency = { id: string; stat: string; label: Text; target: Text; you: number; base: number; gap: number };
export type PlayerRead = {
  window: number; hands: number; confidence: "collecting" | "provisional" | "settled";
  stats: ReturnType<typeof summarizeAgentHands>; style: PlayStyle;
  // x: looser (+) / tighter (-) than the agents; y: more (+) / less (-) aggressive preflop. Null until enough hands.
  map: { x: number; y: number } | null;
  tendencies: Tendency[];
  exploitReady: false;
};

const STYLES: Record<StyleId, PlayStyle> = {
  collecting: { id: "collecting", name: { ja: "読み取り中", en: "Reading" }, summary: { ja: `${READ_MIN_HANDS}ハンドを超えると傾向を判定します。`, en: `A style appears after ${READ_MIN_HANDS} hands.` } },
  balanced: { id: "balanced", name: { ja: "バランス型", en: "Balanced" }, summary: { ja: "参加率もレイズ率もAgentの基準に近い打ち方です。", en: "Close to the agents' own entry and raise rates." } },
  nit: { id: "nit", name: { ja: "NIT", en: "Nit" }, summary: { ja: "参加がかなり少なく、強いハンドに絞っています。", en: "Plays far fewer hands, mostly strong ones." } },
  tag: { id: "tag", name: { ja: "TAG", en: "TAG" }, summary: { ja: "参加は絞りつつ、入るときはレイズで入ります。", en: "Selective, and raises when it enters." } },
  tight_passive: { id: "tight_passive", name: { ja: "タイト・パッシブ", en: "Tight-passive" }, summary: { ja: "参加が少なく、入るときもコールが多めです。", en: "Plays few hands and often just calls." } },
  lag: { id: "lag", name: { ja: "LAG", en: "LAG" }, summary: { ja: "広く参加し、レイズで主導権を取りにいきます。", en: "Plays many hands and raises them." } },
  station: { id: "station", name: { ja: "コーリングステーション", en: "Calling station" }, summary: { ja: "広く参加し、レイズよりコールが多めです。", en: "Plays many hands and calls more than it raises." } },
  passive: { id: "passive", name: { ja: "パッシブ寄り", en: "Passive-leaning" }, summary: { ja: "参加率は基準並みで、レイズが少なめです。", en: "Normal entry rate, fewer raises." } },
  aggressive: { id: "aggressive", name: { ja: "アグレッシブ寄り", en: "Aggressive-leaning" }, summary: { ja: "参加率は基準並みで、レイズが多めです。", en: "Normal entry rate, more raises." } },
};

const clamp = (value: number, limit = 1) => Math.max(-limit, Math.min(limit, value));

export function playerRead(all: AgentHandRecord[]): PlayerRead {
  const hands = all.slice(-READ_WINDOW);
  const stats = summarizeAgentHands(hands);
  const confidence = hands.length < READ_MIN_HANDS ? "collecting" : hands.length < READ_SETTLED_HANDS ? "provisional" : "settled";
  const empty = { window: READ_WINDOW, hands: hands.length, confidence, stats, exploitReady: false } as const;
  if (confidence === "collecting" || stats.vpip == null || stats.pfr == null) return { ...empty, style: STYLES.collecting, map: null, tendencies: [] };

  const looseness = stats.vpip - baseline.vpip;
  const ratio = stats.vpip > 0 ? stats.pfr / stats.vpip : 0;
  const baseRatio = baseline.pfr / baseline.vpip;
  const aggression = ratio - baseRatio;
  const loose = looseness > 0.06, tight = looseness < -0.06, passive = aggression < -0.15, aggressive = aggression > 0.15;
  const style = looseness < -0.12 ? STYLES.nit
    : tight ? (passive ? STYLES.tight_passive : STYLES.tag)
    : loose ? (passive ? STYLES.station : STYLES.lag)
    : passive ? STYLES.passive : aggressive ? STYLES.aggressive : STYLES.balanced;

  // Tendencies an opponent would target, largest gap first. Each needs its own sample.
  const s = stats.samples, list: Tendency[] = [];
  const add = (id: string, stat: string, you: number | null, base: number | null, ok: boolean, gap: number, label: Text, target: Text) => {
    if (ok && you != null && base != null && Math.abs(you - base) >= gap) list.push({ id, stat, label, target, you, base, gap: Math.abs(you - base) / gap });
  };
  const vpip = stats.vpip;
  if (vpip > baseline.vpip) add("vpip_high", "VPIP", vpip, baseline.vpip, true, 0.08, { ja: "参加しすぎ", en: "Plays too many hands" }, { ja: "強いレンジでアイソレートし、3betを増やす", en: "Isolate and 3bet you with stronger ranges" });
  else add("vpip_low", "VPIP", vpip, baseline.vpip, true, 0.08, { ja: "参加が少なすぎ", en: "Plays too few hands" }, { ja: "スチールを増やし、ブラインドを広く奪う", en: "Steal your blinds more often" });
  const f3b = stats.foldToThreeBet;
  if (f3b != null && f3b > baseline.foldToThreeBet) add("f3b_high", "Fold to 3bet", f3b, baseline.foldToThreeBet, s.facedThreeBet >= 10, 0.15, { ja: "3betに降りすぎ", en: "Folds too much to 3bets" }, { ja: "あなたのオープンに3betを増やす", en: "3bet your opens more" });
  else add("f3b_low", "Fold to 3bet", f3b, baseline.foldToThreeBet, s.facedThreeBet >= 10, 0.15, { ja: "3betに降りなさすぎ", en: "Rarely folds to 3bets" }, { ja: "3betをバリュー寄りにする", en: "3bet you with value-heavy ranges" });
  add("three_bet_low", "3bet", stats.threeBet, baseline.threeBet, s.threeBetOpp >= 20 && (stats.threeBet ?? 1) < baseline.threeBet, 0.04, { ja: "3betが少ない", en: "Rarely 3bets" }, { ja: "あなたの前でオープンを広げる", en: "Open wider in front of you" });
  const wtsd = stats.wtsd;
  if (wtsd != null && wtsd > baseline.wtsd) add("wtsd_high", "WTSD", wtsd, baseline.wtsd, s.sawFlop >= 20, 0.08, { ja: "ショーダウンまで行きすぎ", en: "Goes to showdown too often" }, { ja: "ブラフを減らし、薄いバリューベットを増やす", en: "Bluff less and value bet thinner" });
  else add("wtsd_low", "WTSD", wtsd, baseline.wtsd, s.sawFlop >= 20, 0.08, { ja: "ショーダウン前に降りすぎ", en: "Gives up before showdown" }, { ja: "ブラフを増やす", en: "Bluff more" });
  add("fold_to_bet_high", "Fold to bet", stats.foldToBet, baseline.foldToBet, s.pfFacing >= 20 && (stats.foldToBet ?? 0) > baseline.foldToBet, 0.1, { ja: "ベットに降りすぎ", en: "Folds too much to bets" }, { ja: "小さいベットでのブラフを増やす", en: "Bluff more with small bets" });
  add("af_low", "AF", stats.af, baseline.af, s.pfCalls >= 15 && (stats.af ?? 99) < baseline.af, baseline.af * 0.4, { ja: "ポストフロップが受け身", en: "Passive after the flop" }, { ja: "ベットされたら降りやすくし、チェックで回す", en: "Respect your bets and check behind more" });
  list.sort((a, b) => b.gap - a.gap);

  return { ...empty, style, map: { x: clamp(looseness / 0.2), y: clamp(aggression / 0.35) }, tendencies: list.slice(0, 4) };
}

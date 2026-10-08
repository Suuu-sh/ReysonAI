import type { Stage3Hand, Stage3ReasonFacts, Stage3ReasonSpot, Stage3SavedReasons, Stage3CompactReasons } from "./stage3-types.ts";
import type { DetailedReason, DetailedReasonDataset } from "./english-reasons.ts";
// Versioned display-only templates. Saved numerical facts remain authoritative;
// expansion never computes a strategy or samples an equity.
import { hands } from "../data.ts";
const ACTIONS = ["fold", "call", "squeeze", "four_bet", "all_in"] as const;
const NAMES = { squeeze: "スクイーズ", fold: "フォールド", call: "コール", four_bet: "4bet", all_in: "オールイン" };
const round = (value: number | null) => value === null ? null : Math.round(value * 1e6) / 1e6;
const number = (value: number) => Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
const pct = (value: number) => value.toFixed(1);
const ev = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(2)}BB`;
function handGroup(hand: string) {
  if (["AA", "KK"].includes(hand)) return "最上位ペア";
  if (hand.length === 2) return "ペア";
  if (["AKs", "AKo", "AQs", "AQo"].includes(hand)) return "高いAを含むハンド";
  if (["A5s", "A4s"].includes(hand)) return "Aのブロッカーとホイールの伸びしろを持つスーテッドハンド";
  if (hand.endsWith("s")) return "フラッシュへの伸びしろがあるスーテッドハンド";
  return "フラッシュへの伸びしろを持たないオフスートハンド";
}

function raiseReason(row: Stage3Hand) {
  if (row.squeeze + row.four_bet + row.all_in === 0) return "";
  const name = row.squeeze ? "スクイーズ" : row.four_bet ? "4bet" : "オールイン";
  const destination = `総額${number(row.raise_to_size_bb!)}BBの${name}`;
  if (["AA", "KK", "QQ", "AKs", "AKo"].includes(row.hand)) return `${handGroup(row.hand)}をバリュー候補として${destination}にも配分した独立推定です。`;
  if (["A5s", "A4s"].includes(row.hand)) return `AでAA・AKの組合せを減らし、スートとホイールの伸びしろを使う少量ブラフ候補として${destination}に配分しています。`;
  return `${handGroup(row.hand)}の中で強さ順と参加者数を考慮し、${destination}へ限定的に配分した独立推定です。`;
}

function callReason(row: Stage3Hand, facts: Stage3ReasonFacts, spot: Stage3ReasonSpot) {
  if (spot.bet_level === 5) {
    const reduced = row.call < facts.all_in_target_call_pct!;
    return `オールインではEQR=1、コールEVは${ev(facts.call_ev_bb!)}。必要勝率との差${facts.equity_margin_pct! >= 0 ? "+" : ""}${pct(facts.equity_margin_pct!)}ptから共通±2pt帯・5%刻みではコール${facts.all_in_target_call_pct}%${reduced ? `ですが、同じ手役群・スート間の強さ順上限で${row.call}%へ抑えています` : "としています"}。`;
  }
  const measurement = `勝率${pct(facts.equity_pct!)}%×仮定EQR ${round(facts.eqr)}で実現後${pct(facts.realized_equity_pct!)}%、コールEVは${ev(facts.call_ev_bb!)}です。`;
  if (facts.call_ev_bb! < -0.05) return `${measurement}共通ゲートの−0.05BB未満なのでコールを除外しています。`;
  if (row.call === 0) return `${measurement}この値だけで参加を決めず、独立した手役群の配分と強さ順制約を反映してコールは0%です。`;
  const boundary = facts.call_ev_bb! < 0.05 ? "共通境界帯ではコールを最大50%に制限します。" : "";
  const protect = ["AA", "KK", "QQ", "AKs"].includes(row.hand)
    ? "強い候補をコールにも残し、コールレンジの保護を意図しています。"
    : `${handGroup(row.hand)}の継続候補を、価格と仮定の実現率で絞っています。`;
  return `${measurement}${boundary}${protect}`;
}

export function composeStage3Reason(row: Stage3Hand, facts: Stage3ReasonFacts, spot: Stage3ReasonSpot) {
  if (facts.unreachable_reason) return facts.unreachable_reason;
  const remaining = spot.pending_actors.length
    ? `未応答は${spot.pending_actors.join("・")}で、その将来の追加コール額は足していません。`
    : "Hero以外にこの賭け額への未応答者はいません。";
  const context = `${spot.family_label}の続きで、${spot.hero}は${spot.role}です。既投入${number(spot.hero_invested_bb)}BBから追加${number(spot.cost_to_call_bb)}BBを払い総額${number(spot.facing_size_bb)}BBへコールすると、実際のポットは${number(spot.total_pot_after_call_bb)}BB（うちフォールド済みのデッドマネー${number(spot.dead_money_bb)}BB）です。`;
  const dead = spot.dead_opponents.length ? `途中フォールドした${spot.dead_opponents.join("・")}の保存レンジはカードの使用可能性だけに反映します。` : "";
  const assumption = `${spot.opponents.join("・")}全員のここまでの保存行動の積で加重した到達レンジへの推定勝率${pct(facts.equity_pct!)}%、レーキ後の必要勝率${pct(spot.call_break_even_equity_pct)}%を使います。${remaining}${dead}`;
  const mix = `最終配分は${ACTIONS.filter(action => row[action] > 0).map(action => `${NAMES[action]} ${row[action]}%`).join("・")}。`;
  return `${context}${assumption}${callReason(row, facts, spot)}${raiseReason(row)}${mix}`;
}

export const STAGE3_FACT_LABELS = [
  { key: "equity_pct", label: "推定勝率（全ライブ相手の現在到達レンジ）", scope: "hand" },
  { key: "realized_equity_pct", label: "実現後の勝率（仮定EQR）", scope: "hand" },
  { key: "call_ev_bb", label: "コールEV（将来の追加投資なし）", scope: "hand", unit: "bb" },
  { key: "reach_pct", label: "この履歴でのHero到達率", scope: "hand" },
  { key: "call_break_even_equity_pct", label: "レーキ後のコール必要勝率", scope: "spot" },
  { key: "cost_to_call_bb", label: "今回追加するコール額", scope: "spot", unit: "bb" },
  { key: "total_pot_after_call_bb", label: "Heroコール後の実際のポット", scope: "spot", unit: "bb" },
  { key: "dead_money_bb", label: "フォールド済みのデッドマネー", scope: "spot", unit: "bb" },
  ...ACTIONS.map(action => ({ key: `weighted_${action}_pct`, label: `自分の到達コンボ加重の${NAMES[action]}頻度`, scope: "spot" })),
];

export const STAGE3_REASON_METHOD = "保存された最終169ハンド頻度と固定シードの推定勝率から理由を構成。履歴ごとの全ライブ相手の保存行動頻度の積、Heroの到達コンボ加重、実際の投入額、共通EQR・レーキを使用した独立AI推定で、GTOや最適性の保証ではありません。";
export const STAGE3_EQUITY_NOTE = "勝率は全ライブ相手の現在の到達レンジがショウダウンへ進むと置いた近似です。未応答者の最終コールレンジや未来の投入額は仮定せず、相手の応答・追加投資による変化は厳密に扱いません。途中フォールド者の保存レンジもカード重複と残りのボードに反映しますが、そのハンドは勝負に参加しません。コールEV=勝率×仮定EQR×レーキ後の実際のHeroコール後ポット−追加コール額。複数人EQRは共通係数、オールインEQRは1。フォールド済みのチップは残します。レイズEV・相手の将来フォールド率は未計算です。参加者以外のフォールドはこの限定履歴の前提で、カードは不明として扱います。";

export const STAGE3_FACT_KEYS = ["reach_pct", "equity_pct", "eqr", "realized_equity_pct", "call_ev_bb", "equity_margin_pct", "all_in_target_call_pct", "fold_pct", "call_pct", "squeeze_pct", "four_bet_pct", "all_in_pct", "raise_to_size_bb"];
const UNREACHABLE_FACTS = [0, null, null, null, null, null, null, 100, 0, 0, 0, 0, null];

// Integer entries reference a per-spot deduplicated unreachable explanation;
// numeric arrays contain exact saved facts in the versioned field order.
export function encodeStage3Reasons(saved: Stage3SavedReasons) {
  const unreachable: string[] = [];
  const rows = saved.hands.map(item => {
    if (item.unreachable_reason) {
      let index = unreachable.indexOf(item.unreachable_reason);
      if (index < 0) { index = unreachable.length; unreachable.push(item.unreachable_reason); }
      return index;
    }
    return STAGE3_FACT_KEYS.map(key => item[key]);
  });
  return { schema_version: "stage3-reasons-v1", spot_id: saved.spot_id, type: "stage3",
    source_fingerprint: saved.source_fingerprint, spot_facts: saved.spot, unreachable, rows };
}

export function expandStage3Reasons(data: Stage3CompactReasons | DetailedReasonDataset | null): DetailedReasonDataset | null {
  if (data?.type !== "stage3" || data.schema_version === undefined) return data as DetailedReasonDataset | null;
  if (data.schema_version !== "stage3-reasons-v1" || !Array.isArray(data.rows) || data.rows.length !== hands.length ||
      !Array.isArray(data.unreachable) || !data.unreachable.every(item => typeof item === "string") || !data.spot_facts) {
    throw new Error("Invalid compact stage3 reasons");
  }
  const result: Record<string, DetailedReason> = {};
  data.rows.forEach((values, index) => {
    const isUnreachable = Number.isInteger(values);
    if (isUnreachable ? (values as number) < 0 || (values as number) >= data.unreachable.length : !Array.isArray(values) || values.length !== STAGE3_FACT_KEYS.length || values.some(value => value !== null && !Number.isFinite(value))) {
      throw new Error("Invalid compact stage3 reason row");
    }
    const facts = Object.fromEntries(STAGE3_FACT_KEYS.map((key, i) => [key, (isUnreachable ? UNREACHABLE_FACTS : values as (number | null)[])[i]])) as unknown as Stage3ReasonFacts;
    const hand = hands[index];
    const row = { hand, ...Object.fromEntries(ACTIONS.map(action => [action, facts[`${action}_pct`]])), raise_to_size_bb: facts.raise_to_size_bb } as Stage3Hand;
    result[hand] = { reason: isUnreachable ? data.unreachable[values as number] : composeStage3Reason(row, facts, data.spot_facts as Stage3ReasonSpot), facts: facts as Record<string, number | null> };
  });
  return { spot_id: data.spot_id, type: "stage3", source_fingerprint: data.source_fingerprint,
    method: STAGE3_REASON_METHOD, equity_note: STAGE3_EQUITY_NOTE,
    fact_labels: STAGE3_FACT_LABELS, spot_facts: data.spot_facts, hands: result };
}

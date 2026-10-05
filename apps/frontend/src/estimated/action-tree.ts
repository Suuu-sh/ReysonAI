import type { MatrixModel } from "../data.ts";
export type ActionTreeIdentity = { action_history: unknown[]; acting_position: string; active_positions: string[]; responding_positions: string[]; effective_stack_bb: number };
export type ActionTreeSpot = ActionTreeIdentity & { id: string; effective_stack_remaining_bb: number; current_bet_to_bb: number; action_options: { action: string; key: string; label: string; raise_to_bb?: number; call_to_bb?: number }[]; transitions: { action: string; next_spot_id?: string; terminal?: { outcome: string } }[]; range_ref?: { family: string; spot_id: string }; range_profile_id?: string; range_file?: string; unreachable_hands: string[] };
type ActionTreeMetadata = { schema_version: string; strategy_type: string; effective_stack_bb: number; ante_bb: number; range_encoding: string; game?: string };
export type ActionTreeDataset = { metadata: ActionTreeMetadata; spot_count: number; spots: ActionTreeSpot[] };
export type ActionRangeProfile = { id: string; actions: string[]; action_frequencies: Record<string, string>; reason_codes: (keyof typeof reasonText)[] };
export type ActionRangeDataset = { metadata: ActionTreeMetadata; profiles: ActionRangeProfile[]; profile_count: number; hand_classes_per_profile: number };
import { hands } from "../data.ts";
import { positions } from "./sizing.ts";

export const RANGE_ENCODING = "base64-two-character-percent-v1";
export const reasonText = Object.freeze({
  value: "ハンド強度の高い部分として、コールまたはバリュー寄りのレイズを配分しています。",
  blocker: "高位カードのブロッカーを考慮し、限定的なレイズを含めています。",
  playability: "スーテッド性・接続性・プレイアビリティを考慮してコールを残しています。",
  marginal: "境界的な強さのハンドとして、継続とフォールドを混合しています。",
  fold: "この履歴とサイズでは継続が難しいため、フォールドを多く配分しています。",
  unreachable: "前段で選択されたアクションの推定頻度が0%だったため、このハンドは到達不能です。推奨として扱いません。",
});

const base64Digits = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const comboCount = (hand: string) => hand.length === 2 ? 6 : hand.endsWith("s") ? 4 : 12;

export function encodePercentVector(values: number[]) {
  if (!Array.isArray(values) || values.length !== hands.length) throw new Error("頻度ベクトルは169件必要です。");
  return values.map(value => {
    if (!Number.isInteger(value) || value < 0 || value > 100) throw new Error("頻度は0〜100の整数で指定してください。");
    return base64Digits[value >> 6] + base64Digits[value & 63];
  }).join("");
}

export function decodePercentVector(encoded: string) {
  if (typeof encoded !== "string" || encoded.length !== hands.length * 2) throw new Error("保存頻度ベクトルが不正です。");
  const values: number[] = new Array(hands.length);
  for (let index = 0; index < hands.length; index += 1) {
    const high = base64Digits.indexOf(encoded[index * 2]);
    const low = base64Digits.indexOf(encoded[index * 2 + 1]);
    const value = high * 64 + low;
    if (high < 0 || low < 0 || value > 100) throw new Error("保存頻度ベクトルの値が範囲外です。");
    values[index] = value;
  }
  return values;
}

export function spotIdentity({ action_history, acting_position, active_positions, responding_positions, effective_stack_bb }: ActionTreeIdentity) {
  return JSON.stringify([action_history, acting_position, active_positions, responding_positions, effective_stack_bb]);
}

export function fnv64(value: string) {
  let hash = 14695981039346656037n;
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 1099511628211n);
  }
  return hash.toString(16).padStart(16, "0");
}

export function actionTreeSpotId(spot: ActionTreeIdentity) {
  return `spot-${fnv64(spotIdentity(spot))}`;
}

export function validateActionTreeDataset(data: ActionTreeDataset) {
  const fail = (detail: string): never => { throw new Error(`保存済みアクションツリーが不正です: ${detail}`); };
  if (data?.metadata?.schema_version !== "2.0" ||
      data.metadata.strategy_type !== "ai_estimate_not_gto" ||
      data.metadata.effective_stack_bb !== 100 || data.metadata.ante_bb !== 0 ||
      data.metadata.game !== "6max Cash / No-Limit Texas Holdem" ||
      data.metadata.range_encoding !== RANGE_ENCODING ||
      data.spot_count !== data.spots?.length || !Array.isArray(data.spots) || !data.spots.length) {
    fail("メタデータまたは局面数");
  }
  const ids = new Set();
  const stateKeys = new Set();
  for (const spot of data.spots) {
    if (!spot || typeof spot.id !== "string" || ids.has(spot.id) ||
        spot.id !== actionTreeSpotId(spot) || !Array.isArray(spot.action_history) ||
        !positions.includes(spot.acting_position) || !Array.isArray(spot.active_positions) ||
        !spot.active_positions.includes(spot.acting_position) ||
        new Set(spot.active_positions).size !== spot.active_positions.length ||
        spot.active_positions.some(position => !positions.includes(position)) ||
        !Array.isArray(spot.responding_positions) || spot.responding_positions[0] !== spot.acting_position ||
        spot.responding_positions.some(position => !spot.active_positions.includes(position)) ||
        spot.effective_stack_bb !== 100 || !Number.isFinite(spot.effective_stack_remaining_bb) ||
        spot.effective_stack_remaining_bb < 0 || spot.effective_stack_remaining_bb > 100 ||
        !Number.isFinite(spot.current_bet_to_bb) || spot.current_bet_to_bb < 0 || spot.current_bet_to_bb > 100 ||
        !Array.isArray(spot.action_options) || !spot.action_options.length ||
        !Array.isArray(spot.transitions) || spot.transitions.length !== spot.action_options.length) {
      fail(`局面コンテキスト ${spot?.id ?? "unknown"}`);
    }
    ids.add(spot.id);
    const identity = spotIdentity(spot);
    if (stateKeys.has(identity)) fail(`spot identity重複 ${spot.id}`);
    stateKeys.add(identity);

    const actionKeys = new Set();
    for (const option of spot.action_options) {
      if (!option || !["fold", "call", "check", "raise", "all_in"].includes(option.action) ||
          typeof option.key !== "string" || actionKeys.has(option.key) ||
          ((option.action === "raise" || option.action === "all_in") &&
            (!Number.isFinite(option.raise_to_bb) || option.raise_to_bb! <= spot.current_bet_to_bb || option.raise_to_bb! > 100)) ||
          (option.action === "all_in" && option.raise_to_bb !== 100) ||
          (option.action === "call" && option.call_to_bb !== spot.current_bet_to_bb)) {
        fail(`選択肢 ${spot.id}`);
      }
      actionKeys.add(option.key);
    }
    const transitionKeys = new Set(spot.transitions.map(transition => transition.action));
    if (transitionKeys.size !== spot.action_options.length ||
        spot.action_options.some(option => !transitionKeys.has(option.key))) fail(`遷移 ${spot.id}`);
    if (spot.range_ref) {
      if (!new Set(["opening", "response", "three_bet", "four_bet"]).has(spot.range_ref.family) ||
          typeof spot.range_ref.spot_id !== "string" || spot.range_profile_id || spot.range_file) {
        fail(`既存レンジ参照 ${spot.id}`);
      }
    } else if (spot.range_profile_id) {
      if (typeof spot.range_file !== "string" || !spot.range_file.startsWith("action-tree-ranges-")) fail(`レンジ参照 ${spot.id}`);
    } else if (spot.action_options.some(option => option.action !== "check")) {
      fail(`レンジ参照欠落 ${spot.id}`);
    }
    if (!Array.isArray(spot.unreachable_hands) || new Set(spot.unreachable_hands).size !== spot.unreachable_hands.length ||
        spot.unreachable_hands.some(hand => !hands.includes(hand))) fail(`到達不能ハンド ${spot.id}`);
  }
  const byId = new Map(data.spots.map(spot => [spot.id, spot]));
  for (const spot of data.spots) {
    for (const transition of spot.transitions) {
      if (transition.next_spot_id && !byId.has(transition.next_spot_id)) fail(`遷移先不明 ${spot.id}`);
      if (!transition.next_spot_id && !transition.terminal?.outcome) fail(`終端情報欠落 ${spot.id}`);
    }
  }
  return data;
}

export function validateActionRangeDataset(data: ActionRangeDataset, expectedProfiles?: ReadonlySet<string>) {
  const fail = (detail: string): never => { throw new Error(`保存済みレンジが不正です: ${detail}`); };
  if (data?.metadata?.schema_version !== "1.0" ||
      data.metadata.strategy_type !== "ai_estimate_not_gto" ||
      data.metadata.effective_stack_bb !== 100 || data.metadata.ante_bb !== 0 ||
      data.metadata.range_encoding !== RANGE_ENCODING ||
      !Array.isArray(data.profiles) || data.profile_count !== data.profiles.length ||
      data.hand_classes_per_profile !== hands.length) fail("メタデータまたは局面数");
  const seen = new Set();
  for (const profile of data.profiles) {
    if (!profile || typeof profile.id !== "string" || seen.has(profile.id) ||
        !Array.isArray(profile.actions) || profile.actions.length < 2 ||
        !Array.isArray(profile.reason_codes) || profile.reason_codes.length !== hands.length ||
        profile.reason_codes.some(code => !Object.hasOwn(reasonText, code)) ||
        !profile.actions.includes("fold") || !profile.action_frequencies ||
        Object.keys(profile.action_frequencies).length !== profile.actions.length) fail(profile?.id ?? "unknown");
    seen.add(profile.id);
    const vectors = profile.actions.map(action => {
      const encoded = profile.action_frequencies[action];
      try { return decodePercentVector(encoded); } catch { fail(`${profile.id} / ${action}`); }
    }) as number[][];
    for (let handIndex = 0; handIndex < hands.length; handIndex += 1) {
      if (vectors.some(vector => !Number.isInteger(vector[handIndex]) || vector[handIndex] < 0 || vector[handIndex] > 100) ||
          vectors.reduce((sum, vector) => sum + vector[handIndex], 0) !== 100) fail(`${profile.id} / ${hands[handIndex]} frequency`);
    }
  }
  if (expectedProfiles && (seen.size !== expectedProfiles.size || [...expectedProfiles].some(id => !seen.has(id)))) {
    fail("spotごとのレンジ参照が一致しません。");
  }
  return data;
}

export function actionRangeModel(profile: ActionRangeProfile, spot: ActionTreeSpot): MatrixModel & { reasonFor(hand: string): string } {
  const vectors = new Map(profile.actions.map(action => [action, decodePercentVector(profile.action_frequencies[action])]));
  const unreachable = new Set(spot.unreachable_hands);
  return {
    actions: spot.action_options.map(option => option.key),
    actionLabels: Object.fromEntries(spot.action_options.map(option => [option.key, option.label])),
    aggregates: new Map(hands.map((hand, handIndex) => [hand, {
      hand,
      comboCount: comboCount(hand),
      unreachable: unreachable.has(hand),
      actions: unreachable.has(hand) ? {} : Object.fromEntries(profile.actions.map(action => [action, vectors.get(action)![handIndex] / 100])),
    }])),
    reasonFor: (hand: string) => {
      if (unreachable.has(hand)) return reasonText.unreachable;
      const index = hands.indexOf(hand);
      return index < 0 ? "" : reasonText[profile.reason_codes[index]];
    },
  };
}

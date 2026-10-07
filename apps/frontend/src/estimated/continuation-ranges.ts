// Read-only saved conditional ranges. Navigation stays frequency-free; missing
// rows disable continuation rather than substituting another heads-up range.
import { useEffect, useState } from 'react';
import { loadDataset } from './datasets.ts';
import { continuationById } from './continuation-tree.ts';
import { createContinuationModel } from './continuation-model.ts';
import { productLocale } from '../locale.ts';
import type { ActionBlock, RangeRef } from './range-url.ts';
import type { MatrixModel } from '../data.ts';
import type { SourceDataset, SourceSpot } from '../../scripts/postflop-ai/types.ts';
export const continuationSourceNames = ['opening-ranges','preflop-ranges','multiway-responses','multiway2-responses','squeeze-responses','cold-three-bet-responses','cold-four-bet-responses','continuation-responses'];
type Sources = Record<string, SourceDataset | undefined>;
const reachModels = new WeakMap<Sources, ReturnType<typeof createContinuationModel>>();
// Keep UI-only copy outside the source graph of reviewed saved strategies.
export function continuationUnreachableCopy() {
  const copy = {
    ja: { reason: 'この履歴では到達不能、推奨なし', description: '保存された前段の行動頻度とカードの組み合わせでは、このハンドはこの履歴に到達しません。保存上のfold=100は形式上の値です。' },
    en: { reason: 'Unreachable in this history; no recommendation', description: 'This hand cannot reach this history with the saved prior-action frequencies and card combinations. The saved 100% fold is only a placeholder.' },
    'zh-CN': { reason: '在此行动历史中无法到达；无建议', description: '根据已保存的先前行动频率和牌张组合，此手牌无法到达这段行动历史。保存的 100% 弃牌仅为占位值。' },
    es: { reason: 'No alcanzable en este historial; sin recomendación', description: 'Esta mano no puede alcanzar este historial con las frecuencias de acciones previas y las combinaciones de cartas guardadas. El 100% de fold guardado es solo un valor de relleno.' },
  };
  return copy[productLocale()];
}
export function continuationSavedRange(ref: RangeRef, sources: Record<string, SourceDataset | undefined>) {
  const node = ref.kind === 'bounded' ? continuationById.get(ref.id!) : null;
  const name = node?.dataset ?? ref.dataset;
  const spot = name ? sources[name]?.spots.find(item => item.id === ref.id) : null;
  if (!spot || !Array.isArray(spot.hands) || spot.hands.length !== 169) return null;
  const actions = node?.legal_actions ?? ['open','three_bet','four_bet','squeeze','all_in','limp','check','raise','call','fold'].filter(key => Object.hasOwn(spot.hands[0],key));
  if (spot.hands.some(row => actions.some(key => !Number.isFinite(row[key as keyof typeof row]) || Number(row[key as keyof typeof row]) < 0) || Math.abs(actions.reduce((sum,key) => sum+Number(row[key as keyof typeof row]),0)-100)>0.02)) return null;
  // Saved mixes are conditional. Hide placeholders using the complete observed
  // history, including folded participants and joint card support; never scale
  // a reachable hand's mix by its prior-action frequency.
  let reach: ((hand: string) => number) | undefined;
  if (node) {
    try {
      if (!reachModels.has(sources)) reachModels.set(sources, createContinuationModel(sources));
      reach = reachModels.get(sources)!.context(node).reach;
    } catch {
      // Missing or invalid ancestors are unavailable, not proof of zero reach.
      return null;
    }
  }
  const model: MatrixModel = { actions, actionLabels: Object.fromEntries(actions.map(key => [key,key === 'four_bet' ? '4bet' : key === 'all_in' ? 'All-in' : key])), aggregates: new Map(spot.hands.map(row => [row.hand,{hand:row.hand,comboCount:row.hand.length===2 ? 6 : row.hand.endsWith('s') ? 4 : 12,actions:Object.fromEntries(actions.map(key=>[key,Number(row[key as keyof typeof row])/100]))}])) };
  for (const [hand, aggregate] of model.aggregates) {
    if (reach && reach(hand) === 0) model.aggregates.set(hand, { ...aggregate, unreachable: true, actions: {} });
  }
  return { spot, model, unreachableReason: node ? continuationUnreachableCopy().reason : null };
}
export function withContinuationAvailability(blocks: ActionBlock[], sources: Record<string, SourceDataset | undefined> | null): ActionBlock[] {
  let available = Boolean(sources);
  return blocks.map(block => {
    if (block.rangeRef && ['bounded','saved-source'].includes(block.rangeRef.kind)) {
      const saved = sources && continuationSavedRange(block.rangeRef,sources);
      available &&= Boolean(saved);
      return { ...block, options:block.options.map(option=>({...option,disabled:option.disabled || !saved})) };
    }
    return block.kind === 'end' && block.continuationTerminal ? { ...block, continuationAvailable:available } : block;
  });
}
export function useContinuationRanges(enabled: boolean) {
  const [sources,setSources] = useState<Record<string,SourceDataset | undefined> | null>(null);
  useEffect(()=>{
    if (!enabled) return;
    let active=true;
    Promise.all(continuationSourceNames.map(async name=>[name,await loadDataset<SourceDataset>(name).catch(()=>undefined)] as const)).then(entries=>{if(active)setSources(Object.fromEntries(entries));});
    return ()=>{active=false;};
  },[enabled]);
  return sources;
}

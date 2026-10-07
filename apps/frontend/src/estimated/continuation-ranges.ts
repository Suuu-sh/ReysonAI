// Read-only saved conditional ranges. Navigation stays frequency-free; missing
// rows disable continuation rather than substituting another heads-up range.
import { useEffect, useState } from 'react';
import { loadDataset } from './datasets.ts';
import { continuationById } from './continuation-tree.ts';
import type { ActionBlock, RangeRef } from './range-url.ts';
import type { MatrixModel } from '../data.ts';
import type { SourceDataset, SourceSpot } from '../../scripts/postflop-ai/types.ts';
export const continuationSourceNames = ['opening-ranges','preflop-ranges','multiway-responses','multiway2-responses','squeeze-responses','cold-three-bet-responses','cold-four-bet-responses','continuation-responses'];
export function continuationSavedRange(ref: RangeRef, sources: Record<string, SourceDataset | undefined>) {
  const node = ref.kind === 'bounded' ? continuationById.get(ref.id!) : null;
  const name = node?.dataset ?? ref.dataset;
  const spot = name ? sources[name]?.spots.find(item => item.id === ref.id) : null;
  if (!spot || !Array.isArray(spot.hands) || spot.hands.length !== 169) return null;
  const actions = node?.legal_actions ?? ['open','three_bet','four_bet','squeeze','all_in','limp','check','raise','call','fold'].filter(key => Object.hasOwn(spot.hands[0],key));
  if (spot.hands.some(row => actions.some(key => !Number.isFinite(row[key as keyof typeof row]) || Number(row[key as keyof typeof row]) < 0) || Math.abs(actions.reduce((sum,key) => sum+Number(row[key as keyof typeof row]),0)-100)>0.02)) return null;
  const model: MatrixModel = { actions, actionLabels: Object.fromEntries(actions.map(key => [key,key === 'four_bet' ? '4bet' : key === 'all_in' ? 'All-in' : key])), aggregates: new Map(spot.hands.map(row => [row.hand,{hand:row.hand,comboCount:row.hand.length===2 ? 6 : row.hand.endsWith('s') ? 4 : 12,actions:Object.fromEntries(actions.map(key=>[key,Number(row[key as keyof typeof row])/100]))}])) };
  return { spot, model };
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

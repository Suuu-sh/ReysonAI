// Author registry for the fifteen new three-player SRPs. Pending independent review.
// Load only the exact selected profile: another spot is not a strategy dependency.
// No accepted pilot import and no missing-spot or source-hash fallback.
import { readFileSync } from 'node:fs';
import { emitMw3NewPolicies } from './emit.mjs';
const files = new Map([
  ['HJ_open_BTN_call_BB_call', './profiles/hj-open-btn-call-bb-call.json'],
  ['HJ_open_CO_call_BB_call', './profiles/hj-open-co-call-bb-call.json'],
  ['UTG_open_BTN_call_BB_call', './profiles/utg-open-btn-call-bb-call.json'],
  ['UTG_open_CO_call_BB_call', './profiles/utg-open-co-call-bb-call.json'],
  ['UTG_open_HJ_call_BB_call', './profiles/utg-open-hj-call-bb-call.json'],
  ['CO_open_BTN_call_SB_call', './profiles/co-open-btn-call-sb-call.json'],
  ['HJ_open_BTN_call_SB_call', './profiles/hj-open-btn-call-sb-call.json'],
  ['HJ_open_CO_call_BTN_call', './profiles/hj-open-co-call-btn-call.json'],
  ['HJ_open_CO_call_SB_call', './profiles/hj-open-co-call-sb-call.json'],
  ['UTG_open_BTN_call_SB_call', './profiles/utg-open-btn-call-sb-call.json'],
  ['UTG_open_CO_call_BTN_call', './profiles/utg-open-co-call-btn-call.json'],
  ['UTG_open_HJ_call_BTN_call', './profiles/utg-open-hj-call-btn-call.json'],
  ['UTG_open_HJ_call_CO_call', './profiles/utg-open-hj-call-co-call.json'],
  ['UTG_open_CO_call_SB_call', './profiles/utg-open-co-call-sb-call.json'],
  ['UTG_open_HJ_call_SB_call', './profiles/utg-open-hj-call-sb-call.json'],
]);
const prefix = 'scripts/data/mw3-authored/';
export function getMw3Author(spotId) {
  const file = files.get(spotId); if (!file) throw new Error(`Mw3 spot has no new author: ${spotId}`);
  const profile = JSON.parse(readFileSync(new URL(file,import.meta.url),'utf8'));
  if (profile.id !== spotId || profile.id === 'CO_open_BTN_call_BB_call' || profile.version !== 1 || profile.model !== 'gpt-6-astra' || !/^[a-f0-9]{64}$/.test(profile.sourceFingerprint ?? '')) throw new Error('Invalid new Mw3 author identity');
  return Object.freeze({spotId:profile.id,version:profile.version,model:profile.model,sourceFingerprint:profile.sourceFingerprint,
    status:profile.status,priority:profile.priority,sourceFiles:Object.freeze([`${prefix}${file.slice(2)}`,
      `${prefix}context-judgments.mjs`,`${prefix}emit.mjs`,`${prefix}registry.mjs`]),
    build:(inputs,contract)=>emitMw3NewPolicies(profile,inputs,contract)});
}
export function listMw3Authors() {
  return [...files.keys()].map(id=>{const {build,...metadata}=getMw3Author(id);return {...metadata,sourceFiles:[...metadata.sourceFiles]};});
}

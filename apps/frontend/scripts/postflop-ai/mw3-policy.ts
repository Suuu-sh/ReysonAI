// Dedicated saved three-player-origin policies. No HU defence, reference mixes, EV
// optimizer, frequency rescaling or missing/stale-artifact fallback is permitted.
import { flopTextureKeys, LINES, RUNOUT_TEXTURES, runoutTexture, TEXTURES } from './model.ts';
import { MW3_TIERS as TIERS, mw3HandTier } from './mw3-hand-features.ts';
import { describeMw3Node } from './mw3-tree.ts';
export const MW3_POLICY_SCHEMA = 3;
export const MW3_MAX_RULES = 60000;
export const MW3_SELECTOR_KEYS = Object.freeze(['line', 'texture', 'players', 'position', 'response', 'price', 'spr']);
export const MW3_SELECTORS: any = Object.freeze({ line: ['any', ...LINES], texture: ['any', ...TEXTURES, ...RUNOUT_TEXTURES],
  players: ['any', 2, 3], position: ['any', 'first', 'middle', 'last'], response: ['any', 'none', 'cold', 'invested'],
  price: ['any', 'none', 'cheap', 'standard', 'expensive'], spr: ['any', 'shallow', 'medium', 'deep'] });
export const mw3AnySelector = () : any => Object.fromEntries(MW3_SELECTOR_KEYS.map((key: any) : any => [key, 'any']));
const keys = (value: any) : any => value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value).sort().join(',') : '';
const envelopeKeys = ['version', 'kind', 'spot_id', 'streets', 'rules'].sort().join(',');
const ruleKeys = ['node', 'tier', 'when', 'priority', 'mix'].sort().join(',');
const selectorKeys = [...MW3_SELECTOR_KEYS].sort().join(',');
const sameActions = (mix?: any, actions?: any) : any => keys(mix) === [...actions].sort().join(',') &&
  actions.every((action: any) : any => Number.isFinite(mix[action]) && mix[action] >= 0 && mix[action] <= 100) &&
  Math.abs(actions.reduce((sum?: any, action?: any) : any => sum + mix[action], 0) - 100) < 1e-9;

function textureDomains(texture?: any, street?: any) : any {
  if (street === 'flop') {
    const all = ['dry', 'wet', 'monotone', 'paired'].flatMap((shape: any) : any => ['high', 'mid', 'low'].map((height: any) : any => `${shape}_${height}`));
    return all.filter((value: any) : any => texture === 'any' || value === texture || value.split('_').includes(texture));
  }
  return RUNOUT_TEXTURES.filter((value: any) : any => texture === 'any' || value === texture);
}
function overlaps(a?: any, b?: any, street?: any) : any {
  return MW3_SELECTOR_KEYS.every((key: any) : any => key === 'texture'
    ? textureDomains(a[key], street).some((value: any) : any => textureDomains(b[key], street).includes(value))
    : a[key] === 'any' || b[key] === 'any' || a[key] === b[key]);
}

export function validateMw3Policy(policy?: any, { spotId, nodes }: any = {}) : any {
  if (keys(policy) !== envelopeKeys || policy.version !== MW3_POLICY_SCHEMA || policy.kind !== 'ai_estimate_not_gto' ||
      typeof policy.spot_id !== 'string' || spotId && policy.spot_id !== spotId ||
      !['flop', 'turn,river'].includes(policy.streets?.join()) || !Array.isArray(policy.rules) || !policy.rules.length || policy.rules.length > MW3_MAX_RULES) {
    throw new Error('Invalid mw3 policy envelope');
  }
  const expected = new Set(nodes ? Object.keys(nodes).filter((node: any) : any => policy.streets.includes(describeMw3Node(node).street)) : ([] as any[]));
  const groups = new Map(), defaults = new Set(), seen = new Set();
  for (const rule of policy.rules) {
    if (keys(rule) !== ruleKeys || !TIERS.includes(rule.tier) || !Number.isInteger(rule.priority) || rule.priority < 0 || rule.priority > 1000 ||
        keys(rule.when) !== selectorKeys || MW3_SELECTOR_KEYS.some((key: any) : any => !MW3_SELECTORS[key].includes(rule.when[key]))) throw new Error('Invalid mw3 policy rule');
    const descriptor = describeMw3Node(rule.node), facing = descriptor.facing !== null;
    if (!policy.streets.includes(descriptor.street) || nodes && !expected.has(rule.node) ||
        !textureDomains(rule.when.texture, descriptor.street).length ||
        (!facing && !['any', 'none'].includes(rule.when.response)) || (facing && rule.when.response === 'none') ||
        (!facing && !['any', 'none'].includes(rule.when.price)) || (facing && rule.when.price === 'none') ||
        (rule.when.players === 2 && rule.when.position === 'middle')) throw new Error(`Unreachable mw3 rule selector: ${rule.node}`);
    if (!sameActions(rule.mix, descriptor.actions)) throw new Error(`Invalid mw3 action mix: ${rule.node}/${rule.tier}`);
    const identity = `${rule.node}|${rule.tier}|${MW3_SELECTOR_KEYS.map((key: any) : any => rule.when[key]).join('|')}`;
    if (seen.has(identity)) throw new Error(`Duplicate mw3 policy rule: ${identity}`);
    seen.add(identity);
    const fallback = MW3_SELECTOR_KEYS.every((key: any) : any => rule.when[key] === 'any');
    if (fallback !== (rule.priority === 0)) throw new Error('mw3 fallback must be exactly priority 0');
    if (fallback) defaults.add(`${rule.node}|${rule.tier}`);
    const groupKey = `${rule.node}|${rule.tier}|${rule.priority}`, group = groups.get(groupKey) ?? ([] as any[]);
    if (group.some((other: any) : any => overlaps(other.when, rule.when, descriptor.street))) throw new Error(`Ambiguous mw3 overrides: ${groupKey}`);
    group.push(rule); groups.set(groupKey, group);
  }
  const required = nodes ? [...expected] : [...new Set(policy.rules.map((rule: any) : any => rule.node))];
  for (const node of required) for (const tier of TIERS) if (!defaults.has(`${node}|${tier}`)) throw new Error(`Missing mw3 fallback: ${node}/${tier}`);
  return policy;
}

const indexed = new WeakMap();
const selectedRules = new WeakMap(); // Validated saved policies are immutable by contract.
function rulesFor(policy?: any, node?: any, tier?: any) : any {
  let byKey = indexed.get(policy);
  if (!byKey) {
    byKey = new Map();
    for (const rule of policy.rules) {
      const key = `${rule.node}|${rule.tier}`, rules = byKey.get(key) ?? ([] as any[]);
      rules.push(rule); byKey.set(key, rules);
    }
    for (const rules of byKey.values()) rules.sort((a?: any, b?: any) : any => b.priority - a.priority);
    indexed.set(policy, byKey);
  }
  return byKey.get(`${node}|${tier}`) ?? ([] as any[]);
}
export function selectMw3Rule(policy?: any, decision?: any, tier?: any, board?: any) : any {
  if (!policy || policy.version !== MW3_POLICY_SCHEMA || !TIERS.includes(tier)) throw new Error('Missing or invalid saved mw3 policy');
  if (!Array.isArray(board) || board.length !== (({ flop: 3, turn: 4, river: 5 } as any)[decision.street]) ||
      new Set(board).size !== board.length || board.some((card: any) : any => !Number.isInteger(card) || card < 0 || card > 51)) throw new Error('Invalid mw3 policy board');
  const textures = decision.street === 'flop' ? flopTextureKeys(board) : [runoutTexture(board), 'any'];
  const context: any = { line: decision.line, players: decision.players, position: decision.activePosition,
    response: decision.responseType, price: decision.priceBand, spr: decision.sprBand };
  let cache = selectedRules.get(policy);
  if (!cache) { cache = new Map(); selectedRules.set(policy, cache); }
  const cacheKey = [decision.node, tier, ...Object.values<any>(context), textures.join(',')].join('|');
  let rule = cache.get(cacheKey);
  if (!rule) {
    const matches = rulesFor(policy, decision.node, tier).filter((item: any) : any => MW3_SELECTOR_KEYS.every((key: any) : any =>
      key === 'texture' ? textures.includes(item.when.texture) : item.when[key] === 'any' || item.when[key] === context[key]));
    if (!matches.length) throw new Error(`Uncovered mw3 policy context: ${decision.node}/${tier}`);
    if (matches[1]?.priority === matches[0].priority) throw new Error('Ambiguous selected mw3 rule');
    rule = matches[0];
    if (cache.size >= 60000) cache.delete(cache.keys().next().value);
    cache.set(cacheKey, rule);
  }
  if (!sameActions(rule.mix, decision.actions)) throw new Error('Saved mw3 policy disagrees with legal actions');
  return rule;
}
export function mw3PolicyMix(policy?: any, decision?: any, hole?: any, board?: any) : any {
  const tier = mw3HandTier(hole, board);
  return { ...selectMw3Rule(policy, decision, tier, board).mix };
}

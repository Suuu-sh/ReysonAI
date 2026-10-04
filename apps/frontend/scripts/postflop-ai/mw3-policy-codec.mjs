// Lossless transport/storage dictionary. Exact authored percentages and JSON key order
// round-trip; this is compression, never generation or a fallback policy.
import { validateMw3Policy, MW3_MAX_RULES } from './mw3-policy.mjs';
export const MW3_POLICY_ENCODING = 'mw3-policy-dictionary-v1';
const ROOT_KEYS = ['version', 'kind', 'spot_id', 'streets', 'rules'];
const RULE_KEYS = ['node', 'tier', 'when', 'priority', 'mix'];
const sameKeys = (keys, expected) => Array.isArray(keys) && keys.every(key => typeof key === 'string') && keys.length === expected.length &&
  [...keys].sort().join() === [...expected].sort().join();
const ordered = (order, values) => Object.fromEntries(order.map(key => [key, values[key]]));
function dictionary() {
  const values = [], ids = new Map();
  return { values, add(value) { const key = JSON.stringify(value); if (!ids.has(key)) { ids.set(key, values.length); values.push(value); } return ids.get(key); } };
}
export function encodeMw3Policy(policy) {
  validateMw3Policy(policy);
  const nodes = dictionary(), tiers = dictionary(), selectors = dictionary(), mixes = dictionary(), orders = dictionary();
  const rows = policy.rules.map(rule => [nodes.add(rule.node), tiers.add(rule.tier), selectors.add(rule.when),
    rule.priority, mixes.add(rule.mix), orders.add(Object.keys(rule))]);
  return { encoding: MW3_POLICY_ENCODING, rootOrder: Object.keys(policy),
    header: Object.fromEntries(Object.entries(policy).filter(([key]) => key !== 'rules')),
    nodes: nodes.values, tiers: tiers.values, selectors: selectors.values, mixes: mixes.values, ruleOrders: orders.values, rows };
}
export function decodeMw3Policy(encoded) {
  if (!encoded || encoded.encoding !== MW3_POLICY_ENCODING ||
      !sameKeys(encoded.rootOrder, ROOT_KEYS) || !encoded.header || typeof encoded.header !== 'object' ||
      Object.keys(encoded.header).sort().join() !== ROOT_KEYS.filter(key => key !== 'rules').sort().join() ||
      !Array.isArray(encoded.rows) || !encoded.rows.length || encoded.rows.length > MW3_MAX_RULES ||
      ['nodes', 'tiers', 'selectors', 'mixes', 'ruleOrders'].some(key => !Array.isArray(encoded[key]) || encoded[key].length > MW3_MAX_RULES) ||
      encoded.ruleOrders.some(order => !sameKeys(order, RULE_KEYS))) throw new Error('Invalid compact mw3 policy envelope');
  const lookup = (list, index) => {
    if (!Number.isInteger(index) || index < 0 || index >= list.length) throw new Error('Invalid compact mw3 dictionary index');
    return list[index];
  };
  const rules = encoded.rows.map(row => {
    if (!Array.isArray(row) || row.length !== 6) throw new Error('Invalid compact mw3 rule row');
    const [node, tier, selector, priority, mix, order] = row;
    return ordered(lookup(encoded.ruleOrders, order), { node: lookup(encoded.nodes, node), tier: lookup(encoded.tiers, tier),
      when: { ...lookup(encoded.selectors, selector) }, priority, mix: { ...lookup(encoded.mixes, mix) } });
  });
  return validateMw3Policy(ordered(encoded.rootOrder, { ...encoded.header, rules }));
}

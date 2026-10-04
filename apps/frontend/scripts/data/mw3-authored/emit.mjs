// New-spot-only offline policy emitter. The accepted CO/BTN/BB recipe is neither
// imported nor edited. Source anchors + disclosed context judgments become saved
// direct mixes, including defence. No runtime fallback, equity, EV or MDF repair.
import { replayMw3, mw3Decision } from '../../postflop-ai/mw3-engine.mjs';
import { MW3_TIERS } from '../../postflop-ai/mw3-hand-features.mjs';
import { describeMw3Node, mw3PolicyContextKey } from '../../postflop-ai/mw3-tree.mjs';
import { MW3_POLICY_SCHEMA, mw3AnySelector, validateMw3Policy } from '../../postflop-ai/mw3-policy.mjs';
import { BASE_TIERS, FLOP_TEXTURES, LATER_TEXTURES, LINES, FACES, PRICE_ORDER, SHAPES,
  bounded, valueAt, allocate, FIRST_RUNOUT, FIRST_TWO_PLAYER, FIRST_SPR, SHOVE_SHARE,
  FLOP_SIZES, LATER_SIZES, PRICE_CONTINUE, FLOP_RESPONSE, LATER_RESPONSE,
  RESPONSE_TWO_PLAYER, INVESTED, LATER_RAISE_CHANGE, NUT_CONTINUE, NUT_RAISE,
  ABSOLUTE_RAISE, SPECIAL_SIZES, ABSOLUTE_SIZES, SPECIAL_TWO_PLAYER, SHARED_CALL } from './context-judgments.mjs';

const PILOT = 'CO_open_BTN_call_BB_call';
const emptyMix = node => Object.fromEntries(describeMw3Node(node).actions.map(action => [action, 0]));
const own = (profile, d) => profile.authorAnchors[describeMw3Node(d.node).role];
function baseFirst(profile, d, tier, texture) {
  const n = describeMw3Node(d.node), anchors = own(profile, d), role = n.role, index = BASE_TIERS.indexOf(tier);
  let total, sizes;
  if (d.street === 'flop') {
    total = valueAt(anchors.flop[FLOP_TEXTURES.indexOf(texture)], tier);
    sizes = [...FLOP_SIZES[texture.split('_')[0]][index]];
    if (role === 'first' && profile.topology !== 'no_blind') { sizes[1] += sizes[2]; sizes[2] = 0; }
    // A caller probing after an opener check keeps more small bets than a c-bet.
    if (profile.semantics[role] !== 'opener' && role === 'middle') {
      const moved = Math.min(8, sizes[1]); sizes[0] += moved; sizes[1] -= moved;
    }
  } else {
    total = valueAt(anchors[d.street][LINES.indexOf(d.line)], tier);
    if (d.players === 2) total += valueAt(FIRST_TWO_PLAYER[d.street][d.activePosition][d.line], tier);
    total += valueAt(FIRST_RUNOUT[d.street][texture], tier) + valueAt(FIRST_SPR[d.sprBand], tier);
    if (texture === 'over' && d.line === 'aggressor') total += valueAt([0,0,2,0,1], tier);
    sizes = [...LATER_SIZES[d.street][index]];
    if (['pair','straight','flush'].includes(texture)) sizes = tier === 'monster' ? [65,35,0]
      : tier === 'strong' ? [88,12,0] : tier === 'draw' ? [81,19,0] : [94,6,0];
    if (d.line === 'defender' && d.activePosition !== 'last') {
      total = Math.min(total, valueAt(d.street === 'turn' ? [23,12,11,3,2] : [19,8,0,2,2], tier));
      sizes[0] += sizes[2]; sizes[2] = 0;
    }
  }
  total = bounded(total);
  if (d.street === 'river' && tier === 'draw') total = 0;
  const mix = emptyMix(d.node); mix.check = 100 - total;
  if (n.actions.includes('allin')) {
    if (d.sprBand === 'shallow') mix.allin = total;
    else { const shove = valueAt(SHOVE_SHARE[d.players], tier); [mix.bet33,mix.allin] = allocate(total,[100-shove,shove]); }
  } else [mix.bet33,mix.bet75,mix.bet125] = allocate(total,sizes);
  return mix;
}

function baseResponse(profile, d, tier, texture) {
  const n = describeMw3Node(d.node), anchors = own(profile,d), face = FACES.indexOf(n.facing);
  let continued = valueAt(anchors.defend[face],tier);
  let raised = face < 4 ? valueAt(anchors.raise_base[face],tier) : 0;
  if (d.street !== 'flop') {
    continued += valueAt(anchors.later_defence[d.street === 'turn' ? 0 : 1],tier);
    raised += valueAt(LATER_RAISE_CHANGE[d.street],tier);
  }
  const boardDelta = d.street === 'flop' ? FLOP_RESPONSE[texture.split('_')[0]] : LATER_RESPONSE[d.street][texture];
  continued += valueAt(boardDelta[0],tier) + valueAt(PRICE_CONTINUE[d.street][d.priceBand],tier);
  raised += valueAt(boardDelta[1],tier);
  if (d.priceBand === 'expensive') raised += valueAt([-4,-1,-2,0,0],tier);
  if (d.players === 2) {
    continued += valueAt(RESPONSE_TWO_PLAYER[d.street],tier);
    raised += valueAt(d.street === 'river' ? [4,1,0,0,1] : [4,1,2,0,1],tier);
  } else if (n.pendingBehind) continued += valueAt([0,0,-3,-3,0],tier);
  else { continued += valueAt([0,-3,5,2,0],tier); raised += valueAt([-7,-1,-1,0,0],tier); }
  if (d.activePosition === 'last') continued += valueAt([0,2,3,3,0],tier);
  else if (d.street !== 'river') continued += valueAt([0,0,-3,-2,0],tier);
  if (d.responseType === 'invested') {
    continued += valueAt(INVESTED[d.street],tier); raised += valueAt([2,0,1,0,0],tier);
  }
  if (d.sprBand === 'shallow' && n.facing !== 'allin') continued += valueAt([2,3,-2,0,0],tier);
  if (d.sprBand === 'deep' && d.street !== 'river' && d.activePosition !== 'last') continued += valueAt([0,-1,-2,-1,0],tier);
  if (d.street === 'flop') {
    const height = texture.split('_')[1], semantic = profile.semantics[n.role];
    if (semantic === 'opener' && height === 'high') continued += valueAt([0,3,0,0,0],tier);
    if (n.role === 'first' && profile.topology === 'bb' && height === 'high') continued += valueAt([0,-2,0,-1,0],tier);
    if (n.role === 'first' && profile.topology === 'bb' && height === 'low') continued += valueAt([0,1,2,1,0],tier);
    if (n.role === 'first' && profile.topology === 'sb' && height === 'low') continued += valueAt([0,3,0,1,0],tier);
    if (semantic !== 'opener' && profile.topology === 'no_blind' && height === 'low') continued += valueAt([0,2,0,1,0],tier);
  } else {
    if (d.line === 'aggressor') continued += valueAt([1,2,1,0,0],tier);
    if (d.line === 'defender') { continued += valueAt([0,-2,-1,-1,0],tier); raised += valueAt([-2,0,-1,0,0],tier); }
  }
  if (tier === 'air') {
    raised = Math.max(0,Math.min(raised,d.players === 3 ? 1 : 2));
    if (d.street === 'river') continued = raised;
    if (['125','raise1','raise2','allin'].includes(n.facing)) { continued = 0; raised = 0; }
  }
  if (d.street === 'river' && tier === 'draw') { continued = 0; raised = 0; }
  continued = bounded(continued); raised = n.actions.includes('raise') ? Math.min(continued,bounded(raised)) : 0;
  const mix = emptyMix(d.node); mix.fold = 100 - continued; mix.call = continued - raised;
  if (n.actions.includes('raise')) mix.raise = raised;
  return mix;
}

function rankSafeMix(profile,d,tier,texture) {
  const n = describeMw3Node(d.node), values = profile.specialValues[n.role], absolute = tier === 'absolute_nuts';
  const mix = emptyMix(d.node), feature = d.street === 'flop' ? texture.split('_')[0] : texture;
  if (!d.facing) {
    let total = d.street === 'flop' ? absolute ? values.absoluteFlop : values.nutsFlop[SHAPES.indexOf(feature)]
      : values[`${absolute ? 'absolute' : 'nuts'}${d.street === 'turn' ? 'Turn' : 'River'}`][LINES.indexOf(d.line)];
    if (d.street !== 'flop') {
      if (d.players === 2) total += SPECIAL_TWO_PLAYER[d.activePosition][d.line];
      if (d.sprBand === 'shallow') total += absolute ? 4 : 3;
      if (!absolute && feature === 'pair') total -= 2;
    }
    total = bounded(total); mix.check = 100 - total;
    if (n.actions.includes('allin')) {
      if (d.sprBand === 'shallow') mix.allin = total;
      else [mix.bet33,mix.allin] = allocate(total,absolute ? d.players === 3 ? [35,65] : [25,75] : d.players === 3 ? [31,69] : [23,77]);
    } else {
      const sizes = [...(absolute ? d.street === 'flop' ? ABSOLUTE_SIZES.flop[n.role] : ABSOLUTE_SIZES[d.street][feature] : SPECIAL_SIZES[d.street][feature])];
      if (!absolute && (d.street === 'flop' && n.role === 'first' && profile.topology !== 'no_blind' || d.street !== 'flop' && d.line === 'defender' && d.activePosition !== 'last')) {
        sizes[1] += sizes[2]; sizes[2] = 0;
      }
      [mix.bet33,mix.bet75,mix.bet125] = allocate(total,sizes);
    }
    return mix;
  }
  const face = FACES.indexOf(n.facing);
  let continued = absolute ? 100 : NUT_CONTINUE[d.street][n.facing][PRICE_ORDER.indexOf(d.priceBand)];
  let raised = (absolute ? ABSOLUTE_RAISE : NUT_RAISE)[d.street][face] + values[absolute ? 'absoluteRaiseBias' : 'nutsRaiseBias'];
  if (!absolute && d.street !== 'river' && d.priceBand === 'expensive' && d.players === 3 && n.pendingBehind && ['raise1','raise2','allin'].includes(n.facing) && ['wet','straight'].includes(feature)) continued -= 2;
  if (d.players === 3) raised -= absolute ? d.street === 'flop' ? n.pendingBehind ? 16 : 10 : d.street === 'turn' ? n.pendingBehind ? 10 : 6 : n.pendingBehind ? 5 : 2 : n.pendingBehind ? 12 : 5;
  else if (!absolute || d.street !== 'river') raised += absolute ? 3 : 4;
  if (d.responseType === 'invested' && (!absolute || d.street !== 'river')) raised += 5;
  if (d.sprBand === 'shallow' && (!absolute || d.street !== 'river')) raised += absolute ? 10 : 8;
  if (!absolute && ['paired','pair'].includes(feature)) raised -= 8;
  if (!absolute && feature === 'monotone') raised -= 5;
  if (absolute && d.street !== 'river') {
    if (d.priceBand === 'cheap') raised -= d.street === 'flop' ? 5 : 3;
    if (d.priceBand === 'expensive') raised += 4;
    if (d.sprBand === 'deep') raised -= 5;
  }
  raised = n.actions.includes('raise') ? Math.min(continued,bounded(raised)) : 0;
  mix.fold = 100 - continued; mix.call = continued - raised;
  if (n.actions.includes('raise')) mix.raise = raised;
  return mix;
}
function sharedMix(profile,d,tier,texture) {
  const n = describeMw3Node(d.node), mix = emptyMix(d.node);
  if (tier === 'board_locked') { mix[d.facing ? 'call' : 'check'] = 100; return mix; }
  if (!d.facing) { mix.check = 100; return mix; }
  if (d.street !== 'river') { mix.fold = 100; return mix; } // card-unreachable structural rows
  let call = SHARED_CALL[d.players][n.facing][PRICE_ORDER.indexOf(d.priceBand)] + profile.sharedCallCaution[n.role];
  if (d.players === 3 && !n.pendingBehind) call -= 4;
  if (d.responseType === 'invested') call += 3;
  if (d.line === 'defender') call -= 2;
  if (d.line === 'aggressor') call += 2;
  if (texture === 'flush') call -= 3;
  if (texture === 'straight') call -= 2;
  mix.call = bounded(call); mix.fold = 100 - mix.call;
  return mix;
}
export function authoredMw3NewMix(profile,d,tier,texture) {
  if (!MW3_TIERS.includes(tier)) throw new Error('Unknown new Mw3 tier');
  if (['board_locked','board_shared'].includes(tier)) return sharedMix(profile,d,tier,texture);
  if (['absolute_nuts','nuts'].includes(tier)) return rankSafeMix(profile,d,tier,texture);
  return d.facing ? baseResponse(profile,d,tier,texture) : baseFirst(profile,d,tier,texture);
}
function fallback(node) {
  const n = describeMw3Node(node), facing = n.facing !== null;
  return {node,street:n.street,role:n.role,facing,players:3,activePosition:n.role,
    line:n.street === 'flop' ? 'checked' : 'defender',responseType:facing ? 'cold' : 'none',
    priceBand:facing ? ['125','allin','raise2'].includes(n.facing) ? 'expensive' : 'standard' : 'none',
    sprBand:n.situation.endsWith('low_spr') || n.facing === 'allin' ? 'shallow' : 'deep'};
}
export function emitMw3NewPolicies(profile,inputs,contract) {
  if (profile.id === PILOT) throw new Error('Accepted pilot is immutable and not authored by the new registry');
  if (!/^[a-f0-9]{64}$/.test(profile.sourceFingerprint ?? '') || inputs?.spot?.id !== profile.id || inputs.fingerprint !== profile.sourceFingerprint ||
      inputs.spot.seats.join() !== profile.seats.join() || inputs.spot.potBb !== profile.potBb || inputs.spot.stackBb !== profile.stackBb ||
      profile.seats.some(seat => inputs.spot.roles[seat] !== profile.roleMap[seat])) throw new Error('New Mw3 author/source pin mismatch');
  if (!contract?.nodes || Object.keys(contract.nodes).length !== 117 || !contract.contexts || !Object.keys(contract.contexts).length) throw new Error('Complete 117-node geometry contract required');
  const coveredNodes = new Set(Object.values(contract.contexts).map(d=>d.node));
  if (Object.keys(contract.nodes).some(node=>!coveredNodes.has(node))) throw new Error('Geometry contract omits a node context');
  const make = streets => ({version:MW3_POLICY_SCHEMA,kind:'ai_estimate_not_gto',spot_id:profile.id,streets,rules:[]});
  const policies = {flop:make(['flop']),later:make(['turn','river'])};
  for (const node of Object.keys(contract.nodes).sort()) {
    const d = fallback(node), policy = d.street === 'flop' ? policies.flop : policies.later;
    for (const tier of MW3_TIERS) policy.rules.push({node,tier,when:mw3AnySelector(),priority:0,
      mix:authoredMw3NewMix(profile,d,tier,d.street === 'flop' ? 'monotone_high' : 'flush')});
  }
  for (const [key,d] of Object.entries(contract.contexts).sort(([a],[b]) => a.localeCompare(b))) {
    if (key !== mw3PolicyContextKey(d) || !contract.nodes[d.node]) throw new Error('Malformed new Mw3 policy context');
    // A pot-8 probe cannot silently stand in for pot-8.5/9. Verify its own witness.
    const streets = ['flop','turn','river'].slice(0,['flop','turn','river'].indexOf(d.street)+1);
    const paths = Object.fromEntries(streets.map(street=>[street,d.witness?.[street]]));
    const actual = mw3Decision(replayMw3(inputs.spot,paths));
    if (actual.end || actual.seat !== d.seat || mw3PolicyContextKey(actual) !== key || actual.actions.join() !== d.actions.join() ||
        actual.potBb !== d.potBb || actual.callBb !== d.callBb) throw new Error('New Mw3 context witness disagrees with source geometry');
    const policy = d.street === 'flop' ? policies.flop : policies.later;
    for (const texture of d.street === 'flop' ? FLOP_TEXTURES : LATER_TEXTURES) for (const tier of MW3_TIERS) policy.rules.push({node:d.node,tier,
      when:{line:d.line,texture,players:d.players,position:d.activePosition,response:d.responseType,price:d.priceBand,spr:d.sprBand},priority:100,
      mix:authoredMw3NewMix(profile,d,tier,texture)});
  }
  for (const policy of Object.values(policies)) validateMw3Policy(policy,{spotId:profile.id,nodes:contract.nodes});
  return policies;
}

// Frequency-free bounded Stage 3 catalog. Existing Stage 1/2 catalogs are immutable.
import { continuationRoots } from "./continuation-tree.ts";
import { effectiveStackBb, positions, openSizeFor, threeBetToSize, fourBetToSize, squeezeFourBetToSize, twoCallerSqueezeFourBetToBb } from "./sizing.ts";
import stage3Config from "../../../../configs/multiway-preflop-stage3.json" with { type: "json" };

export const stage3Dataset = "stage3-responses";
export const stage3Families = ["squeeze_extra", "two_caller_squeeze_extra", "three_bet_cold_call_extra", "cold_four_bet_extra", "three_callers", "four_callers"];
export const STAGE3_RARE_THRESHOLD = stage3Config.rare_history_probability;
export const stage3Sizing = stage3Config.fixed_raise_to_bb;
export const STAGE3_ACTIONS = ["fold", "call", "squeeze", "four_bet", "all_in"];
const copy = value => JSON.parse(JSON.stringify(value));
const blind = seat => seat === "SB" ? 0.5 : seat === "BB" ? 1 : 0;
const after = seat => { const i = positions.indexOf(seat); return [...positions.slice(i + 1), ...positions.slice(0, i)]; };
const source = (dataset, spot_id, action) => ({ dataset, spot_id, action });
const action = (seat, name, size, ref = null) => ({ seat, action: name, to_size_bb: size, forced: ref === null, source: ref });
const tokens = { open: "o", call: "c", fold: "f", squeeze: "s", three_bet: "t", four_bet: "r", all_in: "a" };
export const stage3HistoryKey = history => history.map(a => `${a.seat}${tokens[a.action]}${a.to_size_bb === null ? "" : String(a.to_size_bb).replace(".", "p")}`).join("_");
const combinations = (values, n) => n === 0 ? [[]] : values.flatMap((item, i) => combinations(values.slice(i + 1), n - 1).map(tail => [item, ...tail]));
function initialState(history) {
  const state = { contributions_bb: Object.fromEntries(positions.map(p => [p, blind(p)])), folded: [], all_in: [], pending_actors: [...positions],
    facing_size_bb: 1, last_raise_increment_bb: 1, bet_level: 1, history: [], source_factors: Object.fromEntries(positions.map(p => [p, []])) };
  for (const item of history) apply(state, item);
  return state;
}
function apply(state, item) {
  const { seat, action: name, to_size_bb: size } = item;
  if (state.pending_actors[0] !== seat || state.folded.includes(seat) || state.all_in.includes(seat)) throw new Error(`Stage3 out-of-turn ${seat}`);
  if (name === "fold") { state.folded.push(seat); state.pending_actors.shift(); }
  else if (name === "call") {
    if (size !== state.facing_size_bb || size <= state.contributions_bb[seat]) throw new Error(`Stage3 invalid call ${seat}`);
    state.contributions_bb[seat] = size; if (size === effectiveStackBb) state.all_in.push(seat); state.pending_actors.shift();
  } else {
    if (size === null || size > effectiveStackBb || size < state.facing_size_bb + state.last_raise_increment_bb) throw new Error(`Stage3 invalid full raise ${seat}/${size}`);
    state.last_raise_increment_bb = size - state.facing_size_bb; state.facing_size_bb = size; state.bet_level++;
    state.contributions_bb[seat] = size; if (size === effectiveStackBb) state.all_in.push(seat);
    state.pending_actors = after(seat).filter(p => !state.folded.includes(p) && !state.all_in.includes(p));
  }
  state.history.push(item); if (item.source) state.source_factors[seat].push(item.source);
}
const familyFor = { squeeze: "squeeze_extra", two_caller_squeeze: "two_caller_squeeze_extra", three_bet_cold_call: "three_bet_cold_call_extra", cold_four_bet: "cold_four_bet_extra" };
export function enumerateStage3Roots() {
  const roots = [];
  for (const prior of continuationRoots) {
    const last = Math.max(...prior.participants.map(p => positions.indexOf(p)));
    for (const entrant of positions.slice(last + 1)) {
      const history = prior.history.slice(0, positions.indexOf(entrant));
      const family = familyFor[prior.family];
      roots.push({ ...copy(prior), id: `s3_${family}_${stage3HistoryKey(history)}_to_${entrant}`, family, entrant,
        participants: [...prior.participants, entrant], history, first_decision_id: undefined,
        stage2_root_id: prior.id, fold_boundary_id: prior.first_decision_id, rare_eligible: false });
    }
  }
  for (const count of [3, 4]) for (const tuple of combinations(positions, count + 2)) {
    const [opener, ...tail] = tuple, hero = tail.pop(), callers = tail;
    const actions = [action(opener, "open", openSizeFor(opener), source("opening-ranges", `${opener}_open`, "open"))];
    for (let i = 0; i < callers.length; i++) {
      const seat = callers[i], preceding = callers.slice(0, i);
      const id = `${seat}_vs_${opener}${preceding.map(p => `_${p}call`).join("")}`;
      const dataset = ["preflop-ranges", "multiway-responses", "multiway2-responses"][i];
      // The fourth caller is the previous Stage3 three-caller decision, never a HU call.
      let ref = dataset ? source(dataset, id, "call") : null;
      if (!ref) {
        const prior = roots.find(r => r.family === "three_callers" && r.opener === opener && r.entrant === seat && JSON.stringify(r.callers) === JSON.stringify(preceding));
        if (!prior) throw new Error("Missing exact third-caller response catalog");
        ref = source(stage3Dataset, `${prior.id}__to_${seat}`, "call");
      }
      actions.push(action(seat, "call", openSizeFor(opener), ref));
    }
    const bySeat = new Map(actions.map(a => [a.seat, a]));
    const history = positions.slice(0, positions.indexOf(hero)).map(p => bySeat.get(p) ?? action(p, "fold", null));
    const family = count === 3 ? "three_callers" : "four_callers";
    roots.push({ id: `s3_${family}_${stage3HistoryKey(history)}_to_${hero}`, family, opener, callers, entrant: hero,
      participants: [opener, ...callers, hero], history, open_size_bb: openSizeFor(opener), three_bet_size_bb: null,
      four_bet_size_bb: null, rare_eligible: true });
  }
  return roots.map(root => ({ ...root, first_decision_id: `${root.id}__to_${root.entrant}` }));
}
function fourSize(root, hero, state) {
  const squeeze = state.history.find(a => a.action === "squeeze");
  if (root.callers.length >= 3) return stage3Sizing.four_bet_after_three_or_four_caller_squeeze;
  if (root.family === "two_caller_squeeze_extra") return twoCallerSqueezeFourBetToBb;
  if (squeeze) return squeezeFourBetToSize(hero, squeeze.seat);
  return fourBetToSize(hero, root.three_bettor);
}
export function enumerateStage3Tree(selectedRoots = enumerateStage3Roots()) {
  const roots = selectedRoots, spots = [], terminals = [], boundaries = [], seen = new Set();
  const register = id => { if (seen.has(id) || id.length > 240) throw new Error(`Stage3 duplicate/overlong id ${id}`); seen.add(id); };
  for (const root of roots) {
    function visit(state, parent_id = null, parent_action = null) {
      // Once the selected entrant has acted, all other outsiders are forced folds.
      while (state.pending_actors.length && !root.participants.includes(state.pending_actors[0])) apply(state, action(state.pending_actors[0], "fold", null));
      const live = root.participants.filter(p => !state.folded.includes(p));
      const trail = state.history.slice(root.history.length), path = `${root.id}${trail.length ? `__${stage3HistoryKey(trail)}` : ""}`;
      const pot = Object.values(state.contributions_bb).reduce((sum, n) => sum + n, 0), dead = state.folded.reduce((sum, p) => sum + state.contributions_bb[p], 0);
      if (live.length === 1 || state.pending_actors.length === 0) {
        const terminal = live.length === 1 ? "uncontested" : state.all_in.length ? "all_in" : "flop", id = `${path}__end_${terminal}`; register(id);
        terminals.push({ ...state, id, root_id: root.id, family: root.family, terminal, participants: [...root.participants], live_participants: live,
          pot_bb: pot, dead_money_bb: dead, parent_id, parent_action }); return id;
      }
      const hero = state.pending_actors[0], id = `${path}__to_${hero}`; register(id);
      const raiseAction = state.bet_level === 2 ? "squeeze" : state.bet_level === 3 ? "four_bet" : state.bet_level === 4 ? "all_in" : null;
      const raiseSize = raiseAction === "squeeze" ? threeBetToSize(root.opener, hero, root.callers.length) : raiseAction === "four_bet" ? fourSize(root, hero, state) : raiseAction ? effectiveStackBb : null;
      const minimum = state.facing_size_bb === effectiveStackBb ? null : state.facing_size_bb + state.last_raise_increment_bb;
      if (raiseSize !== null && (minimum === null || raiseSize < minimum || raiseSize <= state.facing_size_bb)) throw new Error(`Stage3 illegal configured size ${id}/${raiseSize}/${minimum}`);
      const cost = state.facing_size_bb - state.contributions_bb[hero]; if (!(cost > 0)) throw new Error(`Stage3 no wager ${id}`);
      const legal_actions = ["fold", "call", ...(raiseAction ? [raiseAction] : [])];
      const node = { ...state, id, root_id: root.id, family: root.family, dataset: stage3Dataset, reused: false, hero, opener: root.opener,
        callers: [...root.callers], entrant: root.entrant, ...(root.squeezer ? { squeezer: root.squeezer } : {}),
        ...(root.three_bettor ? { three_bettor: root.three_bettor } : {}), ...(root.cold_caller ? { cold_caller: root.cold_caller } : {}), ...(root.four_bettor ? { four_bettor: root.four_bettor } : {}),
        participants: [...root.participants], live_participants: live, effective_stack_bb: effectiveStackBb, open_size_bb: root.open_size_bb,
        three_bet_size_bb: state.bet_level === 2 ? raiseSize : state.history.find(a => ["three_bet", "squeeze"].includes(a.action))?.to_size_bb,
        four_bet_size_bb: state.bet_level === 3 ? raiseSize : state.history.find(a => a.action === "four_bet")?.to_size_bb ?? null,
        minimum_raise_to_bb: minimum, pot_bb: pot, dead_money_bb: dead, cost_to_call_bb: cost, total_pot_after_call_bb: pot + cost,
        legal_actions, action_sizes_bb: { fold: null, call: state.facing_size_bb, ...(raiseAction ? { [raiseAction]: raiseSize } : {}) }, parent_id, parent_action, children: {} };
      spots.push(node);
      for (const name of legal_actions) {
        if (!parent_id && name === "fold" && root.fold_boundary_id) {
          const target = `s3_boundary_${id}`; register(target);
          boundaries.push({ id: target, root_id: root.id, parent_id: id, parent_action: "fold", dataset: "continuation-or-reused", target_id: root.fold_boundary_id,
            assumption: "The selected outside seat folds. Resume unchanged Stage2 outside-forced-fold model; this fold's cards are unmodeled at the legacy boundary." });
          node.children[name] = target; continue;
        }
        const next = { ...state, contributions_bb: { ...state.contributions_bb }, folded: [...state.folded], all_in: [...state.all_in], pending_actors: [...state.pending_actors], history: [...state.history], source_factors: Object.fromEntries(Object.entries(state.source_factors).map(([seat, refs]) => [seat, [...refs]])) }; apply(next, action(hero, name, node.action_sizes_bb[name], source(stage3Dataset, id, name)));
        node.children[name] = visit(next, id, name);
      }
      return id;
    }
    root.first_decision_id = visit(initialState(root.history));
  }
  return { roots, spots, all_decisions: spots, terminals, boundaries };
}

export const stage3RootDescriptors = enumerateStage3Roots();
export function findStage3Root(history, hero) { const key = stage3HistoryKey(history); return stage3RootDescriptors.find(root => root.entrant === hero && stage3HistoryKey(root.history) === key) ?? null; }
export function stage3TreeForRoot(id) {
  const root = stage3RootDescriptors.find(item => item.id === id);
  if (!root) throw new Error(`Unknown Stage3 root ${id}`);
  return enumerateStage3Tree([root]);
}

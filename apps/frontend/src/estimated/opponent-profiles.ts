// Stage A: separate villain-only preflop assumptions. Standard strategy stays
// authoritative, and this module never runs its EV policy on archetype mixes.
export const OPPONENT_PROFILES = ["nit", "station", "lag", "maniac"] as const;
export const OPPONENT_PROFILE_DATASETS = ["opening-ranges", "preflop-ranges", "three-bet-responses",
  "four-bet-responses", "five-bet-responses", "limp-responses", "limp-deep-responses"] as const;
export type OpponentProfile = typeof OPPONENT_PROFILES[number];
export type OpponentProfileDataset = typeof OPPONENT_PROFILE_DATASETS[number];
export function opponentProfileDatasetName(profile: OpponentProfile, name: OpponentProfileDataset | "meta"): string {
  if (!OPPONENT_PROFILES.includes(profile) || ![...OPPONENT_PROFILE_DATASETS, "meta"].includes(name)) {
    throw new Error("Unknown opponent profile dataset");
  }
  return `profiles/${profile}/villain/${name}`;
}

const RANKS = "AKQJT98765432";
const HANDS = [...RANKS].flatMap((a, i) => [...RANKS].map((b, j) => i === j ? a + b : i < j ? a + b + "s" : b + a + "o"));
const ACTIONS = new Set(["fold", "call", "open", "limp", "check", "raise", "three_bet", "four_bet", "all_in"]);
const ROW_SIZES = { open_size_bb: "open", limp_size_bb: "limp", three_bet_size_bb: "three_bet",
  four_bet_size_bb: "four_bet", all_in_size_bb: "all_in", raise_size_bb: "raise" };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const spotById = (datasets, name, id) => datasets[name]?.spots?.find(s => s.id === id);
const frequency = (datasets, name, id, hand, action) =>
  (spotById(datasets, name, id)?.hands?.find(r => r.hand === hand)?.[action] ?? 0) / 100;

// Only the actor's preceding decisions contribute to its reach. Never multiply
// by an opponent holding the same hand class; card removal belongs to Stage C.
export function opponentProfileReach(datasets, name, spot, hand) {
  const f = (n, id, a) => frequency(datasets, n, id, hand, a);
  if (name === "opening-ranges" || name === "preflop-ranges") return 1;
  if (name === "three-bet-responses") return f("opening-ranges", `${spot.opener}_open`, "open");
  if (name === "four-bet-responses") return f("preflop-ranges", spot.source_response_id, "three_bet");
  if (name === "five-bet-responses") return f("opening-ranges", `${spot.opener}_open`, "open") *
    f("three-bet-responses", `${spot.opener}_vs_${spot.five_bettor}_three_bet`, "four_bet");
  switch (spot.id) {
    case "BB_vs_SB_limp": return 1;
    case "SB_vs_BB_iso": return f("opening-ranges", "SB_open", "limp");
    case "BB_vs_SB_limp_reraise": return f("limp-responses", "BB_vs_SB_limp", "raise");
    case "SB_vs_BB_limp_four_bet": return f("opening-ranges", "SB_open", "limp") * f("limp-responses", "SB_vs_BB_iso", "raise");
    case "BB_vs_SB_limp_five_bet": return f("limp-responses", "BB_vs_SB_limp", "raise") * f("limp-responses", "BB_vs_SB_limp_reraise", "four_bet");
    default: throw new Error(`Unknown opponent profile history ${name}/${spot.id}`);
  }
}

// Structural validation has its own entry point so behavioral mistakes (for
// example station calls with negative EV) can never rewrite authored data or
// silently weaken the ordinary audit. The balanced bundle supplies only schema,
// IDs and exact fixed geometry, and must be independently validated as before.
export function auditOpponentProfiles(profiles, balanced) {
  const findings = [];
  const add = (check, spot, detail, severity = "error") => findings.push({ check, severity, spot, detail });
  if (!profiles || !same(Object.keys(profiles).sort(), [...OPPONENT_PROFILES].sort())) {
    add("profile-coverage", "profiles", "Expected exactly nit, station, lag and maniac.");
  }
  for (const p of OPPONENT_PROFILES) {
    const bundle = profiles?.[p];
    if (!bundle) { add("profile-coverage", p, "Missing profile."); continue; }
    const meta = bundle.meta;
    if (meta?.schema_version !== "1.0" || meta.opponent_profile !== p || meta.role !== "villain" ||
        meta.strategy_type !== "ai_estimate_not_gto" || meta.frequency_policy !== "authored_only_no_call_ev" ||
        meta.audit_policy !== "structural_errors_strength_warnings" ||
        !["ja", "en"].every(l => typeof meta.name?.[l] === "string" && meta.name[l].trim() &&
          typeof meta.description?.[l] === "string" && meta.description[l].trim()) ||
        !OPPONENT_PROFILE_DATASETS.every(n => ["ja", "en"].every(l => typeof meta.datasets?.[n]?.[l] === "string" && meta.datasets[n][l].trim()))) {
      add("profile-meta", p, "Missing identity, bilingual descriptions, dataset summaries, or authored-only policy.");
    }
    if (!same(Object.keys(bundle).sort(), [...OPPONENT_PROFILE_DATASETS, "meta"].sort())) {
      add("profile-coverage", p, "Expected seven villain datasets and meta, with no exploit data.");
    }
    for (const name of OPPONENT_PROFILE_DATASETS) {
      const base = balanced[name], data = bundle[name], label = `${p}/${name}`;
      if (!base?.spots || !data?.spots || !Array.isArray(data.spots)) {
        add("profile-coverage", label, "Missing dataset or balanced schema."); continue;
      }
      const expectedIds = base.spots.map(s => s.id);
      if (!same(data.spots.map(s => s?.id), expectedIds) || data.spot_count !== base.spot_count ||
          data.hand_classes_per_spot !== 169 || data.entry_count !== 169 * base.spot_count) {
        add("profile-coverage", label, "Spot IDs/order/counts must exactly match the balanced HU dataset.");
      }
      const md = data.metadata;
      if (!md || md.strategy_type !== "ai_estimate_not_gto" || md.schema_version !== "1.0" ||
          md.opponent_profile !== p || md.role !== "villain" || md.ante_bb !== 0 ||
          md.effective_stack_bb !== 100 || md.game !== base.metadata.game || md.open_size_bb !== base.metadata.open_size_bb ||
          !same(md.legal_actions, base.metadata.legal_actions) || md.rake?.rate !== .05 || md.rake?.cap_bb !== 3 ||
          md.rake?.no_flop_no_drop !== true || md.rake?.calibrated !== false || "call_ev_policy" in md) {
        add("profile-metadata", label, "Invalid archetype identity, game, fixed sizing/rake or EV exemption.");
      }
      for (const s of data.spots) {
        const template = base.spots.find(t => t.id === s?.id);
        if (!template) continue;
        const sl = `${p}/${s.id}`;
        const spotKeys = Object.keys(template).filter(k => k !== "hands");
        if (!same(Object.keys(s).filter(k => k !== "hands").sort(), [...spotKeys].sort()) ||
            spotKeys.some(k => k === "shove_range_combos" ? s[k] !== null : !same(s[k], template[k]))) {
          add("profile-sizing-context", sl, "Spot geometry/source IDs differ, or an uncomputed shove statistic was copied.");
        }
        if (!Array.isArray(s.hands) || s.hands.length !== 169 || s.hands.some((r, i) => r?.hand !== HANDS[i])) {
          add("profile-hand-coverage", sl, "Expected all 169 distinct canonical hand rows, in order."); continue;
        }
        for (const [i, row] of s.hands.entries()) {
          const old = template.hands[i], keys = Object.keys(old).filter(k => k !== "reason");
          const actions = keys.filter(k => ACTIONS.has(k));
          if (!same(Object.keys(row).sort(), [...keys].sort()) ||
              actions.some(a => !Number.isInteger(row[a]) || row[a] < 0 || row[a] > 100) ||
              actions.reduce((sum, a) => sum + row[a], 0) !== 100) {
            add("profile-frequency", sl, `${row.hand}: action/schema mismatch or non-integer/out-of-bounds frequencies/sum.`); continue;
          }
          if ("equity_vs_shove_pct" in row && row.equity_vs_shove_pct !== null) {
            add("profile-uncomputed-facts", sl, `${row.hand}: archetype equity is not computed; expected null.`);
          }
          for (const key of keys.filter(k => Object.hasOwn(ROW_SIZES, k))) {
            const action = ROW_SIZES[key];
            const size = key === "limp_size_bb" ? 1 : key === "raise_size_bb" ? s.raise_size_bb ?? s.raise_to_bb : s[key];
            if (row[key] !== (row[action] > 0 ? size : null)) add("profile-sizing-context", sl, `${row.hand}: invalid ${key}.`);
          }
          if (opponentProfileReach(bundle, name, s, row.hand) === 0 && row.fold !== 100) {
            add("profile-range-flow", sl, `${row.hand}: zero preceding own-action reach must be fold=100.`);
          }
        }
        const byHand = new Map(s.hands.map(r => [r.hand, r]));
        const inversions = [];
        const chains = [[...RANKS].map(r => r+r), ...[...RANKS].flatMap((r, i) =>
          ["s", "o"].map(suit => [...RANKS.slice(i+1)].map(k => r+k+suit)))];
        const compare = (a, b) => {
          const first = byHand.get(a), second = byHand.get(b);
          if (!first || !second || /^A6[so]$/.test(a) && /^A5[so]$/.test(b) ||
              !opponentProfileReach(bundle,name,s,a) || !opponentProfileReach(bundle,name,s,b)) return;
          const fold = r => r.fold ?? r.check ?? 0;
          if (fold(first)-fold(second)>10) inversions.push(`${a}/${b} passive-or-fold ${fold(first)}/${fold(second)}`);
        };
        for (const chain of chains) for (let i=0; i<chain.length-1; i++) compare(chain[i],chain[i+1]);
        for (const hand of HANDS.filter(h=>h.endsWith("s"))) compare(hand,hand.slice(0,2)+"o");
        if (inversions.length) add("profile-strength-order", sl, `${inversions.length} authored ordering inversions; ${inversions.slice(0,3).join("; ")}`, "warn");
      }
    }
  }
  return { findings };
}

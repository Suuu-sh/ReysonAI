// Validates the exact hand-EV against the high-sample Monte Carlo it replaced (kept as *MonteCarlo functions).
// Usage: node scripts/postflop-ai/perf/exact-validate.mjs river|turn|flop [seeds=8] [samplesPerSeed]
// For each case the exact EV of every action is compared with the mean of `seeds` independent Monte Carlo
// runs; z = (exact - mean) / standard error of that mean. |z| <= 3 passes. The flop Monte Carlo draws its
// runouts from the same fixed set the exact method averages over (that set is the only intended difference).
// The Monte Carlo uses Math.random: the seeded mulberry32 stream of the old code gave a small but
// significant low bias in class equity (95.86 vs 95.93 exact on 77, turn) that is a property of that stream.
import { loadInputs } from "../inputs.mjs";
import { loadCandidate, loadLaterCandidate } from "../generate.mjs";
import { flopEvRunouts, flopHandEvForHand, flopHandEvForHandMonteCarlo } from "../flop-hand-ev-core.mjs";
import { laterHandEvForHand, laterHandEvForHandMonteCarlo } from "../later-hand-ev-core.mjs";
import { parseFlopBoard } from "../model.mjs";

const [street = "river", seedsArg = "8", samplesArg, only] = process.argv.slice(2);
const seeds = Number(seedsArg);
const inputs = loadInputs("BTN_open_BB_call"), candidate = loadCandidate(inputs), later = loadLaterCandidate(inputs, candidate);
const shared = { inputs, flopPolicy: candidate.policy, laterPolicy: later.policy };
const turnBase = { flop: "As7d2c", flopActions: ["bet33", "call"], turn: "3s" };
const cases = {
  river: [
    { label: "river OOP first, 5s", hand: "KQs", ...turnBase, turnActions: ["check", "check"], river: "5s", riverActions: [] },
    { label: "river OOP facing bet75, 5s", hand: "AKo", ...turnBase, turnActions: ["check", "check"], river: "5s", riverActions: ["check", "bet75"] },
    { label: "river IP facing bet33, Kd", hand: "77", ...turnBase, turnActions: ["check", "check"], river: "Kd", riverActions: ["bet33"] },
  ],
  turn: [
    { label: "turn OOP first, AKo", hand: "AKo", ...turnBase, turnActions: [] },
    { label: "turn OOP first, 77", hand: "77", ...turnBase, turnActions: [] },
    { label: "turn IP after check, KQs", hand: "KQs", ...turnBase, turnActions: ["check"] },
  ],
  flop: [
    { label: "flop first action, KQs", hand: "KQs", flop: "As7d2c", history: [] },
    { label: "flop first action, 77", hand: "77", flop: "As7d2c", history: [] },
  ],
}[street];
const samples = Number(samplesArg ?? (street === "flop" ? 6000 : 10000));
const run = (kind, request, extra = {}) => street === "flop"
  ? (kind === "exact" ? flopHandEvForHand : flopHandEvForHandMonteCarlo)({ ...shared, ...request, ...extra })
  : (kind === "exact" ? laterHandEvForHand : laterHandEvForHandMonteCarlo)({ ...shared, ...request, ...extra });
for (const request of cases) {
  const { label, ...rest } = request;
  if (only && !label.includes(only)) continue;
  const t0 = performance.now();
  const exact = run("exact", rest).row;
  const exactMs = Math.round(performance.now() - t0);
  const extra = street === "flop" ? { runoutSet: flopEvRunouts(parseFlopBoard(rest.flop).cards) } : {};
  const runs = Array.from({ length: seeds }, (_, i) => run("mc", rest, { samples, seed: 5000 + i, rng: () => Math.random, ...extra }).row);
  const actions = Object.keys(exact.ev_bb);
  const stat = pick => {
    const values = runs.map(pick), mean = values.reduce((a, b) => a + b, 0) / seeds;
    const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / (seeds - 1));
    return { mean, se: sd / Math.sqrt(seeds) };
  };
  const rows = [...actions.map(action => [action, exact.ev_bb[action], stat(r => r.ev_bb[action])]),
    ["mix_ev", exact.mix_ev_bb, stat(r => r.mix_ev_bb)], ["equity%", exact.equity_pct, stat(r => r.equity_pct)]];
  console.log(`## ${label} (exact ${exactMs} ms; MC ${seeds} x ${samples})`);
  for (const [name, value, { mean, se }] of rows) {
    const z = se > 0 ? (value - mean) / se : (value === mean ? 0 : Infinity);
    console.log(`${name.padEnd(8)} exact ${value.toFixed(2).padStart(8)}  mc ${mean.toFixed(2).padStart(8)} +- ${se.toFixed(3)}  z ${z.toFixed(2)}${Math.abs(z) > 3 ? "  FAIL" : ""}`);
  }
}

// node scripts/postflop-ai/authored/save-all.mjs — saves the generic Claude-authored rules
// for every reachable spot that has no candidate yet (existing candidates are reused).
import { generate, generateLater } from "../generate.mjs";
import { loadInputs } from "../inputs.mjs";
import { POSTFLOP_SPOTS } from "../spots.mjs";
import { build } from "./generic.mjs";
const opts = { model: "claude-opus-5-5", effort: "high" };
for (const spot of POSTFLOP_SPOTS.filter(item => item.reachable)) {
  const inputs = loadInputs(spot.id), authored = build(spot);
  const flop = await generate(inputs, { ...opts, generator: async () => authored.flop });
  const later = await generateLater(inputs, flop.candidate, { ...opts, generator: async () => authored.laterPolicy });
  console.log(`${spot.id}: flop ${flop.reused ? "reused" : "saved"}, later ${later.reused ? "reused" : "saved"}`);
}

// node scripts/postflop-ai/authored/save-all.ts — saves the generic Claude-authored rules
// for every reachable spot that has no candidate yet (existing candidates are reused).
import { generate, generateLater } from "../generate.ts";
import { loadInputs } from "../inputs.ts";
import { POSTFLOP_SPOTS } from "../spots.ts";
import { build } from "./generic.ts";
const opts = { model: "claude-opus-5-5", effort: "high" };
for (const spot of POSTFLOP_SPOTS.filter((item: any) : any => item.reachable)) {
  const inputs = loadInputs(spot.id), authored = build(spot);
  const flop = await generate(inputs, { ...opts, generator: async () : Promise<any> => authored.flop });
  const later = await generateLater(inputs, flop.candidate, { ...opts, generator: async () : Promise<any> => authored.laterPolicy });
  console.log(`${spot.id}: flop ${flop.reused ? "reused" : "saved"}, later ${later.reused ? "reused" : "saved"}`);
}

// node scripts/postflop-ai/authored/save.ts <spotId> <module> — saves Claude-authored rules
// through the normal validation (generate / generateLater), recording the author model.
import { generate, generateLater } from "../generate.ts";
import { loadInputs } from "../inputs.ts";
const [spotId, file] = process.argv.slice(2);
const authored = await import(new URL(file, import.meta.url).href);
const inputs = loadInputs(spotId), opts = { model: "claude-opus-5-5", effort: "high" };
const flop = await generate(inputs, { ...opts, generator: async () : Promise<any> => authored.flop });
const later = await generateLater(inputs, flop.candidate, { ...opts, generator: async () : Promise<any> => authored.laterPolicy });
console.log(`${spotId}: flop ${flop.reused ? "reused" : "saved"}, later ${later.reused ? "reused" : "saved"}`);

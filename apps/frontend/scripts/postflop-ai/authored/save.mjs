// node scripts/postflop-ai/authored/save.mjs <spotId> <module> — saves Claude-authored rules
// through the normal validation (generate / generateLater), recording the author model.
import { generate, generateLater } from "../generate.mjs";
import { loadInputs } from "../inputs.mjs";
const [spotId, file] = process.argv.slice(2);
const authored = await import(new URL(file, import.meta.url));
const inputs = loadInputs(spotId), opts = { model: "claude-opus-5-5", effort: "high" };
const flop = await generate(inputs, { ...opts, generator: async () => authored.flop });
const later = await generateLater(inputs, flop.candidate, { ...opts, generator: async () => authored.laterPolicy });
console.log(`${spotId}: flop ${flop.reused ? "reused" : "saved"}, later ${later.reused ? "reused" : "saved"}`);

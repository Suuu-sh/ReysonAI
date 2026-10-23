// Explicit one-decision pilot, never a hidden generator or an all-board/tree batch.
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createAiv2SessionProvider } from "./lib/aiv2-provider-session.ts";
import { AIV2_MODEL, AIV2_REASONING_EFFORT } from "./aiv2-preflop.ts";
import { POSTFLOP_METHOD, initialBtnBbInput, decisionIdentity, postflopPrompt, postflopResponseSchema, validatePostflopResponse, buildPostflopArtifact, validatePostflopArtifact, postflopHash } from "./aiv2-postflop.ts";
import type { DecisionInput } from "./aiv2-postflop.ts";
const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));
export async function runPostflopPilot(argv: string[]) {
  const implementation = postflopHash(["aiv2-postflop.ts", "aiv2-postflop-cli.ts"].map(file => readFileSync(join(root, "scripts", file), "utf8")));
  const sourceRoot = join(root, "candidates/aiv2-preflop/llm-range-single-response-v6/spots/base");
  const inputFile = argv.find(arg => arg.startsWith("--input="))?.slice("--input=".length);
  // Later decisions must be explicitly prepared from the saved predecessor by the caller.
  // No implicit runout, action branch, scene loop or automatic future-street request.
  const input: DecisionInput = inputFile ? read(inputFile) : initialBtnBbInput(read(join(sourceRoot, "opening-ranges/BTN_open.json")), read(join(sourceRoot, "preflop-ranges/BB_vs_BTN.json")));
  const id = decisionIdentity(input, implementation), directory = join(root, "candidates/aiv2-postflop", POSTFLOP_METHOD, "decisions"), path = join(directory, id + ".json");
  if (existsSync(path)) {
    const artifact = validatePostflopArtifact(read(path));
    if (artifact.decision_id !== id) throw new Error("Cached decision identity differs");
    console.log(JSON.stringify({ status: "saved", decision_id: id, path, reached_combo_count: artifact.combos.length, model: AIV2_MODEL, effort: AIV2_REASONING_EFFORT })); return;
  }
  const prompt = postflopPrompt(input, id), schema = postflopResponseSchema(input, id);
  const summary = { status: "not-generated", decision_id: id, path, model: AIV2_MODEL, effort: AIV2_REASONING_EFFORT, street: input.street, board: input.board, actor: input.actor, prompt_bytes: Buffer.byteLength(prompt), schema_hash: postflopHash(schema), coverage: "one-exact-board-public-history-actor-only" };
  if (!argv.includes("--generate")) { console.log(JSON.stringify({ ...summary, ...(argv.includes("--prompt") ? { prompt, schema } : {}) })); return; }
  if (!argv.includes("--confirm-one-decision-quota")) throw new Error("Generation requires --generate --confirm-one-decision-quota");
  let stop = false; const drain = () => { stop = true; }; process.once("SIGTERM", drain);
  const metrics: unknown[] = [], provider = createAiv2SessionProvider({ concurrency: 1, onMetric: metric => metrics.push(metric) });
  try {
    const raw = await provider.withSession(async session => {
      let issue = "";
      for (let attempt = 0; attempt < 2; attempt++) {
        if (stop) throw new Error("controlled_stop_requested");
        const effective = prompt + (attempt ? "\nCorrect ONLY the previous invalid response: " + issue + ". Return the COMPLETE response covering every positive actor combo and bilingual reasons. Context above remains authoritative." : "");
        let value: unknown;
        try { value = await session.run(effective, { model: AIV2_MODEL, effort: AIV2_REASONING_EFFORT, outputSchema: schema }); }
        catch (error) { if (!error || typeof error !== "object" || !("code" in error) || error.code !== "invalid_json") throw error; issue = "Invalid JSON"; continue; }
        try { validatePostflopResponse(value, input, id); return value; }
        catch (error) { issue = error instanceof Error ? error.message : "Invalid response"; }
      }
      throw new Error("Bounded postflop validation failed: " + issue);
    });
    const artifact = buildPostflopArtifact(input, raw, implementation);
    mkdirSync(directory, { recursive: true });
    // Exclusive creation: existing identities cannot be silently overwritten/relabelled.
    writeFileSync(path, JSON.stringify(artifact) + "\n", { flag: "wx" });
    console.log(JSON.stringify({ ...summary, status: "saved", reached_combo_count: artifact.combos.length, metrics }));
  } finally { await provider.drain(); process.removeListener("SIGTERM", drain); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await runPostflopPilot(process.argv.slice(2));

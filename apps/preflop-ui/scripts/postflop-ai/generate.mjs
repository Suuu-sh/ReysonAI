// Explicit, local-only Codex generation of compact AI policy rules.
// It never writes a published strategy or silently regenerates an existing candidate.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { boards, comboRange, config, root } from "./inputs.mjs";
import { boardTexture, handTier, TIERS } from "./model.mjs";
import { NODES, validatePolicy } from "./policy.mjs";

export const candidatePath = join(root, ".local/postflop-ai/btn-bb-srp-v1-policy.json");
export const reportPath = join(root, ".local/postflop-ai/btn-bb-srp-v1-report.json");
export const sha = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function loadCandidate(inputs) {
  const candidate = JSON.parse(readFileSync(candidatePath, "utf8"));
  if (candidate?.metadata?.source_hash !== inputs.fingerprint || candidate.metadata.config_version !== config.version) {
    throw new Error("AI policy source is stale; archive it and explicitly generate a new candidate");
  }
  validatePolicy(candidate.policy);
  if (candidate.metadata.policy_hash !== sha(candidate.policy)) throw new Error("Saved AI policy hash does not match its content");
  return candidate;
}

export function promptFor(inputs) {
  const distribution = (rows, action, board) => {
    const weighted = Object.fromEntries(TIERS.map(tier => [tier, 0]));
    for (const { combo, weight } of comboRange(rows, action, board)) weighted[handTier(combo, board)] += weight;
    const total = Object.values(weighted).reduce((sum, value) => sum + value, 0);
    return TIERS.map(tier => `${tier}:${Math.round(weighted[tier] / total * 100)}`).join("/");
  };
  const design = boards().filter(board => board.split === "design").map(board =>
    `${board.id}(${boardTexture(board.cards)};BTN ${distribution(inputs.opening.hands, "open", board.cards)};BB ${distribution(inputs.response.hands, "call", board.cards)})`);
  return [
    "Create compact flop-only AI-estimated poker policy rules, not GTO, solver, equilibrium, or external chart output. Return one JSON object only. Do not call tools or write files.",
    "Cash 6-max 100BB no ante, BTN opens 2.5BB, BB calls, SB folds; flop pot 5.5BB, stacks 97.5BB, rake 5% capped at 3BB.",
    "Input summaries below are weighted real two-card combo distributions after excluding flop blockers. Tier values are rounded percentages, in monster/strong/draw/medium/air order. Never infer the opponent's hidden cards during a decision.",
    `Example design flops (no other boards supplied): ${design.join(", ")}. Rules must generalize to unseen textures.`,
    "BB checks first. BTN chooses check/bet33/bet75. BB facing bet33 or bet75 chooses fold/call/raise to 3x original bet. BTN facing check-raise chooses fold/call. No further flop raises. Turn/river are evaluated by a separate fixed model; do not author them.",
    "Use tier order monster(two pair+), strong(top pair/overpair), draw(flush/straight draw), medium(other pair), air. Texture is dry/wet/monotone/paired. Rules may override a texture, but every node and tier MUST have one texture=any fallback.",
    `Nodes/actions: ${JSON.stringify(NODES)}. Tiers: ${TIERS.join(", ")}.`,
    "Output exactly {version:1,kind:'ai_estimate_not_gto',rules:[{node,texture,tier,mix},...]}. Mix keys must be exactly the legal actions for that node, integer 0..100, summing to 100. Include the 20 mandatory fallback rules and no more than 80 overrides; no rationale, code, private opponent cards, or other properties.",
  ].join("\n");
}

export function runCodex(prompt, timeoutMs = 300000) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env }; delete env.OPENAI_API_KEY; delete env.CODEX_API_KEY;
    const bundled = "/Applications/ChatGPT.app/Contents/Resources/codex";
    const child = spawn(existsSync(bundled) ? bundled : "codex", ["app-server", "-c", "mcp_servers={}"],
      { cwd: root, env, stdio: ["pipe", "pipe", "pipe"] });
    let buffer = "", final = "", threadId, done = false, stderr = "";
    const timer = setTimeout(() => fail(new Error("Codex policy generation timed out")), timeoutMs);
    const send = value => child.stdin.write(`${JSON.stringify(value)}\n`);
    function fail(error) { if (done) return; done = true; clearTimeout(timer); child.kill(); reject(error); }
    function finish() {
      if (done) return;
      done = true; clearTimeout(timer); child.kill();
      try { resolve(JSON.parse(final)); } catch { reject(new Error(`Codex returned invalid JSON: ${stderr.slice(-240)}`)); }
    }
    child.on("error", fail);
    child.on("exit", code => { if (!done) fail(new Error(`Codex app-server exited (${code}): ${stderr.slice(-240)}`)); });
    child.stderr.on("data", chunk => { stderr = `${stderr}${chunk}`.slice(-1000); });
    child.stdout.on("data", chunk => {
      buffer += chunk;
      let index;
      while ((index = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, index); buffer = buffer.slice(index + 1);
        let msg; try { msg = JSON.parse(line); } catch { continue; }
        if (msg.error) { fail(new Error(msg.error.message ?? "Codex app-server error")); return; }
        if (msg.id === 1) {
          send({ method: "initialized", params: {} });
          send({ id: 2, method: "thread/start", params: { cwd: root, approvalPolicy: "never", sandbox: "read-only", ephemeral: true, model: "gpt-6-sol" } });
        }
        if (msg.id === 2) {
          threadId = msg.result?.thread?.id;
          if (!threadId) { fail(new Error("Codex thread failed to start")); return; }
          send({ id: 3, method: "turn/start", params: { threadId,
            input: [{ type: "text", text: prompt }] } });
        }
        if (msg.method === "item/completed" && msg.params?.item?.type === "agentMessage") final = msg.params.item.text ?? final;
        if (msg.method === "item/agentMessage/delta") final += msg.params?.delta ?? "";
        if (msg.method === "turn/completed") {
          if (msg.params?.turn?.status !== "completed") { fail(new Error(msg.params?.turn?.error?.message ?? "Codex policy generation failed")); return; }
          finish();
        }
      }
    });
    send({ id: 1, method: "initialize", params: { clientInfo: { name: "solveaai_postflop_ai", title: "SolveaAI postflop AI pilot", version: "0.1.0" }, capabilities: {} } });
  });
}

export async function generate(inputs, generator = runCodex) {
  if (existsSync(candidatePath)) return { candidate: loadCandidate(inputs), reused: true };
  const prompt = promptFor(inputs);
  const policy = validatePolicy(await generator(prompt));
  const candidate = { metadata: { kind: "ai_estimate_not_gto", scope: "12 representative flops; flop only; not published",
    source_hash: inputs.fingerprint, policy_hash: sha(policy), config_version: config.version,
    model: "gpt-6-sol", prompt_hash: sha(prompt) }, policy };
  mkdirSync(join(root, ".local/postflop-ai"), { recursive: true });
  writeFileSync(candidatePath, `${JSON.stringify(candidate, null, 2)}\n`, { flag: "wx" });
  return { candidate, reused: false };
}

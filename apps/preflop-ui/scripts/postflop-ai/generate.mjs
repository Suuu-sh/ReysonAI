// Explicit, local-only Codex generation of compact AI policy rules.
// It never writes a published strategy or silently regenerates an existing candidate.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { artifactPaths, boards, config, root, seatRange } from "./inputs.mjs";
import { LATER_NODES, STREETS, openingActions, streetNodes } from "./later-tree.mjs";
import { boardTexture, handTier, LINES, RUNOUT_TEXTURES, TIERS } from "./model.mjs";
import { NODES, treeNodes, validatePolicy } from "./policy.mjs";
import { FLOP_BETS, facingNode, flopBetLabel } from "./tree.mjs";
import { validateLaterPolicy } from "./later-policy.mjs";

// Local Codex model for new candidates: --model, else POSTFLOP_AI_MODEL, else this default.
// Existing candidates are reused as saved (the first BTN/BB pilot was made with gpt-6-sol).
export const DEFAULT_MODEL = "gpt-6-luna";
export const resolveModel = cliModel => cliModel || process.env.POSTFLOP_AI_MODEL || DEFAULT_MODEL;
// Reasoning effort passed as -c model_reasoning_effort: --effort, else POSTFLOP_AI_EFFORT, else the maximum
// the API accepts (none/minimal/low/medium/high/xhigh/max; verified for gpt-6-luna and gpt-6-sol on 2026-09-26).
export const DEFAULT_EFFORT = "max";
export const resolveEffort = cliEffort => cliEffort || process.env.POSTFLOP_AI_EFFORT || DEFAULT_EFFORT;
export const sha = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function loadCandidate(inputs) {
  const candidate = JSON.parse(readFileSync(artifactPaths(inputs.spot).candidate, "utf8"));
  if (candidate?.metadata?.source_hash !== inputs.fingerprint || candidate.metadata.config_version !== config.version ||
      (candidate.metadata.spot ?? inputs.spot.id) !== inputs.spot.id ||
      (candidate.metadata.tree ?? "oop_checks") !== inputs.spot.tree) {
    throw new Error("AI policy source is stale; archive it and explicitly generate a new candidate");
  }
  validatePolicy(candidate.policy, inputs.spot.tree);
  if (candidate.metadata.policy_hash !== sha(candidate.policy)) throw new Error("Saved AI policy hash does not match its content");
  return candidate;
}

// Optional local later-street artifact. Missing means use the fixed reference, while
// malformed/stale files are errors, never a silent fallback or a generation request.
export function loadLaterCandidate(inputs, flopCandidate) {
  const path = artifactPaths(inputs.spot).laterCandidate;
  if (!existsSync(path)) return null;
  const candidate = JSON.parse(readFileSync(path, "utf8"));
  if (candidate?.metadata?.source_hash !== inputs.fingerprint ||
      flopCandidate?.metadata?.source_hash !== inputs.fingerprint ||
      flopCandidate.metadata.policy_hash !== sha(flopCandidate.policy) ||
      candidate.metadata.flop_policy_hash !== flopCandidate.metadata.policy_hash) throw new Error("Later AI policy source or flop policy is stale");
  validateLaterPolicy(candidate.policy);
  if (candidate.metadata.policy_hash !== sha(candidate.policy)) throw new Error("Saved later AI policy hash does not match its content");
  return candidate;
}

// Shared spot description (preflop line, seats, design-flop range summaries) for both prompts.
function spotContext(inputs) {
  const { spot } = inputs;
  const distribution = (seat, board) => {
    const weighted = Object.fromEntries(TIERS.map(tier => [tier, 0]));
    for (const { combo, weight } of seatRange(inputs, seat, board)) weighted[handTier(combo, board)] += weight;
    const total = Object.values(weighted).reduce((sum, value) => sum + value, 0);
    return TIERS.map(tier => `${tier}:${Math.round(weighted[tier] / total * 100)}`).join("/");
  };
  const design = boards().filter(board => board.split === "design").map(board =>
    `${board.id}(${boardTexture(board.cards)};${spot.ip} ${distribution(spot.ip, board.cards)};${spot.oop} ${distribution(spot.oop, board.cards)})`);
  const raiser = seat => !spot.aggressor ? (seat === "SB" ? "limper" : "checked the limp")
    : seat === spot.aggressor ? ({ "3bp": "preflop 3bettor", "4bp": "preflop 4bettor", limp: "preflop last raiser" }[spot.kind] ?? "preflop raiser")
      : "preflop caller";
  const preflop = {
    "3bp": `${spot.opener} opens ${spot.openBb}BB, ${spot.threeBettor} 3bets to ${spot.threeBetBb}BB, ${spot.opener} calls, every other seat folds; heads-up 3bet pot,`,
    "4bp": `${spot.opener} opens ${spot.openBb}BB, ${spot.threeBettor} 3bets to ${spot.threeBetBb}BB, ${spot.opener} 4bets to ${spot.fourBetBb}BB, ${spot.threeBettor} calls, every other seat folds; heads-up 4bet pot (low stack-to-pot ratio),`,
    limp: {
      SB_limp_BB_check: "everyone folds to SB, SB limps (completes to 1BB), BB checks; heads-up limped pot,",
      SB_limp_BB_iso_call: "everyone folds to SB, SB limps (1BB), BB raises to 3.5BB, SB calls; heads-up pot,",
      SB_limp_BB_iso_SB_reraise_call: "everyone folds to SB, SB limps (1BB), BB raises to 3.5BB, SB reraises to 10.5BB, BB calls; heads-up pot,",
    }[spot.id],
  }[spot.kind] ?? `${spot.opener} opens ${spot.openBb}BB, ${spot.caller} calls, every other seat folds; heads-up`;
  const nodeNames = spot.tree === "oop_leads"
    ? `Node names are fixed: btn_* and ip_* nodes are ${spot.ip}'s (IP) decisions and bb_* and oop_* nodes are ${spot.oop}'s (OOP) decisions.`
    : `Node names are fixed: btn_* nodes are ${spot.ip}'s (IP) decisions and bb_* nodes are ${spot.oop}'s (OOP) decisions.`;
  return { preflop, design, raiser, nodeNames };
}

export function promptFor(inputs) {
  const { spot } = inputs;
  const { preflop, design, raiser, nodeNames } = spotContext(inputs);
  const nodes = treeNodes(spot.tree);
  const bets = FLOP_BETS.join("/"), sizes = FLOP_BETS.map(flopBetLabel).join(" / ");
  const facingList = bettor => FLOP_BETS.map(bet => facingNode(bettor, bet)).join(" / ");
  const later = "Turn/river use a separate later-street policy; do not author them.";
  const tree = spot.tree === "oop_leads"
    ? `${spot.oop} acts first and chooses check/${bets} (oop_first; bets are ${sizes} of the pot). Facing that bet, ${spot.ip} chooses fold/call/raise to 3x the bet (${facingList("oop")}); facing the raise ${spot.oop} chooses fold/call (oop_vs_raise). After ${spot.oop} checks, ${spot.ip} chooses check/${bets} (btn_first); ${spot.oop} facing that bet chooses fold/call/raise to 3x the bet (${facingList("ip")}); ${spot.ip} facing that check-raise chooses fold/call (btn_vs_raise). No further flop raises; bets and raises are capped by the ${spot.stackBb}BB stacks, and any wager committing at least two thirds of the remaining stack is an all-in. ${later}`
    : `${spot.oop} checks first. ${spot.ip} chooses check/${bets} (btn_first; bets are ${sizes} of the pot). ${spot.oop} facing that bet chooses fold/call/raise to 3x the bet (${facingList("ip")}). ${spot.ip} facing check-raise chooses fold/call (btn_vs_raise). No further flop raises.${spot.kind !== "srp" ? ` Bets and raises are capped by the ${spot.stackBb}BB stacks, and any wager committing at least two thirds of the remaining stack is an all-in.` : ""} ${later}`;
  return [
    "Create compact flop-only AI-estimated poker policy rules, not GTO, solver, equilibrium, or external chart output. Return one JSON object only. Do not call tools or write files.",
    `Cash 6-max 100BB no ante, ${preflop} flop pot ${spot.potBb}BB, stacks ${spot.stackBb}BB, rake 5% capped at 3BB.`,
    `${spot.ip} (${raiser(spot.ip)}) is in position; ${spot.oop} (${raiser(spot.oop)}) is out of position. ${nodeNames}`,
    "Input summaries below are weighted real two-card combo distributions after excluding flop blockers. Tier values are rounded percentages, in monster/strong/draw/medium/air order. Never infer the opponent's hidden cards during a decision.",
    `Example design flops (no other boards supplied): ${design.join(", ")}. Rules must generalize to unseen textures.`,
    tree,
    "Use tier order monster(two pair+), strong(top pair/overpair), draw(flush/straight draw), medium(other pair), air. Texture is dry/wet/monotone/paired. Rules may override a texture, but every node and tier MUST have one texture=any fallback.",
    `Nodes/actions: ${JSON.stringify(Object.fromEntries(nodes.map(node => [node, NODES[node]])))}. Tiers: ${TIERS.join(", ")}.`,
    `Output exactly {version:1,kind:'ai_estimate_not_gto',rules:[{node,texture,tier,mix},...]}. Mix keys must be exactly the legal actions for that node, integer 0..100, summing to 100. Include the ${nodes.length * 5} mandatory fallback rules and no more than ${nodes.length * 20} overrides; no rationale, code, private opponent cards, or other properties.`,
  ].join("\n");
}

export function runCodex(prompt, { model = resolveModel(), effort = resolveEffort(), timeoutMs = 1800000, onThread = () => {} } = {}) {
  if (!/^[a-z0-9.-]+$/.test(model) || !/^[a-z]+$/.test(effort)) throw new Error("Invalid Codex model or reasoning effort");
  return new Promise((resolve, reject) => {
    const env = { ...process.env }; delete env.OPENAI_API_KEY; delete env.CODEX_API_KEY;
    const bundled = ["/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex", "/Applications/ChatGPT.app/Contents/Resources/codex"].find(path => existsSync(path));
    const child = spawn(bundled ?? "codex", ["app-server", "-c", "mcp_servers={}", "-c", `model_reasoning_effort="${effort}"`],
      { cwd: root, env, stdio: ["pipe", "pipe", "pipe"] });
    let buffer = "", final = "", threadId, done = false, stderr = "";
    const timer = setTimeout(() => fail(new Error("Codex policy generation timed out")), timeoutMs);
    const send = value => child.stdin.write(`${JSON.stringify(value)}\n`);
    function fail(error) { if (done) return; done = true; clearTimeout(timer); child.kill(); reject(error); }
    function finish() {
      if (done) return;
      done = true; clearTimeout(timer); child.kill();
      // Tolerate a fenced reply: the policy is the outermost JSON object.
      const json = final.slice(final.indexOf("{"), final.lastIndexOf("}") + 1);
      try { resolve(JSON.parse(json)); } catch { reject(new Error(`Codex returned invalid JSON: ${stderr.slice(-240)}`)); }
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
          send({ id: 2, method: "thread/start", params: { cwd: root, approvalPolicy: "never", sandbox: "read-only", ephemeral: true, model } });
        }
        if (msg.id === 2) {
          threadId = msg.result?.thread?.id;
          if (!threadId) { fail(new Error("Codex thread failed to start")); return; }
          onThread(msg.result);
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

export async function generate(inputs, { model = resolveModel(), effort = resolveEffort(), generator = runCodex } = {}) {
  const path = artifactPaths(inputs.spot).candidate;
  if (existsSync(path)) return { candidate: loadCandidate(inputs), reused: true };
  const prompt = promptFor(inputs);
  let started = {};
  const policy = validatePolicy(await generator(prompt, { model, effort, onThread: result => { started = result ?? {}; } }), inputs.spot.tree);
  // Record what the app-server reports it used, when it says so; otherwise what was requested.
  if (started.model && started.model !== model) throw new Error(`Codex used ${started.model} instead of ${model}`);
  const usedEffort = started.reasoningEffort ?? effort;
  const candidate = { metadata: { kind: "ai_estimate_not_gto", scope: "12 representative flops; flop only; not published",
    spot: inputs.spot.id, tree: inputs.spot.tree, source_hash: inputs.fingerprint, policy_hash: sha(policy), config_version: config.version,
    model, reasoning_effort: usedEffort, prompt_hash: sha(prompt) }, policy };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(candidate, null, 2)}\n`, { flag: "wx" });
  return { candidate, reused: false };
}

// Turn/river rules for one spot. The flop candidate must exist: the later policy is keyed to it.
export function promptForLater(inputs) {
  const { spot } = inputs;
  const { preflop, design, raiser } = spotContext(inputs);
  const street = name => {
    const bets = openingActions(name).filter(action => action !== "check");
    return `${name}: ${spot.oop} (OOP) acts first with ${name}_oop_first (${openingActions(name).join("/")}); ${spot.ip} (IP) facing it uses ${name}_ip_vs_<size> (fold/call/raise to 3x; facing allin only fold/call), then ${name}_oop_vs_raise (fold/call). After an OOP check, ${spot.ip} uses ${name}_ip_first, ${spot.oop} answers with ${name}_oop_vs_<size>, and ${name}_ip_vs_raise closes. Bets: ${bets.map(bet => bet === "allin" ? "all-in" : `${bet.slice(3)}% pot`).join(", ")}.`;
  };
  const tiers = name => name === "river" ? TIERS.filter(tier => tier !== "draw") : TIERS;
  const fallbacks = STREETS.reduce((sum, name) => sum + streetNodes(name).length * tiers(name).length, 0);
  return [
    "Create compact turn and river AI-estimated poker policy rules, not GTO, solver, equilibrium, or external chart output. Return one JSON object only. Do not call tools or write files.",
    `Cash 6-max 100BB no ante, ${preflop} flop pot ${spot.potBb}BB, stacks ${spot.stackBb}BB, rake 5% capped at 3BB. The flop is played by a separate saved flop policy (bets 33/75/125% pot, one 3x raise); you author only the turn and river.`,
    `${spot.ip} (${raiser(spot.ip)}) is in position; ${spot.oop} (${raiser(spot.oop)}) is out of position.`,
    "Preflop range summaries on example flops (weighted two-card combos; tiers in monster/strong/draw/medium/air %): " + design.join(", ") + ". Ranges narrow on later streets according to earlier actions; never infer the opponent's hidden cards.",
    `Street trees (the same shape on turn and river; one raise per street; any wager committing at least two thirds of the remaining stack becomes all-in): ${street("turn")} ${street("river")}`,
    `Features: tier = the acting player's hand on the current board (monster two pair+, strong top pair/overpair, draw flush/straight draw (turn only), medium other pair, air). texture = what the newest card did: ${RUNOUT_TEXTURES.join("/")} (flush = completes/extends a suit, pair = pairs the board, straight = new 3-to-a-straight, over = new highest card, blank = none). line = the acting player's result on the previous street: ${LINES.join("/")} (aggressor = they made the last called bet/raise, defender = the opponent did, checked = it checked through).`,
    `Nodes/actions: ${JSON.stringify(LATER_NODES)}. River tiers exclude draw.`,
    `Output exactly {version:1,kind:'ai_estimate_not_gto',streets:{turn:{rules:[...]},river:{rules:[...]}}} where each rule is {node,line,texture,tier,mix}; line is 'any' or one of ${LINES.join("/")}, texture is 'any' or one of ${RUNOUT_TEXTURES.join("/")}. Every node x tier MUST have one line='any',texture='any' fallback (${fallbacks} in total); at most 20 other rules per node. Mix keys must be exactly the node's legal actions, integers 0..100 summing to 100. No rationale, code or other properties.`,
    "For every *_first node on each street, add at least 3 overrides keyed by line (aggressor/defender/checked) and at least 3 keyed by texture (e.g. slow down on flush/pair cards, barrel blanks and overcards as the aggressor, probe when the previous street checked through).",
    "OOP and IP play differently: the out-of-position player checks more and leads less; do not copy oop_first into ip_first.",
    "Keep river bluffs proportional to the bet size: among hands that bet, the share of air should be about 20% for 33% pot, 30% for 75%, 36% for 125% and 40% for all-in. Raises must include some bluffs or draws, not only monsters.",
    "The opponent is not a fixed bot; do not exploit an opponent that folds too often.",
  ].join("\n");
}

export async function generateLater(inputs, flopCandidate, { model = resolveModel(), effort = resolveEffort(), generator = runCodex } = {}) {
  const path = artifactPaths(inputs.spot).laterCandidate;
  if (existsSync(path)) return { candidate: loadLaterCandidate(inputs, flopCandidate), reused: true };
  const prompt = promptForLater(inputs);
  let started = {};
  const policy = validateLaterPolicy(await generator(prompt, { model, effort, onThread: result => { started = result ?? {}; } }));
  if (started.model && started.model !== model) throw new Error(`Codex used ${started.model} instead of ${model}`);
  const candidate = { metadata: { kind: "ai_estimate_not_gto", scope: "turn and river; not published",
    spot: inputs.spot.id, source_hash: inputs.fingerprint, flop_policy_hash: flopCandidate.metadata.policy_hash, policy_hash: sha(policy),
    config_version: config.version, model, reasoning_effort: started.reasoningEffort ?? effort, prompt_hash: sha(prompt) }, policy };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(candidate, null, 2)}\n`, { flag: "wx" });
  return { candidate, reused: false };
}

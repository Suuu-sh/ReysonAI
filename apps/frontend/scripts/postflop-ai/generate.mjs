// Explicit, local-only Codex generation of compact AI policy rules.
// Profile candidates are authored in git delivery storage; generation itself never publishes to D1.
// It never silently regenerates an existing candidate.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, constants, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { artifactPaths, boards, config, readArtifact, requireArtifact, root, seatRange } from "./inputs.mjs";
import { LATER_NODES, STREETS, openingActions, streetNodes } from "./later-tree.ts";
import { boardHeight, boardTexture, LINES, parseCards, RUNOUT_TEXTURES, TIERS } from "./model.ts";
import { handTier } from "./hu-hand-tier.ts";
import { NODES, treeNodes, validatePolicy } from "./policy.ts";
import { FLOP_BETS, facingNode, flopBetLabel, raiseDepth } from "./tree.ts";
import { validateLaterPolicy } from "./later-policy.ts";
import { normalizeGenerationOptions } from "./generation-options.mjs";
import { isOpponentMode, matchesCandidateSource, profileArtifactKey, resolveFlopCandidate, resolveLaterCandidate } from "./candidate-source.ts";

// Local Codex model for new candidates: --model, else POSTFLOP_AI_MODEL, else this default.
// Existing candidates are reused as saved (the first BTN/BB pilot was made with gpt-6-sol).
export const DEFAULT_MODEL = "gpt-6-luna";
export const resolveModel = cliModel => cliModel || process.env.POSTFLOP_AI_MODEL || DEFAULT_MODEL;
// Reasoning effort passed as -c model_reasoning_effort: --effort, else POSTFLOP_AI_EFFORT, else the maximum
// the API accepts (none/minimal/low/medium/high/xhigh/max; verified for gpt-6-luna and gpt-6-sol on 2026-09-26).
export const DEFAULT_EFFORT = "max";
export const resolveEffort = cliEffort => cliEffort || process.env.POSTFLOP_AI_EFFORT || DEFAULT_EFFORT;
export const sha = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function loadCandidate(inputs, role) {
  if (isOpponentMode(inputs) && role === undefined) return resolveFlopCandidate(inputs, {
    villain: loadCandidate(inputs, "villain"), exploit: loadCandidate(inputs, "exploit"),
  });
  if (!isOpponentMode(inputs) && role !== undefined) throw new Error("A generation role requires a nonstandard profile");
  const candidate = requireArtifact(inputs.spot, "candidate", isOpponentMode(inputs) ? { profile: inputs.opponentProfile, role } : {});
  if (isOpponentMode(inputs)) {
    assertProfileIdentity(inputs, candidate, role);
    if (candidate.metadata.tree !== inputs.spot.tree) throw new Error("Profile policy identity mismatch: tree");
  }
  if (!matchesCandidateSource(inputs, candidate) || candidate.metadata.config_version !== config.version ||
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
export function loadLaterCandidate(inputs, flopCandidate, role) {
  if (isOpponentMode(inputs) && role === undefined) {
    const flop = resolveFlopCandidate(inputs, flopCandidate);
    return resolveLaterCandidate(inputs, {
      villain: loadLaterCandidate(inputs, flop.profileCandidates.villain, "villain"),
      exploit: loadLaterCandidate(inputs, flop.profileCandidates.exploit, "exploit"),
    }, flop);
  }
  if (!isOpponentMode(inputs) && role !== undefined) throw new Error("A generation role requires a nonstandard profile");
  if (isOpponentMode(inputs)) {
    assertProfileIdentity(inputs, flopCandidate, role);
    if (flopCandidate.metadata.tree !== inputs.spot.tree) throw new Error("Profile policy identity mismatch: flop tree");
    validatePolicy(flopCandidate.policy, inputs.spot.tree);
  }
  const candidate = isOpponentMode(inputs)
    ? requireArtifact(inputs.spot, "laterCandidate", { profile: inputs.opponentProfile, role })
    : readArtifact(inputs.spot, "laterCandidate");
  if (!candidate) return null;
  if (isOpponentMode(inputs)) assertProfileIdentity(inputs, candidate, role);
  if (!matchesCandidateSource(inputs, candidate) ||
      (isOpponentMode(inputs) && (candidate.metadata.config_version !== config.version || flopCandidate.metadata.config_version !== config.version)) ||
      !matchesCandidateSource(inputs, flopCandidate) ||
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
  // Extra boards that show how the two ranges hit high, middle and low flops.
  const heights = ["AsKd7c", "Qh8s3d", "Jc9d4h", "Ts8c6d", "8h5c2d", "7c6d4s", "6s3h2c"].map(text => {
    const cards = parseCards(text, 3);
    return `${text}(${boardHeight(cards)} ${boardTexture(cards)};${spot.ip} ${distribution(spot.ip, cards)};${spot.oop} ${distribution(spot.oop, cards)})`;
  });
  const raiser = seat => !spot.aggressor ? (seat === "SB" ? "limper" : "checked the limp")
    : seat === spot.aggressor ? ({ "3bp": "preflop 3bettor", "4bp": "preflop 4bettor", limp: "preflop last raiser" }[spot.kind] ?? "preflop raiser")
      : "preflop caller";
  const preflop = spot.history
    ? `${spot.history.map(step => `${step.seat} ${step.action}${step.to_size_bb === null ? "" : ` to ${step.to_size_bb}BB`}`).join(", ")}; the other seats fold. Folded participants' contributions remain in the pot as dead chips, but their unknown cards are not removed from either player's range. Heads-up ${spot.kind} pot with a low stack-to-pot ratio: stacks constrain bet sizing and commitment.`
    : {
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
  return { preflop, design, heights, raiser, nodeNames };
}

function standardPromptFor(inputs) {
  const { spot } = inputs;
  const { preflop, design, heights, raiser, nodeNames } = spotContext(inputs);
  const nodes = treeNodes(spot.tree);
  const bets = FLOP_BETS.join("/"), sizes = FLOP_BETS.map(flopBetLabel).join(" / ");
  const facingList = bettor => FLOP_BETS.map(bet => facingNode(bettor, bet)).join(" / ");
  const later = "Turn/river use a separate later-street policy; do not author them.";
  const tree = spot.tree === "oop_leads"
    ? `${spot.oop} acts first and chooses check/${bets} (oop_first; bets are ${sizes} of the pot). Facing that bet, ${spot.ip} chooses fold/call/raise to 3x the bet (${facingList("oop")}); facing the raise ${spot.oop} chooses fold/call/raise (oop_vs_raise); re-raises continue through ip_vs_raise2, oop_vs_raise3 and ip_vs_raise4 (fold/call only). Those re-raise nodes (raise2 and deeper) need no rules: reference mixes are used. After ${spot.oop} checks, ${spot.ip} chooses check/${bets} (btn_first); ${spot.oop} facing that bet chooses fold/call/raise to 3x the bet (${facingList("ip")}); ${spot.ip} facing that check-raise chooses fold/call/raise (btn_vs_raise; deeper re-raise nodes bb_vs_raise2, btn_vs_raise3, bb_vs_raise4 need no rules). Up to 4 raises; bets and raises are capped by the ${spot.stackBb}BB stacks, and any wager committing at least two thirds of the remaining stack is an all-in. ${later}`
    : `${spot.oop} checks first. ${spot.ip} chooses check/${bets} (btn_first; bets are ${sizes} of the pot). ${spot.oop} facing that bet chooses fold/call/raise to 3x the bet (${facingList("ip")}). ${spot.ip} facing check-raise chooses fold/call/raise (btn_vs_raise; deeper re-raise nodes bb_vs_raise2, btn_vs_raise3, bb_vs_raise4 need no rules). Up to 4 raises.${spot.kind !== "srp" ? ` Bets and raises are capped by the ${spot.stackBb}BB stacks, and any wager committing at least two thirds of the remaining stack is an all-in.` : ""} ${later}`;
  return [
    "Create compact flop-only AI-estimated poker policy rules, not GTO, solver, equilibrium, or external chart output. Return one JSON object only. Do not call tools or write files.",
    `Cash 6-max 100BB no ante, ${preflop} flop pot ${spot.potBb}BB, stacks ${spot.stackBb}BB, rake 5% capped at 3BB.`,
    `${spot.ip} (${raiser(spot.ip)}) is in position; ${spot.oop} (${raiser(spot.oop)}) is out of position. ${nodeNames}`,
    "Input summaries below are weighted real two-card combo distributions after excluding flop blockers. Tier values are rounded percentages, in monster/strong/draw/medium/air order. Never infer the opponent's hidden cards during a decision.",
    ...(spot.history ? ["These squeeze/cold-4bet and other multiway-origin histories reach heads-up flops at low SPR. Treat the folded players' dead contributions as part of the pot, but do not remove unknown folded cards from either live range; account for the shallow effective stacks when choosing sizes and commitment.",
      "Paired boards (e.g. KK4, 882, 554) favour the preflop aggressor here: their overpairs and big pairs are far stronger than the caller's range. On every paired shape_height rule for the aggressor's *_first node, bet strong and medium hands often (mostly 33%) instead of slowing down, and the caller must not over-fold its pairs."] : []),
    `Example design flops: ${design.join(", ")}. Boards by height: ${heights.join(", ")}. Users can pick any of the 1,755 flop classes, so rules must generalize to every board.`,
    tree,
    "Use tier order monster(two pair+ made with a private card; a board pair alone counts for nobody, so a pocket pair on a paired board is one pair), strong(top pair/overpair), draw(flush/straight draw), medium(other pair), air. A rule's texture is a shape (dry/wet/monotone/paired), a height by the top card (high = A/K/Q, mid = J/T/9, low = 8 or lower), a shape_height pair such as dry_low or wet_high, or any. The most specific matching rule wins (shape_height, then shape, then height, then any). Every node and tier MUST have one texture=any fallback.",
    `Nodes/actions: ${JSON.stringify(Object.fromEntries(nodes.map(node => [node, NODES[node]])))}. Tiers: ${TIERS.join(", ")}.`,
    "Board height decides range advantage: compare the two ranges on the height boards above. On every *_first node write a shape_height rule for every one of the 12 shape x height pairs (dry/wet/monotone/paired x high/mid/low) for the air, medium and draw tiers (a shape-only rule such as paired would otherwise hide the height), plus height rules for the other tiers: where the bettor's range is weaker on that height (e.g. a preflop raiser on low boards), check more and bet air much less often, so a bet range never carries more air than its size supports; where it is stronger (e.g. the raiser on high boards), bet more often and smaller. Facing nodes may also use heights.",
    "Add texture overrides where the board changes the strategy (e.g. bet smaller and more often on dry boards, check more on monotone and wet boards out of position); the out-of-position player checks and leads less than the in-position player; keep some monsters in checking ranges; raises must include some draws or bluffs, not only monsters; keep bluffs proportional to the bet size. The opponent is not a fixed bot; do not exploit an opponent that folds too often.",
    `Output exactly {version:1,kind:'ai_estimate_not_gto',rules:[{node,texture,tier,mix},...]}. Mix keys must be exactly the legal actions for that node, integer 0..100, summing to 100. Include the ${nodes.length * 5} mandatory fallback rules and no more than ${nodes.length * 20} overrides; no rationale, code, private opponent cards, or other properties.`,
  ].join("\n");
}

const PROFILE_GUIDANCE = {
  nit: {
    villain: "NIT personality: low betting frequency, few bluffs, tight calls, and raises almost exclusively with near-nut hands.",
    exploit: "Counterplay against NIT: bluff more into their excessive folds, but fold readily to their rare raises; avoid paying off their strongly value-heavy aggression.",
  },
  station: {
    villain: "Calling station personality: calls too often and too wide, rarely raises, and seldom bluffs; weak pairs and draws still do not fold easily, and passive continuation dominates.",
    exploit: "Counterplay against calling station: sharply reduce bluffs, value bet larger and thinner, and respect their rare raises.",
  },
  lag: {
    villain: "LAG personality: high betting, raising and bluffing frequencies, loose aggressive continuation, and pressure across streets.",
    exploit: "Counterplay against LAG: call strong hands to induce further aggression, widen bluff-catching, and retain strong hands in checking/calling ranges.",
  },
  maniac: {
    villain: "Maniac personality: extremely frequent overbets, all-ins, raises and bluffs, with very wide aggressive continuation.",
    exploit: "Counterplay against maniac: bluff-catch even wider than against LAG, induce their extreme aggression, and commit stacks with strong hands.",
  },
};

// Also used before artifact lookup/provider invocation. Never author a profile
// using a standard range, a composed role policy, or a mismatched input identity.
function authoringOptions(inputs, options = {}) {
  const selected = normalizeGenerationOptions(options);
  if (selected.profile === "standard") {
    if (inputs.adjusted) throw new Error("Standard policy authoring with adjusted inputs is not enabled");
    if (isOpponentMode(inputs)) throw new Error("Generation profile does not match input profile");
    return selected; // Standard authoring/reuse behavior predates the profile envelope.
  } else if (!inputs.adjusted || inputs.opponentProfile !== selected.profile ||
      inputs.adjusted.opponentProfile !== selected.profile || !["ip", "oop"].includes(inputs.opponentSeat)) {
    throw new Error("Generation profile does not match adjusted profile inputs and opponent seat");
  }
  if (selected.opponentSeat !== undefined && selected.opponentSeat !== inputs.opponentSeat) throw new Error("Generation opponent seat does not match input opponent seat");
  if (!/^[a-f0-9]{64}$/.test(inputs.fingerprint ?? "") || !/^[a-f0-9]{64}$/.test(inputs.structure_hash ?? "") ||
      inputs.config?.version !== config.version) throw new Error("Invalid generation input identity");
  for (const seat of [inputs.spot.ip, inputs.spot.oop]) {
    const rows = inputs.seatRows?.[seat];
    if (!rows?.length || new Set(rows.map(row => row.hand)).size !== rows.length ||
        rows.some(row => !Number.isFinite(row.freq) || row.freq < 0 || row.freq > 100) || !rows.some(row => row.freq > 0)) {
      throw new Error(`Invalid or unreachable generation input range: ${seat}`);
    }
  }
  return selected;
}

function profilePrompt(inputs, selected, baseline) {
  const opponent = inputs.spot[inputs.opponentSeat];
  const hero = inputs.spot[inputs.opponentSeat === "ip" ? "oop" : "ip"];
  const text = baseline
    .replace("The opponent is not a fixed bot; do not exploit an opponent that folds too often.",
      "The selected personality is an explicit behavioral assumption, not a fixed bot or known hidden hand.");
  return [text,
    `Profile: ${selected.profile}; role: ${selected.role}. For the illustrative range summaries, the opponent is ${opponent} (${inputs.opponentSeat.toUpperCase()}) and the counterplayer is ${hero}; these summaries use the actual saved ${selected.profile} villain preflop range for ${opponent}, not the standard range. This illustrative assignment does not limit the role policy to one node side.`,
    PROFILE_GUIDANCE[selected.profile].villain,
    PROFILE_GUIDANCE[selected.profile].exploit,
    selected.role === "villain"
      ? `At EVERY IP and OOP node, author the acting player as this ${selected.profile} personality itself, not an exploitative response to it. The same role file must support the personality occupying either seat; do not fill the other node side with standard or counterplay behavior.`
      : `At EVERY IP and OOP node, author the acting player as deliberate counterplay against an opponent with the known ${selected.profile} personality. The same role file must support the counterplayer occupying either seat; do not fill the other node side with standard or villain behavior.`,
    "These are asymmetric AI-estimated behavioral policies, not equilibrium or GTO. Profile/counterplay instructions explicitly supersede generic balanced bluff proportions and the advice to include bluffs/draws in every raise: NIT/station may legitimately have almost no bluff raises, while LAG/maniac may deliberately overbluff. Keep all legal actions, integer sums, tier/texture/line fallbacks, board-height distinctions, separate OOP/IP play and the stated rare-donk discipline. Do not add metadata or explanation to the policy JSON.",
  ].join("\n");
}

export function promptFor(inputs, options = {}) {
  const selected = normalizeGenerationOptions(options);
  if (selected.profile !== "standard") authoringOptions(inputs, selected);
  const baseline = standardPromptFor(inputs);
  return selected.profile === "standard" ? baseline : profilePrompt(inputs, selected, baseline);
}

export function promptForLater(inputs, options = {}) {
  const selected = normalizeGenerationOptions(options);
  if (selected.profile !== "standard") authoringOptions(inputs, selected);
  const baseline = standardPromptForLater(inputs);
  return selected.profile === "standard" ? baseline : profilePrompt(inputs, selected, baseline);
}

function assertProfileIdentity(inputs, candidate, role) {
  if (!/^[a-f0-9]{64}$/.test(inputs.structure_hash ?? "") || !["villain", "exploit"].includes(role) || !["ip", "oop"].includes(inputs.opponentSeat) ||
      candidate?.profileCandidates || candidate?.metadata?.profile !== inputs.opponentProfile ||
      candidate?.metadata?.role !== role || candidate?.metadata?.spot !== inputs.spot.id ||
      candidate?.metadata?.structure_hash !== inputs.structure_hash) throw new Error("Profile policy identity mismatch");
}

function providerOptions(model, effort) {
  if (typeof model !== "string" || !/^[a-z0-9.-]+$/.test(model) ||
      typeof effort !== "string" || !/^[a-z]+$/.test(effort)) throw new Error("Invalid generation model or reasoning effort");
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
    send({ id: 1, method: "initialize", params: { clientInfo: { name: "reysonai_postflop_ai", title: "ReysonAI postflop AI pilot", version: "0.1.0" }, capabilities: {} } });
  });
}

// Claude Code CLI generation (used when the model id starts with "claude-", e.g. while Codex is rate-limited).
// Runs headless with no tools; the reply's outermost JSON object is the policy.
export function runClaude(prompt, { model, timeoutMs = 1800000, onThread = () => {} } = {}) {
  if (!/^claude-[a-z0-9.-]+$/.test(model)) throw new Error("Invalid Claude model");
  return new Promise((resolve, reject) => {
    const child = spawn("claude", ["-p", "--model", model, "--output-format", "json", "--tools", ""], { cwd: root, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "", stderr = "", done = false;
    const timer = setTimeout(() => { if (!done) { done = true; child.kill(); reject(new Error("Claude policy generation timed out")); } }, timeoutMs);
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr = `${stderr}${chunk}`.slice(-1000); });
    child.on("error", error => { if (!done) { done = true; clearTimeout(timer); reject(error); } });
    child.on("exit", code => {
      if (done) return;
      done = true; clearTimeout(timer);
      if (code !== 0) { reject(new Error(`claude exited (${code}): ${stderr.slice(-240)}`)); return; }
      try {
        const reply = JSON.parse(stdout);
        if (reply.is_error) throw new Error(reply.result);
        onThread({ model });
        const text = String(reply.result ?? "");
        resolve(JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)));
      } catch (error) { reject(new Error(`Claude returned invalid JSON: ${error.message.slice(0, 240)}`)); }
    });
    child.stdin.end(prompt);
  });
}
const generatorFor = model => model.startsWith("claude-") ? runClaude : runCodex;

// A compatible legacy profile candidate is promoted byte-for-byte only after the
// ordinary loaders validate identity/content/linkage. Never overwrite public bytes.
function reuseProfileArtifact(inputs, selected, kind, path, load) {
  const legacy = selected.profile !== "standard"
    ? join(root, ".local/postflop-ai", `${profileArtifactKey(inputs.spot, kind, selected.profile, selected.role)}.json`) : null;
  if (selected.force || (!existsSync(path) && (!legacy || !existsSync(legacy)))) return null;
  const candidate = load();
  if (selected.profile !== "standard" && candidate.metadata.source_hash !== inputs.fingerprint) throw new Error("Profile candidate input fingerprint is stale; use --force to overwrite");
  if (!existsSync(path)) {
    mkdirSync(dirname(path), { recursive: true });
    copyFileSync(legacy, path, constants.COPYFILE_EXCL);
  }
  return { candidate, reused: true };
}

export async function generate(inputs, { model = resolveModel(), effort = resolveEffort(), generator = generatorFor(model), ...options } = {}) {
  const selected = authoringOptions(inputs, options);
  const path = artifactPaths(inputs.spot, selected).candidate;
  const reused = reuseProfileArtifact(inputs, selected, "candidate", path, () => loadCandidate(inputs, selected.role));
  if (reused) return reused;
  providerOptions(model, effort);
  const prompt = promptFor(inputs, selected);
  let started = {};
  const policy = validatePolicy(await generator(prompt, { model, effort, onThread: result => { started = result ?? {}; } }), inputs.spot.tree);
  // Record what the app-server reports it used, when it says so; otherwise what was requested.
  if (started.model && started.model !== model) throw new Error(`Codex used ${started.model} instead of ${model}`);
  const usedEffort = started.reasoningEffort ?? effort;
  const candidate = { metadata: { kind: "ai_estimate_not_gto", scope: "12 representative flops; flop only; not published",
    spot: inputs.spot.id, tree: inputs.spot.tree, source_hash: inputs.fingerprint, structure_hash: inputs.structure_hash, policy_hash: sha(policy), config_version: config.version,
    model, reasoning_effort: usedEffort, prompt_hash: sha(prompt),
    ...(selected.profile !== "standard" ? { profile: selected.profile, role: selected.role, opponent_seat: inputs.opponentSeat } : {}) }, policy };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(candidate, null, 2)}\n`, { flag: selected.force ? "w" : "wx" });
  return { candidate, reused: false };
}

// Turn/river rules for one spot. The flop candidate must exist: the later policy is keyed to it.
function standardPromptForLater(inputs) {
  const { spot } = inputs;
  const { preflop, design, raiser } = spotContext(inputs);
  const street = name => {
    const bets = openingActions(name).filter(action => action !== "check");
    return `${name}: ${spot.oop} (OOP) acts first with ${name}_oop_first (${openingActions(name).join("/")}); ${spot.ip} (IP) facing it uses ${name}_ip_vs_<size> (fold/call/raise to 3x; facing allin only fold/call), then ${name}_oop_vs_raise (fold/call/raise; re-raise nodes *_vs_raise2.. need no rules). After an OOP check, ${spot.ip} uses ${name}_ip_first, ${spot.oop} answers with ${name}_oop_vs_<size>, and ${name}_ip_vs_raise follows a raise. Bets: ${bets.map(bet => bet === "allin" ? "all-in" : `${bet.slice(3)}% pot`).join(", ")}.`;
  };
  const tiers = name => name === "river" ? TIERS.filter(tier => tier !== "draw") : TIERS;
  const fallbacks = STREETS.reduce((sum, name) => sum + streetNodes(name).filter(node => raiseDepth(node) < 2).length * tiers(name).length, 0);
  return [
    "Create compact turn and river AI-estimated poker policy rules, not GTO, solver, equilibrium, or external chart output. Return one JSON object only. Do not call tools or write files.",
    `Cash 6-max 100BB no ante, ${preflop} flop pot ${spot.potBb}BB, stacks ${spot.stackBb}BB, rake 5% capped at 3BB. The flop is played by a separate saved flop policy (bets 33/75/125% pot, up to 4 3x raises); you author only the turn and river.`,
    `${spot.ip} (${raiser(spot.ip)}) is in position; ${spot.oop} (${raiser(spot.oop)}) is out of position.`,
    "Preflop range summaries on example flops (weighted two-card combos; tiers in monster/strong/draw/medium/air %): " + design.join(", ") + ". Ranges narrow on later streets according to earlier actions; never infer the opponent's hidden cards.",
    `Street trees (the same shape on turn and river; one raise per street; any wager committing at least two thirds of the remaining stack becomes all-in): ${street("turn")} ${street("river")}`,
    `Features: tier = the acting player's hand on the current board (monster two pair+ made with a private card, a board pair alone counts for nobody; strong top pair/overpair, draw flush/straight draw (turn only), medium other pair, air). texture = what the newest card did: ${RUNOUT_TEXTURES.join("/")} (flush = completes/extends a suit, pair = pairs the board, straight = new 3-to-a-straight, over = new highest card, blank = none). line = the acting player's result on the previous street: ${LINES.join("/")} (aggressor = they made the last called bet/raise, defender = the opponent did, checked = it checked through).`,
    `Nodes/actions: ${JSON.stringify(LATER_NODES)}. River tiers exclude draw.`,
    `Output exactly {version:1,kind:'ai_estimate_not_gto',streets:{turn:{rules:[...]},river:{rules:[...]}}} where each rule is {node,line,texture,tier,mix}; line is 'any' or one of ${LINES.join("/")}, texture is 'any' or one of ${RUNOUT_TEXTURES.join("/")}. Every node x tier MUST have one line='any',texture='any' fallback (${fallbacks} in total); at most 20 other rules per node. Mix keys must be exactly the node's legal actions, integers 0..100 summing to 100. No rationale, code or other properties.`,
    "For every *_first node on each street, add at least 3 overrides keyed by line (aggressor/defender/checked) and at least 3 keyed by texture (e.g. slow down on flush/pair cards, barrel blanks and overcards as the aggressor, probe when the previous street checked through).",
    "OOP and IP play differently: the out-of-position player checks more and leads less; do not copy oop_first into ip_first.",
    "Donk bets are rare: on turn_oop_first and river_oop_first with line='defender' (OOP called the opponent's bet on the previous street), add a line='defender' rule for EVERY tier, and keep total betting low (monster about 20%, strong/draw about 15%, medium/air at most 5%); the caller mostly checks to the aggressor.",
    "Keep river bluffs proportional to the bet size: among hands that bet, the share of air should be about 20% for 33% pot, 30% for 75%, 36% for 125% and 40% for all-in. Raises must include some bluffs or draws, not only monsters.",
    "The opponent is not a fixed bot; do not exploit an opponent that folds too often.",
  ].join("\n");
}

export async function generateLater(inputs, flopCandidate, { model = resolveModel(), effort = resolveEffort(), generator = generatorFor(model), ...options } = {}) {
  const selected = authoringOptions(inputs, options);
  if (selected.profile !== "standard") {
    assertProfileIdentity(inputs, flopCandidate, selected.role);
    validatePolicy(flopCandidate.policy, inputs.spot.tree);
    if (flopCandidate.metadata.source_hash !== inputs.fingerprint || flopCandidate.metadata.policy_hash !== sha(flopCandidate.policy) ||
        flopCandidate.metadata.config_version !== config.version || flopCandidate.metadata.tree !== inputs.spot.tree) throw new Error("Profile flop candidate input or policy is stale");
  }
  const path = artifactPaths(inputs.spot, selected).laterCandidate;
  const reused = reuseProfileArtifact(inputs, selected, "laterCandidate", path, () => loadLaterCandidate(inputs, flopCandidate, selected.role));
  if (reused) return reused;
  providerOptions(model, effort);
  const prompt = promptForLater(inputs, selected);
  let started = {};
  const policy = validateLaterPolicy(await generator(prompt, { model, effort, onThread: result => { started = result ?? {}; } }));
  if (started.model && started.model !== model) throw new Error(`Codex used ${started.model} instead of ${model}`);
  const candidate = { metadata: { kind: "ai_estimate_not_gto", scope: "turn and river; not published",
    spot: inputs.spot.id, source_hash: inputs.fingerprint, structure_hash: inputs.structure_hash, flop_policy_hash: flopCandidate.metadata.policy_hash, policy_hash: sha(policy),
    config_version: config.version, model, reasoning_effort: started.reasoningEffort ?? effort, prompt_hash: sha(prompt),
    ...(selected.profile !== "standard" ? { profile: selected.profile, role: selected.role, opponent_seat: inputs.opponentSeat } : {}) }, policy };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(candidate, null, 2)}\n`, { flag: selected.force ? "w" : "wx" });
  return { candidate, reused: false };
}

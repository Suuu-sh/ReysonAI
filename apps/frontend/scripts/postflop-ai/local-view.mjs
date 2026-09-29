// Read-only local preview of the audited pilot. Never generates or publishes a policy.
import { boards, comboRange, loadInputs, readArtifact, requireArtifact } from "./inputs.mjs";
import { loadCandidate, loadLaterCandidate, sha } from "./generate.mjs";
import { NODES, nodeRole, policyMix, scaleByPath, treeNodes, validatePolicy } from "./policy.mjs";
import { SIMULATION_VERSION } from "./simulation.mjs";
import { boardTexture, handTier, parseCards, runoutTexture, TIERS } from "./model.mjs";
import { explainCombo } from "./explain.mjs";
import { explainLaterCombo } from "./explain-later.mjs";
import { laterHandEvForHand, laterHandEvResult, loadLaterHandEv } from "./later-hand-ev.mjs";
import { DEFAULT_SPOT_ID } from "./spots.mjs";
import { FLOP_BETS, flopState } from "./tree.mjs";
import { LATER_NODES } from "./later-tree.mjs";
import { laterPolicyMix, validateLaterPolicy } from "./later-policy.mjs";
import { laterDecision, laterStart, replayLater } from "../../src/estimated/postflop-trial.ts";

const cardText = card => "23456789TJQKA"[card >> 2] + "cdhs"[card & 3];

export function buildLocalBoard(boardId, inputs, candidate) {
  const board = boards().find(item => item.id === boardId);
  if (!board) throw new Error("対象の代表フロップがありません。");
  const policy = validatePolicy(candidate.policy, inputs.spot.tree);
  if (candidate.metadata?.source_hash !== inputs.fingerprint || candidate.metadata.policy_hash !== sha(policy)) {
    throw new Error("ローカル候補の入力または方針ハッシュが一致しません。");
  }
  const { spot } = inputs;
  const nodes = Object.fromEntries(treeNodes(spot.tree).map(node => {
    const actions = NODES[node];
    const seat = spot[nodeRole(node)]; // btn_* / ip_* = IP, bb_* / oop_* = OOP
    const rows = inputs.seatRows[seat].map(row => {
      const combos = comboRange([row], "freq", board.cards);
      const total = combos.reduce((sum, item) => sum + item.weight, 0);
      const mix = Object.fromEntries(actions.map(action => [action, total
        ? combos.reduce((sum, item) => sum + item.weight * policyMix(policy, node, item.combo, board.cards)[action], 0) / total / 100
        : 0]));
      const tiers = Object.fromEntries(TIERS.map(tier => [tier, 0]));
      const detail = combos.map(item => {
        const tier = handTier(item.combo, board.cards);
        if (total) tiers[tier] += item.weight / total;
        const itemMix = policyMix(policy, node, item.combo, board.cards);
        return { cards: item.combo.map(cardText).join(""), tier, weight: item.weight,
          mix: Object.fromEntries(actions.map(action => [action, itemMix[action] / 100])) };
      });
      return { hand: row.hand, comboCount: combos.length, reachable: total > 0, mix, tiers, combos: detail };
    });
    return [node, { seat, actions, rows }];
  }));
  return { kind: "ai_estimate_not_gto", spot: spot.id, tree: spot.tree, ip: spot.ip, oop: spot.oop, pot_bb: spot.potBb, stack_bb: spot.stackBb, board: board.id, split: board.split, texture: boardTexture(board.cards),
    source_hash: inputs.fingerprint, policy_hash: candidate.metadata.policy_hash, nodes };
}

export function explainLocalCombo(params, inputs, candidate) {
  const board = boards().find(item => item.id === params.get("board"));
  if (!board) throw new Error("対象の代表フロップがありません。");
  const cards = params.get("cards") ?? "";
  if (!/^([2-9TJQKA][cdhs]){2}$/.test(cards)) throw new Error("カードの形式が正しくありません。");
  const prev = FLOP_BETS.includes(params.get("prev")) ? params.get("prev") : FLOP_BETS[0];
  return { spot: inputs.spot.id, board: board.id, ...explainCombo({ boardCards: board.cards, node: params.get("node"), cards, prev,
    inputs, policy: validatePolicy(candidate.policy, inputs.spot.tree) }) };
}

const cardKey = cards => [...cards].sort((a, b) => a - b).join(",");

function policyForLater(inputs, candidate, laterCandidate) {
  if (!laterCandidate) {
    const error = new Error("ターン・リバーのAI方針がありません。");
    error.code = "LATER_POLICY_MISSING";
    throw error;
  }
  const flopPolicy = validatePolicy(candidate?.policy, inputs.spot.tree);
  if (candidate?.metadata?.source_hash !== inputs.fingerprint ||
      candidate.metadata.policy_hash !== sha(flopPolicy) ||
      laterCandidate.metadata?.source_hash !== inputs.fingerprint ||
      laterCandidate.metadata?.flop_policy_hash !== candidate.metadata.policy_hash) {
    throw new Error("Later AI policy source or flop policy is stale");
  }
  const laterPolicy = validateLaterPolicy(laterCandidate.policy);
  if (laterCandidate.metadata.policy_hash !== sha(laterPolicy)) throw new Error("Saved later AI policy hash does not match its content");
  return { flopPolicy, laterPolicy };
}

const lineFor = (previousAggressor, role) => previousAggressor === null
  ? "checked" : previousAggressor === role ? "aggressor" : "defender";

function scaleLaterPath(items, role, steps, policy, board, previousAggressor) {
  return steps.filter(step => step.role === role).reduce((range, step) => {
    const line = lineFor(previousAggressor, role);
    return range.map(item => ({ ...item,
      weight: item.weight * laterPolicyMix(policy, step.node, item.combo, board, line)[step.action] / 100,
    }));
  }, items);
}

function representativeBoard(value) {
  if (typeof value !== "string" || !/^([2-9TJQKA][cdhs]){3}$/.test(value)) throw new Error("フロップの形式が正しくありません。");
  const cards = parseCards(value, 3);
  const match = boards().find(board => cardKey(board.cards) === cardKey(cards));
  if (!match) throw new Error("対象の代表フロップがありません。");
  return match;
}

function singleCard(value, label, used) {
  if (!value) return null;
  if (typeof value !== "string" || !/^[2-9TJQKA][cdhs]$/.test(value)) throw new Error(`${label}の形式が正しくありません。`);
  const card = parseCards(value, 1)[0];
  if (used.has(card)) throw new Error("盤面カードが重複しています。");
  used.add(card);
  return card;
}

function parseActions(value) {
  if (value == null || value === "") return [];
  if (typeof value !== "string") throw new Error("アクション履歴の形式が正しくありません。");
  return value.split(",");
}

function mixRows({ actor, role, board, node, line, inputs, flopPolicy, laterPolicy, flopSteps, turnSteps, riverSteps,
  turnBoard, riverBoard, turnPreviousAggressor, riverPreviousAggressor }) {
  const actions = LATER_NODES[node];
  const rows = inputs.seatRows[actor];
  if (!rows) throw new Error(`Missing saved range for ${actor}`);
  return rows.map(row => {
    let combos = comboRange([row], "freq", board);
    combos = scaleByPath(combos, role, flopSteps, flopPolicy, board.slice(0, 3));
    if (turnSteps) combos = scaleLaterPath(combos, role, turnSteps, laterPolicy, turnBoard, turnPreviousAggressor);
    if (riverSteps) combos = scaleLaterPath(combos, role, riverSteps, laterPolicy, riverBoard, riverPreviousAggressor);
    const totals = Object.fromEntries(actions.map(action => [action, 0]));
    const tiers = Object.fromEntries(TIERS.map(tier => [tier, 0]));
    let weightTotal = 0;
    for (const item of combos) {
      if (!item.weight) continue;
      const rawTier = handTier(item.combo, board);
      const tier = rawTier === "draw" && node.startsWith("river_") ? "medium" : rawTier;
      const mix = laterPolicyMix(laterPolicy, node, item.combo, board, line);
      weightTotal += item.weight;
      tiers[tier] += item.weight;
      for (const action of actions) totals[action] += item.weight * mix[action] / 100;
    }
    const tier = Object.entries(tiers).reduce((best, item) => item[1] > best[1] ? item : best, ["air", -1])[0];
    const averaged = Object.fromEntries(actions.map(action => [action, weightTotal ? totals[action] / weightTotal : 0]));
    const mixTotal = Object.values(averaged).reduce((sum, value) => sum + value, 0);
    return { hand: row.hand, reachable: weightTotal > 0, tier,
      mix: Object.fromEntries(actions.map(action => [action, mixTotal ? averaged[action] / mixTotal : 0])) };
  });
}

// Read-only projection of one saved turn/river decision. Only the acting player's own
// earlier actions narrow its combos; opponent actions are deliberately ignored as range
// weights and their hidden cards are never inspected.
export function buildLaterView({ flop, flopActions = "", turn = "", turnActions = "", river = "", riverActions = "" }, inputs, candidate, laterCandidate) {
  const { flopPolicy, laterPolicy } = policyForLater(inputs, candidate, laterCandidate);
  const flopBoard = representativeBoard(flop);
  const used = new Set(flopBoard.cards);
  const turnCard = singleCard(turn, "ターン", used);
  const riverCard = singleCard(river, "リバー", used);
  const flopPath = parseActions(flopActions);
  const turnPath = parseActions(turnActions);
  const riverPath = parseActions(riverActions);
  const start = laterStart(flopPath, inputs.spot);
  if (!start) throw new Error("フロップのアクションが後続ストリートへ進める状態ではありません。");
  if (turnCard === null) throw new Error("ターンカードを選択してください。");

  const turnBoard = [...flopBoard.cards, turnCard];
  const turnReplay = replayLater("turn", turnPath, start, inputs.spot);
  let street = "turn", currentBoard = turnBoard;
  let riverBoard = null, turnSteps = turnReplay.state.steps, riverSteps = null, riverPreviousAggressor = null;
  let decision = laterDecision("turn", turnPath, start, inputs.spot);
  if (!decision.node) {
    if (["fold", "raise-fold"].includes(turnReplay.end?.type) || turnReplay.stacks.ip <= 0 || turnReplay.stacks.oop <= 0) {
      throw new Error("このアクションではショーダウンまで進んでおり、次の判断はありません。");
    }
    if (riverCard === null) throw new Error("リバーカードを選択してください。");
    street = "river";
    const riverStart = { pot: turnReplay.pot, stacks: turnReplay.stacks, lastAggressor: turnReplay.lastAggressor };
    currentBoard = [...turnBoard, riverCard];
    riverBoard = currentBoard;
    riverPreviousAggressor = turnReplay.lastAggressor;
    const riverReplay = replayLater("river", riverPath, riverStart, inputs.spot);
    riverSteps = riverReplay.state.steps;
    decision = laterDecision("river", riverPath, riverStart, inputs.spot);
    if (!decision.node) throw new Error("リバーの判断は終了しています。");
  }
  const flopSteps = flopState(inputs.spot.tree, flopPath).steps;
  const role = decision.role;
  const actor = inputs.spot[role];
  const rows = mixRows({ actor, role, board: currentBoard, node: decision.node, line: decision.line,
    inputs, flopPolicy, laterPolicy, flopSteps, turnSteps, riverSteps, turnBoard, riverBoard,
    turnPreviousAggressor: start.lastAggressor, riverPreviousAggressor });
  return { kind: "ai_estimate_not_gto", street, node: decision.node, actor, line: decision.line,
    texture: runoutTexture(currentBoard), pot_bb: decision.potBb, rows };
}

export const LOCAL_POSTFLOP_ROUTES = ["/local-postflop-spot", "/local-postflop", "/local-postflop-explain", "/local-postflop-later",
  "/local-postflop-later-explain", "/local-postflop-later-hand-ev"];

// The response of one read-only postflop route as { status, body }. Shared by the Vite
// middleware below and the edge worker, which serves the same bodies from D1 artifacts.
export function postflopResponse(pathname, params) {
  try {
    const inputs = loadInputs(params.get("spot") || DEFAULT_SPOT_ID);
    const candidate = loadCandidate(inputs);
    const laterRoute = ["/local-postflop-later", "/local-postflop-later-explain", "/local-postflop-later-hand-ev"].includes(pathname);
    const laterCandidate = laterRoute ? loadLaterCandidate(inputs, candidate) : null;
    if (laterRoute && !laterCandidate) {
      const error = new Error("ターン・リバーのAI方針がありません。");
      error.code = "LATER_POLICY_MISSING";
      throw error;
    }
    const report = requireArtifact(inputs.spot, "report");
    if (report.source_hash !== inputs.fingerprint || report.policy_hash !== candidate.metadata.policy_hash ||
        report.simulation_version !== SIMULATION_VERSION || report.spot !== inputs.spot.id || report.results?.length !== 72) {
      throw new Error("候補に対応する最新の監査レポートがありません。");
    }
    if (pathname === "/local-postflop-spot") {
      // Same body as the worker's /v1/postflop/spot: the artifacts the browser computes from.
      return { status: 200, body: { kind: "ai_estimate_not_gto", spot: inputs.spot, candidate,
        laterCandidate: readArtifact(inputs.spot, "laterCandidate"), report } };
    }
    if (pathname === "/local-postflop-later-hand-ev" && !params.has("key")) {
      // On-demand EV of one hand at the current turn/river decision (deterministic per input).
      const hand = params.get("hand");
      if (!hand || !params.get("flop") || !params.get("turn")) return { status: 400, body: { error: "flop・turn・hand が必要です。" } };
      const actions = name => (params.get(name) ?? "").split(",").filter(Boolean);
      const result = laterHandEvForHand({ flop: params.get("flop"), flopActions: actions("flopActions"), turn: params.get("turn"),
        turnActions: actions("turnActions"), river: params.get("river") || null, riverActions: actions("riverActions"),
        hand, inputs, flopPolicy: candidate.policy, laterPolicy: laterCandidate.policy });
      return { status: 200, body: { spot: inputs.spot.id, hand, kind: "ai_estimate_not_gto", ...result } };
    }
    if (pathname === "/local-postflop-later-hand-ev") {
      const ev = loadLaterHandEv(inputs, candidate, laterCandidate);
      if (!ev) return { status: 404, body: { error: "ターン・リバーのハンド別EVが未計算か、方針と一致しません。" } };
      const key = params.get("key");
      if (!key) return { status: 400, body: { error: "EV場面の key が必要です。" } };
      const result = laterHandEvResult(ev, key, params.get("hand"));
      if (!result) return { status: 404, body: { error: "この場面のEVはありません。" } };
      return { status: 200, body: { spot: inputs.spot.id, ...result } };
    }
    let data;
    if (pathname === "/local-postflop-explain") data = explainLocalCombo(params, inputs, candidate);
    else if (pathname === "/local-postflop-later-explain") data = { spot: inputs.spot.id, ...explainLaterCombo({
      flop: params.get("flop"), flopActions: params.get("flopActions") ?? "",
      turn: params.get("turn"), turnActions: params.get("turnActions") ?? "",
      river: params.get("river") ?? "", riverActions: params.get("riverActions") ?? "",
      cards: params.get("cards"), inputs, flopPolicy: candidate.policy, laterPolicy: laterCandidate.policy,
    }) };
    else if (pathname === "/local-postflop-later") {
      data = buildLaterView({
        flop: params.get("flop"), flopActions: params.get("flopActions") ?? "",
        turn: params.get("turn") ?? "", turnActions: params.get("turnActions") ?? "",
        river: params.get("river") ?? "", riverActions: params.get("riverActions") ?? "",
      }, inputs, candidate, laterCandidate);
    } else data = buildLocalBoard(params.get("board"), inputs, candidate);
    return { status: 200, body: data };
  } catch (error) {
    const missingLaterPolicy = error.code === "LATER_POLICY_MISSING";
    return { status: error.code === "ENOENT" || missingLaterPolicy ? 404 : 409, body: { error: missingLaterPolicy ? error.message : error.code === "ENOENT"
      ? "ローカルAI推定候補または監査レポートがありません。CLIで明示生成・監査してください。" : error.message } };
  }
}

export function localPostflopMiddleware(req, res, next) {
  const url = new URL(req.url, "http://localhost");
  if (!LOCAL_POSTFLOP_ROUTES.includes(url.pathname)) { next(); return; }
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") { res.writeHead(405).end(JSON.stringify({ error: "読み取り専用です。" })); return; }
  const host = req.headers.host?.split(":")[0];
  const origin = req.headers.origin;
  if (!["127.0.0.1", "localhost"].includes(host) ||
      origin && !["http://127.0.0.1:5173", "http://localhost:5173"].includes(origin)) {
    res.writeHead(403).end(JSON.stringify({ error: "ローカル環境でのみ利用できます。" })); return;
  }
  const { status, body } = postflopResponse(url.pathname, url.searchParams);
  res.writeHead(status).end(JSON.stringify(body));
}

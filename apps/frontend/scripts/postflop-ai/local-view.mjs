// Read-only local preview of the audited pilot. Never generates or publishes a policy.
import { loadInputs, readArtifact, requireArtifact } from "./inputs.mjs";
import { loadCandidate, loadLaterCandidate } from "./generate.mjs";
import { validatePolicy } from "./policy.ts";
import { SIMULATION_VERSION } from "./simulation.mjs";
import { boardTexture, parseCards, parseFlopBoard, runoutTexture } from "./model.ts";
import { flopBetTable, flopUiFacts } from "./flop-ui-facts.ts";
import { explainLaterCombo, explainLaterCombos } from "./explain-later.ts";
import { DEFAULT_SPOT_ID } from "./spots.ts";
import { FLOP_BETS, flopState } from "./tree.ts";
import { laterDecision, laterStart, replayLater } from "../../src/estimated/postflop-trial.ts";
import { flopNodes, laterMixRows } from "./views.ts";
import { isOpponentMode, resolveFlopCandidate, resolveLaterCandidate } from "./candidate-source.ts";

const adjustment = inputs => inputs.adjusted ? { adjusted: inputs.adjusted, structure_hash: inputs.structure_hash } : {};

export function buildLocalBoard(boardId, inputs, candidate) {
  const board = parseFlopBoard(boardId);
  candidate = resolveFlopCandidate(inputs, candidate);
  const policy = candidate.policy;
  const { spot } = inputs;
  const nodes = flopNodes(inputs, policy, board.cards);
  return { kind: "ai_estimate_not_gto", spot: spot.id, tree: spot.tree, ip: spot.ip, oop: spot.oop, pot_bb: spot.potBb, stack_bb: spot.stackBb, board: board.id, split: board.split, texture: boardTexture(board.cards),
    source_hash: inputs.fingerprint, policy_hash: candidate.metadata.policy_hash, nodes, ...adjustment(inputs) };
}

export function explainLocalCombo(params, inputs, candidate) {
  candidate = resolveFlopCandidate(inputs, candidate);
  const board = parseFlopBoard(params.get("board"));
  const prev = FLOP_BETS.includes(params.get("prev")) ? params.get("prev") : FLOP_BETS[0];
  const options = { boardCards: board.cards, node: params.get("node"), prev,
    inputs, policy: validatePolicy(candidate.policy, inputs.spot.tree) };
  let explanation;
  if (params.has("combos")) {
    let combos;
    try { combos = JSON.parse(params.get("combos")); } catch { throw new Error("ハンドクラスのコンボ形式が正しくありません。"); }
    if (!Array.isArray(combos) || !combos.length || combos.some(item => typeof item?.cards !== "string" ||
        !/^([2-9TJQKA][cdhs]){2}$/.test(item.cards) || !Number.isFinite(item.weight) || item.weight <= 0)) {
      throw new Error("ハンドクラスのコンボ形式が正しくありません。");
    }
    explanation = { ...flopUiFacts({ ...options, combos }), ...flopBetTable({ ...options, combos }) };
  } else {
    const cards = params.get("cards") ?? "";
    if (!/^([2-9TJQKA][cdhs]){2}$/.test(cards)) throw new Error("カードの形式が正しくありません。");
    explanation = { ...flopUiFacts({ ...options, cards }), ...flopBetTable({ ...options, cards }) };
  }
  return { spot: inputs.spot.id, board: board.id, ...explanation, ...adjustment(inputs) };
}

function policyForLater(inputs, candidate, laterCandidate) {
  const flop = resolveFlopCandidate(inputs, candidate);
  const later = resolveLaterCandidate(inputs, laterCandidate, flop);
  return { flopPolicy: flop.policy, laterPolicy: later.policy };
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

// Read-only projection of one saved turn/river decision. Only the acting player's own
// earlier actions narrow its combos; opponent actions are deliberately ignored as range
// weights and their hidden cards are never inspected.
export function buildLaterView({ flop, flopActions = "", turn = "", turnActions = "", river = "", riverActions = "" }, inputs, candidate, laterCandidate) {
  const { flopPolicy, laterPolicy } = policyForLater(inputs, candidate, laterCandidate);
  const flopBoard = parseFlopBoard(flop);
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
  const rows = laterMixRows({ actor, role, board: currentBoard, node: decision.node, line: decision.line,
    inputs, flopPolicy, laterPolicy, flopSteps, turnSteps, riverSteps, turnBoard, riverBoard,
    turnPreviousAggressor: start.lastAggressor, riverPreviousAggressor,
    paths: { flop: flopPath, turn: turnPath, river: riverPath } });
  return { kind: "ai_estimate_not_gto", street, node: decision.node, actor, line: decision.line,
    texture: runoutTexture(currentBoard), pot_bb: decision.potBb, rows, ...adjustment(inputs) };
}

export const LOCAL_POSTFLOP_ROUTES = ["/local-postflop-spot", "/local-postflop", "/local-postflop-explain", "/local-postflop-later",
  "/local-postflop-later-explain"];

// The response of one read-only postflop route as { status, body }. Shared by the Vite
// middleware below and the edge worker, which serves the same bodies from D1 artifacts.
export function postflopResponse(pathname, params) {
  try {
    const options = {};
    if (params.has("tableProfile")) {
      const profile = JSON.parse(params.get("tableProfile"));
      if (!profile || typeof profile !== "object" || Array.isArray(profile)) throw new Error("tableProfile must be an object");
      options.tableProfile = profile;
    }
    if (params.has("opponentProfile")) options.opponentProfile = params.get("opponentProfile");
    if (params.has("opponentSeat")) options.opponentSeat = params.get("opponentSeat");
    const inputs = loadInputs(params.get("spot") || DEFAULT_SPOT_ID, options);
    const candidate = loadCandidate(inputs);
    const laterRoute = ["/local-postflop-later", "/local-postflop-later-explain"].includes(pathname);
    const laterCandidate = laterRoute ? loadLaterCandidate(inputs, candidate) : null;
    if (laterRoute && !laterCandidate) {
      const error = new Error("ターン・リバーのAI方針がありません。");
      error.code = "LATER_POLICY_MISSING";
      throw error;
    }
    const report = isOpponentMode(inputs) ? null : requireArtifact(inputs.spot, "report");
    if (report && (report.source_hash !== (inputs.baselineFingerprint ?? inputs.fingerprint) || report.policy_hash !== candidate.metadata.policy_hash ||
        report.simulation_version !== SIMULATION_VERSION || report.spot !== inputs.spot.id || report.results?.length !== 72)) {
      throw new Error("候補に対応する最新の監査レポートがありません。");
    }
    if (pathname === "/local-postflop-spot") {
      let optionalLater, laterPolicyError;
      try {
        optionalLater = isOpponentMode(inputs) ? loadLaterCandidate(inputs, candidate) : readArtifact(inputs.spot, "laterCandidate");
      } catch (error) {
        if (error.code !== "PROFILE_POLICY_MISSING") throw error;
        // An absent turn/river role must not prevent an available flop pair from
        // being read. Later calculations still fail closed with this same code.
        optionalLater = null;
        laterPolicyError = { error: error.message, code: error.code, state: "not_generated" };
      }
      // Same body as the worker's /v1/postflop/spot: the artifacts the browser computes from.
      return { status: 200, body: { kind: "ai_estimate_not_gto", spot: inputs.spot, candidate,
        laterCandidate: optionalLater, report, ...(laterPolicyError ? { laterPolicyError } : {}),
        ...adjustment(inputs), ...(inputs.adjusted ? { audit_scope: isOpponentMode(inputs) ? "structure_only_unpublished" : "standard_saved_ranges" } : {}) } };
    }
    let data;
    if (pathname === "/local-postflop-explain") data = explainLocalCombo(params, inputs, candidate);
    else if (pathname === "/local-postflop-later-explain") {
      const options = { flop: params.get("flop"), flopActions: params.get("flopActions") ?? "",
        turn: params.get("turn"), turnActions: params.get("turnActions") ?? "",
        river: params.get("river") ?? "", riverActions: params.get("riverActions") ?? "",
        inputs, flopPolicy: candidate.policy, laterPolicy: laterCandidate.policy };
      let explanation;
      if (params.has("combos")) {
        let combos;
        try { combos = JSON.parse(params.get("combos")); } catch { throw new Error("ハンドクラスのコンボ形式が正しくありません。"); }
        if (!Array.isArray(combos) || !combos.length || combos.some(item => typeof item?.cards !== "string" ||
            !/^([2-9TJQKA][cdhs]){2}$/.test(item.cards) || !Number.isFinite(item.weight) || item.weight <= 0)) {
          throw new Error("ハンドクラスのコンボ形式が正しくありません。");
        }
        explanation = explainLaterCombos({ ...options, combos });
      } else explanation = explainLaterCombo({ ...options, cards: params.get("cards"), });
      data = { spot: inputs.spot.id, ...explanation, ...adjustment(inputs) };
    }
    else if (pathname === "/local-postflop-later") {
      data = buildLaterView({
        flop: params.get("flop"), flopActions: params.get("flopActions") ?? "",
        turn: params.get("turn") ?? "", turnActions: params.get("turnActions") ?? "",
        river: params.get("river") ?? "", riverActions: params.get("riverActions") ?? "",
      }, inputs, candidate, laterCandidate);
    } else data = buildLocalBoard(params.get("board"), inputs, candidate);
    return { status: 200, body: data };
  } catch (error) {
    if (error.code === "PROFILE_POLICY_MISSING") return { status: 404, body: { error: error.message, code: error.code, state: "not_generated" } };
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

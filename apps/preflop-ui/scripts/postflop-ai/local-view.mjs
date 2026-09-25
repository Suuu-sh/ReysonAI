// Read-only local preview of the audited pilot. Never generates or publishes a policy.
import { readFileSync } from "node:fs";
import { boards, comboRange, loadInputs } from "./inputs.mjs";
import { loadCandidate, reportPath, sha } from "./generate.mjs";
import { NODES, policyMix, validatePolicy } from "./policy.mjs";
import { SIMULATION_VERSION } from "./simulation.mjs";

export function buildLocalBoard(boardId, inputs, candidate) {
  const board = boards().find(item => item.id === boardId);
  if (!board) throw new Error("対象の代表フロップがありません。");
  const policy = validatePolicy(candidate.policy);
  if (candidate.metadata?.source_hash !== inputs.fingerprint || candidate.metadata.policy_hash !== sha(policy)) {
    throw new Error("ローカル候補の入力または方針ハッシュが一致しません。");
  }
  const nodes = Object.fromEntries(Object.entries(NODES).map(([node, actions]) => {
    const seat = node.startsWith("btn") ? "BTN" : "BB";
    const source = seat === "BTN" ? inputs.opening.hands : inputs.response.hands;
    const sourceAction = seat === "BTN" ? "open" : "call";
    const rows = source.map(row => {
      const combos = comboRange([row], sourceAction, board.cards);
      const total = combos.reduce((sum, item) => sum + item.weight, 0);
      const mix = Object.fromEntries(actions.map(action => [action, total
        ? combos.reduce((sum, item) => sum + item.weight * policyMix(policy, node, item.combo, board.cards)[action], 0) / total / 100
        : 0]));
      return { hand: row.hand, comboCount: combos.length, reachable: total > 0, mix };
    });
    return [node, { seat, actions, rows }];
  }));
  return { kind: "ai_estimate_not_gto", board: board.id, split: board.split,
    source_hash: inputs.fingerprint, policy_hash: candidate.metadata.policy_hash, nodes };
}

export function localPostflopMiddleware(req, res, next) {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname !== "/local-postflop") { next(); return; }
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") { res.writeHead(405).end(JSON.stringify({ error: "読み取り専用です。" })); return; }
  const host = req.headers.host?.split(":")[0];
  const origin = req.headers.origin;
  if (!["127.0.0.1", "localhost"].includes(host) ||
      origin && !["http://127.0.0.1:5173", "http://localhost:5173"].includes(origin)) {
    res.writeHead(403).end(JSON.stringify({ error: "ローカル環境でのみ利用できます。" })); return;
  }
  try {
    const inputs = loadInputs();
    const candidate = loadCandidate(inputs);
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    if (report.source_hash !== inputs.fingerprint || report.policy_hash !== candidate.metadata.policy_hash ||
        report.simulation_version !== SIMULATION_VERSION || report.results?.length !== 72) {
      throw new Error("候補に対応する最新の監査レポートがありません。");
    }
    const data = buildLocalBoard(url.searchParams.get("board"), inputs, candidate);
    res.writeHead(200).end(JSON.stringify(data));
  } catch (error) {
    res.writeHead(error.code === "ENOENT" ? 404 : 409).end(JSON.stringify({ error: error.code === "ENOENT"
      ? "ローカルAI推定候補または監査レポートがありません。CLIで明示生成・監査してください。" : error.message }));
  }
}

import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { existsSync } from "node:fs";
import type { spawn } from "node:child_process";
import { createLunaResearchProvider } from "../scripts/research/aiv2-luna-session.ts";
function fakeTransport({ mismatch = false, mismatchEffort = false, hang = false, failure = false, auth = false, reroute = false, badJson = false, tool = false } = {}) {
  const sent: any[] = [], processes: any[] = []; let threads = 0, turns = 0, active = 0, maxActive = 0;
  const fake = ((_command: string, args: string[], options: any) => {
    const child: any = new EventEmitter(); child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
    processes.push({ child, args, options });
    child.kill = () => { if (!child.killed) { child.killed = true; queueMicrotask(() => child.emit("exit", 0)); } };
    const emit = (msg: any) => { if (!child.killed) child.stdout.write(JSON.stringify(msg) + "\n"); };
    child.stdin.on("data", (data: Buffer) => {
      for (const line of data.toString().trim().split("\n")) {
        const msg = JSON.parse(line); sent.push(msg);
        if (msg.method === "initialize") queueMicrotask(() => emit({ id: msg.id, result: {} }));
        if (msg.method === "thread/start") queueMicrotask(() => emit({ id: msg.id, result: { thread: { id: `thread-${++threads}` }, model: mismatch ? "wrong" : "gpt-6-luna", reasoningEffort: mismatchEffort ? "high" : "medium" } }));
        if (msg.method === "turn/start") {
          const turnId = `turn-${++turns}`, threadId = msg.params.threadId; active++; maxActive = Math.max(active, maxActive);
          queueMicrotask(() => {
            emit({ id: msg.id, result: { turn: { id: turnId } } });
            if (hang) return;
            setTimeout(() => {
              active--;
              if (auth) { emit({ method: "turn/completed", params: { threadId, turn: { id: turnId, status: "failed", error: { message: "authentication required secret=not-for-logs" } } } }); return; }
              if (failure) { emit({ method: "turn/completed", params: { threadId, turn: { id: turnId, status: "failed", error: { message: "quota exceeded secret=not-for-logs" } } } }); return; }
              if (reroute) { emit({ method: "model/rerouted", params: { threadId, turnId, toModel: "wrong" } }); return; }
              if (tool) { emit({ method: "item/started", params: { threadId, turnId, item: { type: "commandExecution" } } }); return; }
              const text = badJson && turns === 1 ? "invalid" : JSON.stringify({ threadId, turnId });
              emit({ method: "item/completed", params: { threadId: "other-thread", turnId, item: { id: "bad", type: "agentMessage", text: "bad" } } });
              emit({ method: "item/completed", params: { threadId, turnId: "old-turn", item: { id: "bad2", type: "agentMessage", text: "bad" } } });
              emit({ method: "item/completed", params: { threadId, turnId, item: { id: "answer", type: "agentMessage", text } } });
              emit({ method: "thread/tokenUsage/updated", params: { threadId, turnId, tokenUsage: { last: { inputTokens: 10, cachedInputTokens: 4, outputTokens: 2 }, total: { inputTokens: 10 * turns, outputTokens: 2 * turns } } } });
              emit({ method: "turn/completed", params: { threadId, turn: { id: turnId, status: "completed", durationMs: 3 } } });
            }, 3);
          });
        }
      }
    }); return child;
  }) as unknown as typeof spawn;
  return { fake, sent, processes, maxActive: () => maxActive };
}
test("research requests and attests Luna/medium with isolated, key-free transport and metrics", async () => {
  const t = fakeTransport(), metrics: any[] = [], attestations: any[] = [];
  const p = createLunaResearchProvider({ spawnProcess: t.fake, onMetric: m => metrics.push(m) });
  try {
    await p.withSession(s => s.run("research scene", { model: "gpt-6-luna", effort: "medium", outputSchema: { type: "object" }, onThread: value => attestations.push(value) }));
    const thread = t.sent.find(m => m.method === "thread/start").params;
    const turn = t.sent.find(m => m.method === "turn/start").params;
    assert.equal(thread.model, "gpt-6-luna"); assert.equal(thread.config.model_reasoning_effort, "medium");
    assert.equal(turn.model, "gpt-6-luna"); assert.equal(turn.effort, "medium");
    assert.deepEqual(turn.outputSchema, { type: "object" });
    assert.deepEqual(attestations, [{ model: "gpt-6-luna", reasoningEffort: "medium", thread: { id: "thread-1" } }]);
    const metric = metrics[0];
    assert.equal(metric.confirmedModel, "gpt-6-luna"); assert.equal(metric.confirmedEffort, "medium");
    assert.equal(metric.threadId, "thread-1"); assert.equal(metric.turnId, "turn-1");
    assert.equal(metric.tokenUsage.last.inputTokens, 10); assert.equal(metric.turnDurationMs, 3);
    assert.ok(metric.elapsedMs >= 0 && metric.queueMs >= 0); assert.equal(metric.status, "completed");
    const proc = t.processes[0];
    assert.ok(!("OPENAI_API_KEY" in proc.options.env) && !("CODEX_API_KEY" in proc.options.env));
    assert.ok(proc.options.cwd.includes("reysonai-luna-research-data-")); assert.ok(!proc.options.cwd.includes("/Projects/"));
    assert.equal(thread.approvalPolicy, "never"); assert.equal(thread.sandbox, "read-only"); assert.equal(thread.ephemeral, true);
    assert.equal(thread.config.project_doc_max_bytes, 0); assert.ok(proc.args.includes("mcp_servers={}"));
  } finally { await p.drain(); }
  assert.ok(!existsSync(t.processes[0].options.cwd));
});
test("wrong requested or confirmed model/effort rejects before any turn", async () => {
  for (const { options, config } of [
    { options: { model: "gpt-6.1-sol" }, config: {} },
    { options: { effort: "high" }, config: {} },
    { options: undefined, config: { mismatch: true } },
    { options: undefined, config: { mismatchEffort: true } },
  ]) {
    const t = fakeTransport(config), p = createLunaResearchProvider({ spawnProcess: t.fake });
    try {
      await assert.rejects(p.withSession(s => s.run("research", options)), { code: "model_or_effort_mismatch" });
      assert.equal(t.sent.filter(m => m.method === "turn/start").length, 0);
    } finally { p.close(); }
  }
});
test("invalid JSON allows an explicit correction in the same thread without automatic replay", async () => {
  const t = fakeTransport({ badJson: true }), metrics: any[] = [];
  const p = createLunaResearchProvider({ spawnProcess: t.fake, onMetric: m => metrics.push(m) });
  try {
    await p.withSession(async s => {
      await assert.rejects(s.run("first"), { code: "invalid_json" });
      assert.equal(t.sent.filter(m => m.method === "turn/start").length, 1);
      await s.run("one correction");
    });
    assert.equal(t.sent.filter(m => m.method === "thread/start").length, 1);
    const turns = t.sent.filter(m => m.method === "turn/start");
    assert.equal(turns.length, 2); assert.equal(turns[0].params.threadId, turns[1].params.threadId);
    assert.deepEqual(metrics.map(m => m.status), ["failed", "completed"]);
    assert.deepEqual(metrics.map(m => m.sessionTurn), [1, 2]);
  } finally { await p.drain(); }
});
test("research bounds single concurrency and three-session recycling; reroute/tools/quota/auth fail closed", async () => {
  assert.throws(() => createLunaResearchProvider({ concurrency: 2 }), /Invalid AIv2 session limits/);
  assert.throws(() => createLunaResearchProvider({ maxSessionsPerProcess: 4 }), /Invalid AIv2 session limits/);
  const t = fakeTransport(), p = createLunaResearchProvider({ spawnProcess: t.fake });
  try {
    await Promise.all(Array.from({ length: 4 }, (_, i) => p.withSession(s => s.run(`scene ${i}`))));
    assert.equal(t.maxActive(), 1); assert.equal(t.processes.length, 2);
    assert.equal(t.sent.filter(m => m.method === "thread/start").length, 4);
  } finally { await p.drain(); }
  for (const config of [{ reroute: true }, { tool: true }, { failure: true }, { auth: true }]) {
    const t = fakeTransport(config), metrics: any[] = [], p = createLunaResearchProvider({ spawnProcess: t.fake, onMetric: m => metrics.push(m) });
    try {
      await assert.rejects(p.withSession(s => s.run("research")), { code: config.tool ? "unexpected_tool_call" : config.failure ? "quota_or_rate_limit" : config.auth ? "authentication_required" : "model_or_effort_mismatch" });
      assert.equal(t.sent.filter(m => m.method === "turn/start").length, 1);
      assert.ok(!JSON.stringify(metrics).includes("secret"));
    } finally { p.close(); }
  }
});

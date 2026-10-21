import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { existsSync } from "node:fs";
import type { spawn } from "node:child_process";
import { createAiv2SessionProvider } from "../scripts/lib/aiv2-provider-session.ts";
function fakeTransport({ mismatch = false, hang = false, failure = false, reroute = false, badJson = false, tool = false } = {}) {
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
        if (msg.method === "thread/start") queueMicrotask(() => emit({ id: msg.id, result: { thread: { id: `thread-${++threads}` }, model: mismatch ? "wrong" : "gpt-6.1-sol", reasoningEffort: "medium" } }));
        if (msg.method === "turn/start") {
          const turnId = `turn-${++turns}`, threadId = msg.params.threadId; active++; maxActive = Math.max(active, maxActive);
          queueMicrotask(() => {
            emit({ id: msg.id, result: { turn: { id: turnId } } });
            if (hang) return;
            setTimeout(() => {
              active--;
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
test("one process reused across fresh per-node threads; correction shares only its own thread", async () => {
  const t = fakeTransport(), metrics: any[] = [];
  const p = createAiv2SessionProvider({ concurrency: 1, spawnProcess: t.fake, onMetric: m => metrics.push(m) });
  const results = await p.withSession(async s => [await s.run("scene A", { outputSchema: { type: "object" } }), await s.run("invalid-schema correction A")]);
  const other = await p.withSession(s => s.run("scene B"));
  assert.equal(t.processes.length, 1); assert.equal(t.sent.filter(m => m.method === "initialize").length, 1);
  assert.equal(results[0].threadId, results[1].threadId); assert.notEqual(other.threadId, results[0].threadId);
  assert.notEqual(results[0].turnId, results[1].turnId);
  assert.equal(metrics.reduce((sum, m) => sum + m.tokenUsage.last.inputTokens, 0), 30);
  assert.deepEqual(metrics.map(m => m.sessionTurn), [1, 2, 1]); assert.deepEqual(metrics.map(m => m.processStarted), [true, false, false]);
  assert.ok(metrics.every(m => m.confirmedModel === "gpt-6.1-sol" && m.confirmedEffort === "medium"));
  assert.ok(t.sent.filter(m => m.method === "turn/start").every(m => m.params.model === "gpt-6.1-sol" && m.params.effort === "medium"));
  assert.equal(t.sent.filter(m => m.method === "turn/start")[1].params.outputSchema, null);
  const proc = t.processes[0]; assert.ok(!("OPENAI_API_KEY" in proc.options.env) && !("CODEX_API_KEY" in proc.options.env));
  assert.ok(proc.options.cwd.includes("reysonai-aiv2-data-")); assert.ok(!proc.options.cwd.includes("/Projects/"));
  assert.ok(proc.args.includes("project_doc_max_bytes=0"));
  assert.ok(t.sent.filter(m => m.method === "thread/start").every(m => m.params.ephemeral && m.params.config.project_doc_max_bytes === 0 && m.params.cwd === proc.options.cwd));
  await p.drain(); assert.ok(proc.child.killed); assert.ok(!existsSync(proc.options.cwd));
});
test("pool concurrency bounded; drain finishes accepted work and rejects new leases", async () => {
  const t = fakeTransport(), p = createAiv2SessionProvider({ concurrency: 2, spawnProcess: t.fake });
  const jobs = Array.from({ length: 7 }, (_, i) => p.withSession(s => s.run(`node ${i}`)));
  const drain = p.drain(); await assert.rejects(p.withSession(s => s.run("not accepted")), { code: "provider_closed" });
  await Promise.all(jobs); await drain;
  assert.equal(t.processes.length, 2); assert.equal(t.maxActive(), 2); assert.ok(t.processes.every(p => p.child.killed));
  assert.equal(new Set(t.sent.filter(m => m.method === "turn/start").map(m => m.params.threadId)).size, 7);
});
test("bounded process recycle and expired lease/overlapping turns fail closed", async () => {
  const t = fakeTransport(), p = createAiv2SessionProvider({ concurrency: 1, maxSessionsPerProcess: 1, spawnProcess: t.fake });
  let captured: any;
  await p.withSession(async s => { captured = s; const run = s.run("one"); await assert.rejects(s.run("overlap"), { code: "overlapping_session_turn" }); await run; });
  await assert.rejects(captured.run("escaped"), { code: "session_lost" });
  await p.withSession(s => s.run("two")); assert.equal(t.processes.length, 2); await p.drain();
});
test("wrong requested/confirmed models, reroute and tools never fall back", async () => {
  for (const config of [{ mismatch: true }, { reroute: true }, { tool: true }]) {
    const t = fakeTransport(config), p = createAiv2SessionProvider({ spawnProcess: t.fake });
    await assert.rejects(p.withSession(s => s.run("one")), { code: config.tool ? "unexpected_tool_call" : "model_or_effort_mismatch" });
    assert.equal(t.processes.length, 1); if (config.mismatch) assert.equal(t.sent.filter(m => m.method === "turn/start").length, 0);
    p.close();
  }
  const t = fakeTransport(), p = createAiv2SessionProvider({ spawnProcess: t.fake });
  await assert.rejects(p.withSession(s => s.run("one", { model: "wrong" })), { code: "model_or_effort_mismatch" });
  assert.equal(t.sent.filter(m => m.method === "turn/start").length, 0); p.close();
});
test("quota sanitized, no retry; invalid JSON permits explicit same-node correction", async () => {
  const t = fakeTransport({ failure: true }), metrics: any[] = [], p = createAiv2SessionProvider({ spawnProcess: t.fake, onMetric: m => metrics.push(m) });
  await assert.rejects(p.withSession(s => s.run("one")), { code: "quota_or_rate_limit" });
  assert.ok(!JSON.stringify(metrics).includes("secret")); assert.equal(t.sent.filter(m => m.method === "turn/start").length, 1); p.close();
  const b = fakeTransport({ badJson: true }), repair = createAiv2SessionProvider({ spawnProcess: b.fake });
  await repair.withSession(async s => { await assert.rejects(s.run("one"), { code: "invalid_json" }); await s.run("correction"); });
  assert.equal(b.sent.filter(m => m.method === "thread/start").length, 1); await repair.drain();
});
test("timeout and immediate close cancel active/queued work without replay or orphan", async () => {
  const t = fakeTransport({ hang: true }), p = createAiv2SessionProvider({ concurrency: 1, timeoutMs: 15, spawnProcess: t.fake });
  await assert.rejects(p.withSession(s => s.run("one")), { code: "timeout" }); assert.ok(t.processes[0].child.killed); p.close();
  const b = fakeTransport({ hang: true }), close = createAiv2SessionProvider({ concurrency: 1, spawnProcess: b.fake });
  const jobs = [close.withSession(s => s.run("one")), close.withSession(s => s.run("two"))];
  const settled = Promise.allSettled(jobs); await new Promise(resolve => setTimeout(resolve, 5)); close.close();
  assert.ok((await settled).every(r => r.status === "rejected")); assert.ok(b.processes.every(p => p.child.killed));
  assert.equal(b.sent.filter(m => m.method === "turn/start").length, 1);
});

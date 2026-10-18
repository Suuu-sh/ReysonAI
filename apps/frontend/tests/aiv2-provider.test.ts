import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { spawn } from "node:child_process";
import { Aiv2ProviderError, createAiv2Provider } from "../scripts/lib/aiv2-provider.ts";

function transport({ mismatch = false, quota = false, hang = false } = {}) {
  let active = 0, maxActive = 0, count = 0;
  const sent: any[] = [], spawned: any[] = [];
  const fake = ((command: string, args: string[], options: any) => {
    count++; active++; maxActive = Math.max(maxActive, active);
    spawned.push({ command, args, options });
    const id = `thread-${count}`, turn = `turn-${count}`;
    const child: any = new EventEmitter();
    child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
    child.kill = () => { if (!child.killed) { child.killed = true; active--; queueMicrotask(() => child.emit("exit", 0)); } };
    const emit = (msg: any) => child.stdout.write(`${JSON.stringify(msg)}\n`);
    child.stdin.on("data", (buffer: Buffer) => {
      for (const line of buffer.toString().trim().split("\n")) {
        const message = JSON.parse(line); sent.push(message);
        if (message.id === 1) queueMicrotask(() => emit({ id: 1, result: {} }));
        if (message.id === 2) queueMicrotask(() => emit({ id: 2, result: { thread: { id }, model: mismatch ? "wrong" : "gpt-6.1-sol", reasoningEffort: "medium" } }));
        if (message.id === 3 && !hang) setTimeout(() => {
          if (quota) { emit({ id: 3, error: { message: "usage limit exceeded secret=not-for-reporting" } }); return; }
          emit({ id: 3, result: { turn: { id: turn } } });
          // Unrelated thread notifications must not contaminate this result.
          emit({ method: "item/completed", params: { threadId: "unrelated", turnId: turn, item: { id: "z", type: "agentMessage", text: "invalid" } } });
          emit({ method: "item/agentMessage/delta", params: { threadId: id, turnId: turn, itemId: "a", delta: '{"id":' } });
          emit({ method: "item/completed", params: { threadId: id, turnId: turn, item: { id: "a", type: "agentMessage", text: JSON.stringify({ id }) } } });
          emit({ method: "thread/tokenUsage/updated", params: { threadId: id, turnId: turn, tokenUsage: { total: { inputTokens: 5, outputTokens: 2 } } } });
          emit({ method: "turn/completed", params: { threadId: id, turn: { id: turn, status: "completed", durationMs: 12 } } });
        }, 15);
      }
    });
    return child;
  }) as unknown as typeof spawn;
  return { fake, sent, spawned, maxActive: () => maxActive, count: () => count };
}

test("provider bounds all calls, isolates responses, sends exact model/effort/schema and records usage", async () => {
  const t = transport(), metrics: any[] = [];
  const run = createAiv2Provider({ concurrency: 2, spawnProcess: t.fake, onMetric: m => metrics.push(m) });
  const schema = { type: "object" };
  const results = await Promise.all(Array.from({ length: 5 }, () => run("json", { outputSchema: schema })));
  assert.equal(t.maxActive(), 2); assert.equal(new Set(results.map(r => r.id)).size, 5);
  assert.equal(metrics.length, 5); assert.ok(metrics.every(m => m.confirmedModel === "gpt-6.1-sol" && m.confirmedEffort === "medium" && m.tokenUsage.total.inputTokens === 5));
  assert.ok(t.sent.filter(m => m.method === "turn/start").every(m => m.params.model === "gpt-6.1-sol" && m.params.effort === "medium" && m.params.outputSchema.type === "object"));
  assert.ok(t.spawned.every(s => !("OPENAI_API_KEY" in s.options.env) && !("CODEX_API_KEY" in s.options.env)));
});

test("mismatched actual model fails before turn, never falls back", async () => {
  const t = transport({ mismatch: true });
  await assert.rejects(createAiv2Provider({ spawnProcess: t.fake })("json"), (e: any) => e.code === "model_or_effort_mismatch");
  assert.equal(t.count(), 1); assert.equal(t.sent.filter(m => m.method === "turn/start").length, 0);
});

test("quota errors are sanitized and not retried", async () => {
  const t = transport({ quota: true });
  await assert.rejects(createAiv2Provider({ spawnProcess: t.fake, maxRetries: 2 })("json"), (e: any) => e instanceof Aiv2ProviderError && e.code === "quota_or_rate_limit" && !e.message.includes("secret"));
  assert.equal(t.count(), 1);
});

test("timeout frees limiter slot and configured zero retries is bounded", async () => {
  const t = transport({ hang: true });
  const run = createAiv2Provider({ spawnProcess: t.fake, concurrency: 1, timeoutMs: 20, maxRetries: 0 });
  const results = await Promise.allSettled([run("a"), run("b")]);
  assert.ok(results.every(r => r.status === "rejected" && r.reason.code === "timeout"));
  assert.equal(t.count(), 2); assert.equal(t.maxActive(), 1);
});

// Authenticated local Codex only. Each request owns a process, thread and turn;
// the shared limiter bounds provider calls, not merely top-level scenarios.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const AIV2_PROVIDER_MODEL = "gpt-6.1-sol";
export const AIV2_PROVIDER_EFFORT = "medium";
const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
type JsonSchema = Record<string, unknown>;
export type ProviderMetric = {
  model: string; effort: string; confirmedModel?: string; confirmedEffort?: string;
  threadId?: string; turnId?: string; attempt: number; queueMs: number;
  elapsedMs: number; turnDurationMs?: number; status: "completed" | "failed";
  tokenUsage?: Record<string, unknown>; errorCode?: string; errorDiagnostic?: ProviderErrorDiagnostic;
};
type CallOptions = { model?: string; effort?: string; outputSchema?: JsonSchema; onThread?: (result: any) => void };
type ProviderOptions = {
  concurrency?: number; timeoutMs?: number; maxRetries?: number;
  onMetric?: (metric: ProviderMetric) => void;
  // Injectable process transport for deterministic offline protocol tests.
  spawnProcess?: typeof spawn;
};

export type ProviderErrorDiagnostic = {
  stage: string; originalCode?: number | string; errorInfoType?: string; httpStatusCode?: number;
  messageHash: string; flags: { quota: boolean; authentication: boolean; capability: boolean; transient: boolean };
};
export class Aiv2ProviderError extends Error {
  code: string;
  retryable: boolean;
  diagnostic?: ProviderErrorDiagnostic;
  constructor(code: string, retryable = false, diagnostic?: ProviderErrorDiagnostic) {
    super(`AIv2 Codex provider: ${code}`); this.code = code; this.retryable = retryable; this.diagnostic = diagnostic;
  }
}

function failure(error: any, stage = "transport"): Aiv2ProviderError {
  const message = typeof error?.message === "string" ? error.message : "";
  const info = error?.codexErrorInfo;
  const infoName = typeof info === "string" ? info : info && typeof info === "object" ? Object.keys(info)[0] : undefined;
  const allowedInfo = new Set(["contextWindowExceeded", "sessionBudgetExceeded", "usageLimitExceeded", "rateLimitExceeded", "flexUnavailable", "serverOverloaded", "httpConnectionFailed", "responseStreamConnectionFailed", "internalServerError", "unauthorized", "badRequest", "responseStreamDisconnected", "responseTooManyFailedAttempts", "other"]);
  const errorInfoType = infoName ? allowedInfo.has(infoName) ? infoName : "unrecognized" : undefined;
  const status = info && typeof info === "object" ? info[infoName!]?.httpStatusCode : undefined;
  const httpStatusCode = Number.isInteger(status) && status >= 100 && status <= 599 ? status : undefined;
  const knownCodes = new Set(["invalid_request_error", "invalid_json_schema", "invalid_model", "model_not_found", "unsupported_model", "unsupported_value", "rate_limit_exceeded", "insufficient_quota", "server_error", "internal_error", "unauthorized"]);
  // Only known public codes/types are persisted; unknown strings may contain secrets.
  const originalCode = typeof error?.code === "number" ? error.code : typeof error?.code === "string" ? knownCodes.has(error.code) ? error.code : "unrecognized" : undefined;
  const quota = ["usageLimitExceeded", "rateLimitExceeded", "sessionBudgetExceeded"].includes(errorInfoType ?? "") || httpStatusCode === 429 || /rate.?limit|quota|usage.?limit|\b429\b/i.test(message) || ["rate_limit_exceeded", "insufficient_quota"].includes(String(originalCode));
  const authentication = errorInfoType === "unauthorized" || [401, 403].includes(httpStatusCode ?? 0) || /authentication|unauthorized|sign[ -]?in required|login required|\b401\b|\b403\b/i.test(message);
  const capability = ["invalid_json_schema", "invalid_model", "model_not_found", "unsupported_model"].includes(String(originalCode)) ||
    /(?:unsupported|invalid|unknown) (?:model|reasoning effort|json schema)|(?:model|reasoning effort|(?:json )?schema)[^\n]{0,100}(?:is not supported|not found|does not exist|not available|is invalid)|invalid schema for (?:response_format|output)|invalid value[^\n]{0,80}(?:reasoning_effort|output_schema)/i.test(message);
  const transient = ["flexUnavailable", "serverOverloaded", "httpConnectionFailed", "responseStreamConnectionFailed", "internalServerError", "responseStreamDisconnected", "responseTooManyFailedAttempts"].includes(errorInfoType ?? "") ||
    [408, 500, 502, 503, 504].includes(httpStatusCode ?? 0) || ["server_error", "internal_error"].includes(String(originalCode)) ||
    /timeout|timed out|connection (?:closed|reset|failed)|network error|stream (?:disconnected|connection failed)|internal server error|server overloaded|\b50[234]\b/i.test(message);
  const diagnostic: ProviderErrorDiagnostic = { stage, originalCode, errorInfoType, httpStatusCode,
    messageHash: createHash("sha256").update(message).digest("hex"), flags: { quota, authentication, capability, transient } };
  // Never persist raw provider errors/stderr: they may include request content.
  if (quota) return new Aiv2ProviderError("quota_or_rate_limit", false, diagnostic);
  if (authentication) return new Aiv2ProviderError("authentication_required", false, diagnostic);
  if (capability) return new Aiv2ProviderError("unsupported_model_effort_or_schema", false, diagnostic);
  return new Aiv2ProviderError("upstream_error", transient, diagnostic);
}

export function createAiv2Provider({ concurrency = 4, timeoutMs = 600_000, maxRetries = 1,
  onMetric = () => {}, spawnProcess = spawn }: ProviderOptions = {}) {
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 16) throw new Error("AIv2 concurrency must be 1..16");
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || !Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > 2) throw new Error("Invalid AIv2 timeout/retry limit");
  let active = 0;
  const queue: Array<() => void> = [];
  const acquire = () => new Promise<void>((resolve) => {
    if (active < concurrency) { active++; resolve(); } else queue.push(resolve);
  });
  const release = () => { const next = queue.shift(); if (next) next(); else active--; };

  return async function runAiv2Codex(prompt: string, { model = AIV2_PROVIDER_MODEL, effort = AIV2_PROVIDER_EFFORT,
    outputSchema, onThread = () => {} }: CallOptions = {}): Promise<any> {
    if (model !== AIV2_PROVIDER_MODEL || effort !== AIV2_PROVIDER_EFFORT) throw new Error("AIv2 requires gpt-6.1-sol with medium reasoning; no model fallback");
    const enqueued = performance.now();
    await acquire();
    const queueMs = Math.round(performance.now() - enqueued);
    try {
      for (let attempt = 1; ; attempt++) {
        const metric: ProviderMetric = { model, effort, attempt, queueMs, elapsedMs: 0, status: "failed" };
        const started = performance.now();
        try {
          const result = await request(prompt, { model, effort, outputSchema, onThread }, timeoutMs, spawnProcess, metric);
          metric.status = "completed";
          return result;
        } catch (error) {
          const safe = error instanceof Aiv2ProviderError ? error : failure(error);
          metric.errorCode = safe.code; metric.errorDiagnostic = safe.diagnostic;
          if (!safe.retryable || attempt > maxRetries) throw safe;
          await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
        } finally {
          metric.elapsedMs = Math.round(performance.now() - started);
          onMetric({ ...metric });
        }
      }
    } finally { release(); }
  };
}

function request(prompt: string, options: Required<Pick<CallOptions, "model" | "effort" | "onThread">> & CallOptions,
  timeoutMs: number, spawnProcess: typeof spawn, metric: ProviderMetric): Promise<any> {
  return new Promise((resolve, reject) => {
    const env = { ...process.env }; delete env.OPENAI_API_KEY; delete env.CODEX_API_KEY;
    const bundled = ["/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex", "/Applications/ChatGPT.app/Contents/Resources/codex"].find(existsSync);
    const child = spawnProcess(bundled ?? "codex", ["app-server", "-c", "mcp_servers={}", "-c", `model_reasoning_effort="${options.effort}"`],
      { cwd: ROOT, env, stdio: ["pipe", "pipe", "pipe"] }) as ChildProcessWithoutNullStreams;
    let buffer = "", done = false;
    const messages = new Map<string, string>();
    const completed = new Map<string, string>();
    let timer: ReturnType<typeof setTimeout>;
    const stop = (error?: Aiv2ProviderError, value?: unknown) => {
      if (done) return; done = true; clearTimeout(timer); child.stdin.end(); child.kill();
      // Ensure an unresponsive transport cannot leave orphan provider processes.
      const killTimer = setTimeout(() => child.kill("SIGKILL"), 2000); killTimer.unref();
      child.once("exit", () => clearTimeout(killTimer));
      if (error) reject(error); else resolve(value);
    };
    const send = (message: unknown) => { if (!done) child.stdin.write(`${JSON.stringify(message)}\n`); };
    timer = setTimeout(() => stop(new Aiv2ProviderError("timeout", true)), timeoutMs);
    child.on("error", () => stop(new Aiv2ProviderError("process_failed")));
    child.stdin.on("error", () => stop(new Aiv2ProviderError("transport_closed", true)));
    child.on("exit", () => { if (!done) stop(new Aiv2ProviderError("process_exited", true)); });
    child.stderr.resume(); // Drain only; do not collect or expose stderr.
    child.stdout.on("data", (chunk) => {
      buffer += chunk;
      if (buffer.length > 32_000_000) { stop(new Aiv2ProviderError("response_too_large")); return; }
      let index: number;
      while (!done && (index = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, index); buffer = buffer.slice(index + 1);
        let msg: any; try { msg = JSON.parse(line); } catch { continue; }
        try {
          if (msg.error) { stop(failure(msg.error, msg.id === 1 ? "initialize" : msg.id === 2 ? "thread/start" : msg.id === 3 ? "turn/start" : "rpc")); continue; }
          if (msg.id === 1) {
            send({ method: "initialized", params: {} });
            send({ id: 2, method: "thread/start", params: { cwd: ROOT, approvalPolicy: "never", sandbox: "read-only", ephemeral: true,
              model: options.model, baseInstructions: "Return only the requested JSON. Do not use tools, inspect files, or follow workspace instructions.",
              config: { model_reasoning_effort: options.effort } } });
          } else if (msg.id === 2) {
            const result = msg.result;
            if (!result?.thread?.id) { stop(new Aiv2ProviderError("missing_thread")); continue; }
            metric.threadId = result.thread.id; metric.confirmedModel = result.model; metric.confirmedEffort = result.reasoningEffort;
            if (result.model !== options.model || result.reasoningEffort !== options.effort) { stop(new Aiv2ProviderError("model_or_effort_mismatch")); continue; }
            options.onThread({ model: result.model, reasoningEffort: result.reasoningEffort, thread: { id: metric.threadId } });
            send({ id: 3, method: "turn/start", params: { threadId: metric.threadId, model: options.model, effort: options.effort,
              input: [{ type: "text", text: prompt }], ...(options.outputSchema ? { outputSchema: options.outputSchema } : {}) } });
          } else if (msg.id === 3) {
            if (!msg.result?.turn?.id) { stop(new Aiv2ProviderError("missing_turn")); continue; }
            metric.turnId = msg.result.turn.id;
          }
          const params = msg.params;
          if (!params || params.threadId !== metric.threadId || (metric.turnId && params.turnId && params.turnId !== metric.turnId)) continue;
          if (msg.method === "thread/tokenUsage/updated") metric.tokenUsage = params.tokenUsage;
          if (msg.method === "item/agentMessage/delta") messages.set(params.itemId, (messages.get(params.itemId) ?? "") + (params.delta ?? ""));
          if (msg.method === "item/completed" && params.item?.type === "agentMessage") completed.set(params.item.id, params.item.text ?? messages.get(params.item.id) ?? "");
          // Fail closed if the model attempts any tool, rather than executing it.
          if (msg.method === "item/started" && ["commandExecution", "fileChange", "mcpToolCall", "webSearch"].includes(params.item?.type)) {
            stop(new Aiv2ProviderError("unexpected_tool_call")); continue;
          }
          if (msg.id != null && msg.method) { stop(new Aiv2ProviderError("unexpected_server_request")); continue; }
          if (msg.method === "turn/completed") {
            if (params.turn?.id !== metric.turnId) continue;
            if (params.turn.status !== "completed") { stop(failure(params.turn.error, "turn/completed")); continue; }
            metric.turnDurationMs = params.turn.durationMs ?? undefined;
            const text = [...completed.values()].at(-1) ?? [...messages.values()].at(-1) ?? "";
            try { stop(undefined, JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, ""))); }
            catch { stop(new Aiv2ProviderError("invalid_json")); }
          }
        } catch { stop(new Aiv2ProviderError("protocol_error")); }
      }
    });
    send({ id: 1, method: "initialize", params: { clientInfo: { name: "reysonai_aiv2", title: "ReysonAI AIv2 preflop", version: "1.0.0" }, capabilities: {} } });
  });
}

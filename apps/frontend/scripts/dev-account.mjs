#!/usr/bin/env node
// Local-only real Google OAuth. Never reads, prints, or writes .dev.vars credentials.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
const frontend = fileURLToPath(new URL("..", import.meta.url));
const backend = path.resolve(frontend, "../backend");
const wrangler = process.env.WRANGLER_BIN;
if (!wrangler || !existsSync(wrangler)) throw new Error("Set WRANGLER_BIN to an existing wrangler/bin/wrangler.js. This script never installs dependencies.");
const config = path.join(backend, "wrangler.local.jsonc");
const persist = path.join(backend, ".wrangler/local-state");
const children = new Set();
let stopping = false;
const env = { ...process.env, CLOUDFLARE_SEND_METRICS: "false" };
function launch(file, args, cwd, capture = false) {
  const child = spawn(process.execPath, [file, ...args], { cwd, env, stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit" });
  children.add(child);
  return new Promise((resolve, reject) => {
    let output = "";
    if (capture) { child.stdout.on("data", chunk => { output += chunk; }); child.stderr.resume(); }
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      children.delete(child);
      if (stopping) return resolve(output);
      if (code !== 0) reject(new Error(`Local process stopped (${code ?? signal}).`));
      else resolve(output);
    });
  });
}
function stop() {
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
  const timer = setTimeout(() => { for (const child of children) child.kill("SIGKILL"); }, 3000);
  timer.unref();
}
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
async function waitForApi() {
  const deadline = Date.now() + 30000;
  while (!stopping && Date.now() < deadline) {
    try { const response = await fetch("http://localhost:8787/health", { signal: AbortSignal.timeout(1000) }); if (response.ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (!stopping) throw new Error("Local API did not become ready within 30 seconds.");
}
const localD1 = ["d1", "execute", "reysonai-local", "--local", "--config", config, "--persist-to", persist];
try {
  // Create only the auth schema. Do not migrate/fetch unrelated production strategy data.
  const result = JSON.parse(await launch(wrangler, [...localD1, "--command", "SELECT name FROM sqlite_master WHERE type='table' AND name='account_users'", "--json"], backend, true));
  if (!result.some(item => item.results?.length)) {
    await launch(wrangler, [...localD1, "--file", path.join(backend, "migrations/0007_accounts.sql")], backend, true);
    console.log("Local account schema initialized.");
  }
  await launch(path.join(frontend, "scripts/build-site-preview.mjs"), [], frontend);
  if (stopping) process.exit(0);
  console.log("Local API: http://localhost:8787 | App: http://localhost:5173/app | Ctrl+C stops both.");
  const api = launch(wrangler, ["dev", "--local", "--config", config, "--persist-to", persist], backend);
  await Promise.race([waitForApi(), api.then(() => { if (!stopping) throw new Error("Local API exited before readiness."); })]);
  if (stopping) process.exit(0);
  // Strategy datasets use Vite local middleware; account config independently defaults to localhost:8787.
  // Clear inherited API overrides so development never fetches production datasets. No auth skip exists.
  env.VITE_API_BASE = "";
  const web = launch(path.join(frontend, "node_modules/vite/bin/vite.js"), ["--host", "localhost", "--port", "5173", "--strictPort"], frontend);
  await Promise.race([api, web]);
  stop();
  await Promise.allSettled([api, web]);
} catch (cause) {
  stop();
  console.error(cause.message);
  process.exitCode = 1;
}

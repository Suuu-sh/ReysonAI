import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { localEstimateMiddleware } from "./scripts/local-estimate.mjs";
import { localPostflopMiddleware } from "./scripts/postflop-ai/local-view.mjs";
import { handEvMiddleware } from "./scripts/postflop-ai/hand-ev.mjs";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { isRetiredJapanesePath } from "./worker/index.js";

function rejectRetiredJapanesePath(req, res, next) {
  const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
  if (!isRetiredJapanesePath(pathname)) return next();
  res.statusCode = 404;
  res.setHeader("content-type", "text/plain; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end("Not Found");
}

// Admin dashboard: names of the locally generated postflop policies (gitignored, so empty in CI builds).
const postflopArtifacts = { name: "postflop-artifacts",
  resolveId: id => id === "virtual:postflop-artifacts" ? "\0virtual:postflop-artifacts" : null,
  load(id) {
    if (id !== "\0virtual:postflop-artifacts") return null;
    const dir = new URL("./.local/postflop-ai", import.meta.url);
    // File name → policy hash, so the dashboard can tell a spot's own policy from a copy.
    const hashes = {};
    for (const name of existsSync(dir) ? readdirSync(dir).filter(name => /-(later-)?policy\.json$/.test(name)) : []) {
      try { hashes[name] = JSON.parse(readFileSync(new URL(`./.local/postflop-ai/${name}`, import.meta.url), "utf8")).metadata?.policy_hash ?? null; } catch { hashes[name] = null; }
    }
    return `export default ${JSON.stringify(hashes)};`;
  } };

export default defineConfig({
  build: {
    outDir: "dist/client",
  },
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
    server: {
      host: "0.0.0.0",
      allowedHosts: ["terminal.local"],
      warmup: {
        clientFiles: ["./src/main.tsx"],
      },
  },
  plugins: [react(), postflopArtifacts, { name: "retired-japanese-route", configureServer(server) { server.middlewares.use(rejectRetiredJapanesePath); }, configurePreviewServer(server) { server.middlewares.use(rejectRetiredJapanesePath); } }, { name: "local-codex-estimates", configureServer(server) {
    server.middlewares.use(localEstimateMiddleware);
    server.middlewares.use(localPostflopMiddleware);
    server.middlewares.use(handEvMiddleware);
  } }],
});

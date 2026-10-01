import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { localEstimateMiddleware } from "./scripts/local-estimate.mjs";
import { DEFENCE_VERSION } from "./scripts/postflop-ai/defence.mjs";
import { localDatasetsMiddleware } from "./scripts/local-datasets.mjs";
import { localPostflopMiddleware } from "./scripts/postflop-ai/local-view.mjs";
import { handEvMiddleware } from "./scripts/postflop-ai/hand-ev.mjs";
import { flopBaseMiddleware } from "./scripts/postflop-ai/flop-base-d1.mjs";
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
    // Hand-EV files count only while they match the spot's current flop and turn/river policies
    // ("fresh"); a stale or missing one stays TODO.
    const read = name => { try { return JSON.parse(readFileSync(new URL(`./.local/postflop-ai/${name}`, import.meta.url), "utf8")); } catch { return null; } };
    for (const name of existsSync(dir) ? readdirSync(dir).filter(name => /-(later-)?(hand-ev|reasons)\.json$/.test(name)) : []) {
      const slug = name.replace(/-(later-)?(hand-ev|reasons)\.json$/, ""), ev = read(name);
      const flop = hashes[`${slug}-policy.json`], later = hashes[`${slug}-later-policy.json`];
      hashes[name] = ev && flop && ev.policy_hash === flop && (!later || ev.later_policy_hash === later) &&
        (!/-hand-ev\.json$/.test(name) || /-later-hand-ev\.json$/.test(name) || ev.defence_version === DEFENCE_VERSION) ? "fresh" : null;
    }
    return `export default ${JSON.stringify(hashes)};`;
  } };

export default defineConfig({
  // The postflop compute worker imports shared modules, so it needs ES module output.
  worker: { format: "es" },
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
  plugins: [react(), postflopArtifacts, { name: "retired-japanese-route", configureServer(server) { server.middlewares.use(rejectRetiredJapanesePath); }, configurePreviewServer(server) { server.middlewares.use(rejectRetiredJapanesePath); server.middlewares.use(localDatasetsMiddleware); } }, { name: "local-codex-estimates", configureServer(server) {
    server.middlewares.use(localEstimateMiddleware);
    server.middlewares.use(localDatasetsMiddleware);
    server.middlewares.use(localPostflopMiddleware);
    server.middlewares.use(handEvMiddleware);
    server.middlewares.use(flopBaseMiddleware);
  } }],
});

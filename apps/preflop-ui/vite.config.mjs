import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { localEstimateMiddleware } from "./scripts/local-estimate.mjs";
import { localPostflopMiddleware } from "./scripts/postflop-ai/local-view.mjs";
import { handEvMiddleware } from "./scripts/postflop-ai/hand-ev.mjs";
import { existsSync, readdirSync } from "node:fs";

// Admin dashboard: names of the locally generated postflop policies (gitignored, so empty in CI builds).
const postflopArtifacts = { name: "postflop-artifacts",
  resolveId: id => id === "virtual:postflop-artifacts" ? "\0virtual:postflop-artifacts" : null,
  load(id) {
    if (id !== "\0virtual:postflop-artifacts") return null;
    const dir = new URL("./.local/postflop-ai", import.meta.url);
    return `export default ${JSON.stringify(existsSync(dir) ? readdirSync(dir) : [])};`;
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
      proxy: {
        "/api": {
          target: "http://127.0.0.1:3000",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ""),
        },
      },
    warmup: {
      clientFiles: ["./src/main.jsx"],
    },
  },
  plugins: [react(), postflopArtifacts, { name: "local-codex-estimates", configureServer(server) {
    server.middlewares.use(localEstimateMiddleware);
    server.middlewares.use(localPostflopMiddleware);
    server.middlewares.use(handEvMiddleware);
  } }],
});

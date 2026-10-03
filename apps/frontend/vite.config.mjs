import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { localEstimateMiddleware } from "./scripts/local-estimate.mjs";
import { localDatasetsMiddleware } from "./scripts/local-datasets.mjs";
import { localPostflopMiddleware } from "./scripts/postflop-ai/local-view.mjs";
import { flopBaseMiddleware } from "./scripts/postflop-ai/flop-base-d1.mjs";
import { isRetiredAdminPath, isRetiredJapanesePath } from "./worker/index.js";

function rejectRetiredPath(req, res, next) {
  const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
  if (!isRetiredJapanesePath(pathname) && !isRetiredAdminPath(pathname)) return next();
  res.statusCode = 404;
  res.setHeader("content-type", "text/plain; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end("Not Found");
}

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
  plugins: [react(), { name: "retired-routes", configureServer(server) { server.middlewares.use(rejectRetiredPath); }, configurePreviewServer(server) { server.middlewares.use(rejectRetiredPath); server.middlewares.use(localDatasetsMiddleware); } }, { name: "local-codex-estimates", configureServer(server) {
    server.middlewares.use(localEstimateMiddleware);
    server.middlewares.use(localDatasetsMiddleware);
    server.middlewares.use(localPostflopMiddleware);
    server.middlewares.use(flopBaseMiddleware);
  } }],
});

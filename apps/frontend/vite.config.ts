import type { IncomingMessage, ServerResponse } from "node:http";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { localEstimateMiddleware } from "./scripts/local-estimate.ts";
import { localAiv2SampleMiddleware, localDatasetsMiddleware } from "./scripts/local-datasets.ts";
import { localPostflopMiddleware } from "./scripts/postflop-ai/local-view.ts";
import { flopBaseMiddleware } from "./scripts/postflop-ai/flop-base-d1.ts";
import { isRetiredAdminPath, isRetiredJapanesePath } from "./worker/index.ts";

function rejectRetiredPath(req: IncomingMessage, res: ServerResponse, next: () => void) {
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
    server.middlewares.use(localAiv2SampleMiddleware);
    server.middlewares.use(localPostflopMiddleware);
    server.middlewares.use(flopBaseMiddleware);
  } }],
});

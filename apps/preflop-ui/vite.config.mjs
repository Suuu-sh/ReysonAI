import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { localEstimateMiddleware } from "./scripts/local-estimate.mjs";
import { localPostflopMiddleware } from "./scripts/postflop-ai/local-view.mjs";

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
  plugins: [react(), { name: "local-codex-estimates", configureServer(server) {
    server.middlewares.use(localEstimateMiddleware);
    server.middlewares.use(localPostflopMiddleware);
  } }],
});

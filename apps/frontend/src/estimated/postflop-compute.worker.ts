import { preloadDatasets } from "./datasets.ts";

const worker = self as any;
worker.addEventListener("message", async (event: MessageEvent) => {
  try {
    // spots.mjs synchronously reads these shared source datasets at module initialization.
    // Load them in the worker's separate module registry before importing the compute graph.
    const names = [...new Set([...Object.keys(event.data.datasets ?? {}), "three-bet-responses", "limp-responses"])];
    await preloadDatasets(names);
    const { computeLaterHandEv } = await import("./postflop-compute.ts");
    const result = computeLaterHandEv(event.data);
    worker.postMessage({ ok: true, result });
  } catch (error) {
    worker.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});

export {};

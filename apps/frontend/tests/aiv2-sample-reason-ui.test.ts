import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

let server: Awaited<ReturnType<typeof createServer>>;
let AiReason: any;
let reasonEquityFact: any;
before(async () => {
  server = await createServer({ root: fileURLToPath(new URL("..", import.meta.url)),
    server: { middlewareMode: true, watch: null, hmr: false, ws: false }, appType: "custom" });
  ({ AiReason, reasonEquityFact } = await server.ssrLoadModule("/src/estimated/RangeWorkspace.tsx"));
});
after(async () => { await server?.close(); });

test("range-wide AIv2 reasons render when the sample has no EV fact labels", () => {
  const data = { spot_id: "UTG_open", type: "open", method: "llm-range-wide-combo-v3 · gpt-6-sol",
    hands: { A9s: { reason: "Open 90%. Suited ace blocker supports the UTG mix." } } };
  const hand = { hand: "A9s", open: 90, fold: 10, open_size_bb: 2.5 };
  const html = renderToStaticMarkup(createElement(AiReason, { hand,
    reasonState: { data, error: null, loading: false, spotId: "UTG_open" } }));
  assert.match(html, /Open 90%\. Suited ace blocker supports the UTG mix\./);
  assert.equal(reasonEquityFact(data), undefined);
});

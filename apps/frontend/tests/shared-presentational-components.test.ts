import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

let server, SessionCards, RecentHandsContent;
before(async () => {
  server = await createServer({ root: fileURLToPath(new URL("..", import.meta.url)), server: { middlewareMode: true, watch: null, hmr: false, ws: false }, appType: "custom" });
  ({ SessionCards } = await server.ssrLoadModule("/src/trainer/SessionCards.tsx"));
  ({ RecentHandsContent } = await server.ssrLoadModule("/src/trainer/RecentHandsContent.tsx"));
});
after(async () => { await server?.close(); });

test("saved practice and Agent history use one compact PlayingCard wrapper", () => {
  const html = renderToStaticMarkup(createElement(SessionCards, { cards: ["As", "Td"] }));
  assert.match(html, /^<span class="sessions-cards">/);
  assert.match(html, /A♠/);
  assert.match(html, /T♦/);
  assert.equal((html.match(/suit-/g) ?? []).length, 2);
  for (const file of ["SessionPage.tsx", "AgentHandHistory.tsx"]) {
    assert.match(readFileSync(new URL(`../src/trainer/${file}`, import.meta.url), "utf8"), /<SessionCards cards=/);
  }
});

test("both ranked arenas share recent-hand content inside their direct GamePanel", () => {
  const empty = renderToStaticMarkup(createElement(RecentHandsContent, { recent: [] }));
  const filled = renderToStaticMarkup(createElement(RecentHandsContent, { recent: [{ id: "h1", netBb: 1.5 }] }));
  assert.match(empty, /class="agent-panel"/);
  assert.match(empty, /完了したハンドはまだありません/);
  assert.match(filled, /h1 · \+1\.5 bb/);
  for (const file of ["FastFoldArena.tsx", "HumanRankArena.tsx"]) {
    const source = readFileSync(new URL(`../src/trainer/${file}`, import.meta.url), "utf8");
    assert.match(source, /<GamePanel id="recent"[^>]*><RecentHandsContent recent=/);
  }
});

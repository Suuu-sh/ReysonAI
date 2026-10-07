import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

let server, PlayingCard;
before(async () => {
  server = await createServer({ root: fileURLToPath(new URL("..", import.meta.url)), server: { middlewareMode: true, watch: null, hmr: false, ws: false }, appType: "custom" });
  ({ PlayingCard } = await server.ssrLoadModule("/src/components/PlayingCard.tsx"));
});
after(async () => { await server?.close(); });
const render = props => renderToStaticMarkup(createElement(PlayingCard, props));

test("trainer cards retain all four suit hooks, rank T and b/i markup", () => {
  for (const [suit, glyph] of Object.entries({ s: "♠", h: "♥", d: "♦", c: "♣" })) {
    assert.equal(render({ card: `T${suit}` }), `<span class="trainer-card suit-${suit}"><b>T</b><i>${glyph}</i></span>`);
    assert.equal(render({ card: `A${suit}`, size: "mini" }), `<span class="trainer-card suit-${suit} mini"><b>A</b><i>${glyph}</i></span>`);
  }
});

test("agent face sizes and empty backs preserve existing classes and conceal ranks", () => {
  for (const size of ["is-hero", "is-board", "is-tiny", ""]) {
    const suffix = size ? ` ${size}` : "";
    assert.equal(render({ variant: "agent", card: "Qd", size }), `<span class="trainer-card suit-d agent-card${suffix}"><b>Q</b><i>♦</i></span>`);
    const back = `<span class="agent-card is-back${suffix}"></span>`;
    assert.equal(render({ variant: "agent", card: "Qd", hidden: true, size }), back);
    assert.equal(render({ variant: "agent", size }), back);
  }
});

test("site cards retain aria-hidden and the dealt-card/fan animation offsets", () => {
  for (const index of [-2, 0, 1, 2]) {
    const html = render({ variant: "site", card: "Kh", index, "aria-hidden": true });
    assert.ok(html.startsWith(`<span aria-hidden="true" class="site-card suit-h" style="--i:${index}"><b>K</b><i>`));
    assert.match(html, /<svg[^>]*aria-hidden="true"[^>]*focusable="false"/);
    assert.match(html, /<span class="site-visually-hidden">♥<\/span><\/i><\/span>$/);
  }
  assert.match(render({ variant: "site", card: "Ac", className: "custom", style: { opacity: 0.5 }, "aria-label": "Ace of clubs" }), /aria-label="Ace of clubs" class="site-card suit-c custom" style="--i:0;opacity:0.5"/);
});

test("only site cards use flat SVG suits with accessible text preserved", () => {
  const shapes = new Set();
  for (const [suit, glyph] of Object.entries({ s: "♠", h: "♥", d: "♦", c: "♣" })) {
    const html = render({ variant: "site", card: `Q${suit}` });
    assert.match(html, /<b>Q<\/b><i><svg/);
    assert.match(html, /fill="currentColor"/);
    assert.ok(html.includes(`<span class="site-visually-hidden">${glyph}</span>`));
    shapes.add(html.match(/<svg[\s\S]*?<\/svg>/)[0]);
  }
  assert.equal(shapes.size, 4);
});

test("session notation stays text-only with the legacy unknown-suit fallback", () => {
  assert.equal(render({ variant: "text", card: "As" }), '<span class="suit-s">A♠</span>');
  assert.equal(render({ variant: "text", card: "Th" }), '<span class="suit-h">T♥</span>');
  assert.equal(render({ variant: "text", card: "Ax" }), '<span class="suit-x">Ax</span>');
});

test("all four surfaces import the shared card rather than duplicating faces", () => {
  for (const path of ["agent/AgentTable.tsx", "trainer/TrainerPage.tsx", "trainer/SessionPage.tsx", "site/ServiceSite.tsx"]) {
    const source = readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");
    assert.match(source, /import \{ PlayingCard[, }][^\n]*components\/PlayingCard\.tsx/);
    assert.doesNotMatch(source, /function (?:PlayingCard|Card)\(/);
    assert.doesNotMatch(source, /const (?:SUITS|suitGlyph)\s*[:=]/);
  }
});

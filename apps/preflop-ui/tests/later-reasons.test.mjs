import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import { createServer } from "vite";
import { LINES, RUNOUT_TEXTURES, TIERS } from "../scripts/postflop-ai/model.mjs";
import { LATER_NODES } from "../scripts/postflop-ai/later-tree.mjs";

const reasons = JSON.parse(readFileSync(fileURLToPath(new URL("../src/estimated/later-reasons.json", import.meta.url)), "utf8"));
let server;
let laterActionReason;

before(async () => {
  server = await createServer({ root: fileURLToPath(new URL("..", import.meta.url)),
    server: { middlewareMode: true, watch: null, hmr: false, ws: false }, appType: "custom" });
  ({ laterActionReason } = await server.ssrLoadModule("/src/estimated/later-reasons.ts"));
});

after(async () => { await server?.close(); });

function situationFor(node) {
  if (node.endsWith("_first")) return "lead";
  if (node.endsWith("_vs_raise")) return "facing_raise";
  if (node.includes("_vs_")) return "facing";
}

function actionKeyFor(situation, action) {
  if (situation !== "lead") return action;
  return { check: "check", bet33: "bet_small", bet75: "bet_big", bet125: "bet_big", allin: "allin" }[action];
}

test("later action reasons map all saved node situations and action keys", () => {
  const cases = [
    ["turn_oop_first", "check", "check"],
    ["turn_oop_first", "bet33", "bet_small"],
    ["turn_oop_first", "bet75", "bet_big"],
    ["turn_oop_first", "bet125", "bet_big"],
    ["turn_oop_first", "allin", "allin"],
    ["turn_ip_vs_75", "fold", "fold"],
    ["turn_ip_vs_75", "call", "call"],
    ["turn_ip_vs_75", "raise", "raise"],
    ["turn_oop_vs_raise", "fold", "fold"],
    ["turn_oop_vs_raise", "call", "call"],
  ];
  for (const [node, action, key] of cases) {
    const situation = situationFor(node);
    assert.equal(actionKeyFor(situation, action), key);
    const expected = reasons.base.turn[situation][key].medium.ja;
    assert.ok(laterActionReason({ street: "turn", node, action, tier: "medium", texture: "blank", line: "checked", locale: "ja" }).startsWith(expected), `${node}/${action}`);
  }
});

test("river draw uses the air tier", () => {
  const args = { street: "river", node: "river_ip_vs_33", action: "call", tier: "draw", texture: "blank", line: "defender" };
  const expected = [
    reasons.base.river.facing.call.air.ja,
    reasons.texture.river.blank.air.ja,
    reasons.line.river.facing.defender.ja,
  ].join("");
  assert.equal(laterActionReason({ ...args, locale: "ja" }), expected);
});

test("three reason sentences are joined in base, runout texture, then line order", () => {
  const args = { street: "turn", node: "turn_oop_first", action: "bet33", tier: "draw", texture: "flush", line: "aggressor", locale: "ja" };
  const expected = [
    reasons.base.turn.lead.bet_small.draw.ja,
    reasons.texture.turn.flush.draw.ja,
    reasons.line.turn.lead.aggressor.ja,
  ].join("");
  assert.equal(laterActionReason(args), expected);
  assert.ok(expected.indexOf(reasons.base.turn.lead.bet_small.draw.ja) < expected.indexOf(reasons.texture.turn.flush.draw.ja));
  assert.ok(expected.indexOf(reasons.texture.turn.flush.draw.ja) < expected.indexOf(reasons.line.turn.lead.aggressor.ja));
});

test("reasons switch between Japanese and English", () => {
  const args = { street: "turn", node: "turn_ip_vs_75", action: "call", tier: "strong", texture: "over", line: "defender" };
  const japanese = laterActionReason({ ...args, locale: "ja" });
  const english = laterActionReason({ ...args, locale: "en" });
  assert.equal(japanese, [reasons.base.turn.facing.call.strong.ja, reasons.texture.turn.over.strong.ja, reasons.line.turn.facing.defender.ja].join(""));
  assert.equal(english, [reasons.base.turn.facing.call.strong.en, reasons.texture.turn.over.strong.en, reasons.line.turn.facing.defender.en].join(" "));
  assert.notEqual(japanese, english);

  const previousWindow = globalThis.window;
  const hadWindow = Object.hasOwn(globalThis, "window");
  let savedLocale = "en";
  globalThis.window = { localStorage: { getItem: key => key === "solveaai:locale:v1" ? savedLocale : null } };
  try {
    assert.equal(laterActionReason(args), english);
    savedLocale = "ja";
    assert.equal(laterActionReason(args), japanese);
  } finally {
    if (hadWindow) globalThis.window = previousWindow;
    else delete globalThis.window;
  }
});

test("missing reason keys are skipped without suppressing available sentences", () => {
  const args = { street: "turn", node: "turn_oop_vs_raise", action: "raise", tier: "medium", texture: "blank", line: "unrecorded", locale: "ja" };
  assert.equal(laterActionReason(args), reasons.texture.turn.blank.medium.ja);
  const missingTexture = laterActionReason({ ...args, action: "call", texture: "unrecorded", line: "checked" });
  assert.equal(missingTexture, reasons.base.turn.facing_raise.call.medium.ja + reasons.line.turn.facing_raise.checked.ja);
});

test("later-reasons.json covers every reachable street/node/action/tier/texture/line combination", () => {
  assert.equal(reasons.version, 1);
  for (const [node, actions] of Object.entries(LATER_NODES)) {
    const [street] = node.split("_");
    const situation = situationFor(node);
    assert.ok(["turn", "river"].includes(street));
    assert.ok(situation, node);
    for (const action of actions) {
      const actionKey = actionKeyFor(situation, action);
      assert.ok(actionKey, `${node}/${action} action key`);
      for (const tier of TIERS) {
        const reasonTier = street === "river" && tier === "draw" ? "air" : tier;
        assert.ok(reasons.base[street]?.[situation]?.[actionKey]?.[reasonTier]?.ja, `base ja ${node}/${action}/${tier}`);
        assert.ok(reasons.base[street]?.[situation]?.[actionKey]?.[reasonTier]?.en, `base en ${node}/${action}/${tier}`);
      }
    }
  }

  for (const street of ["turn", "river"]) {
    for (const texture of RUNOUT_TEXTURES) for (const tier of TIERS) {
      const reasonTier = street === "river" && tier === "draw" ? "air" : tier;
      assert.ok(reasons.texture[street]?.[texture]?.[reasonTier]?.ja, `texture ja ${street}/${texture}/${tier}`);
      assert.ok(reasons.texture[street]?.[texture]?.[reasonTier]?.en, `texture en ${street}/${texture}/${tier}`);
    }
    for (const situation of ["lead", "facing", "facing_raise"]) for (const line of LINES) {
      assert.ok(reasons.line[street]?.[situation]?.[line]?.ja, `line ja ${street}/${situation}/${line}`);
      assert.ok(reasons.line[street]?.[situation]?.[line]?.en, `line en ${street}/${situation}/${line}`);
    }
  }
});

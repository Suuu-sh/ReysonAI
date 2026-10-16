import assert from "node:assert/strict";
import test from "node:test";
import { glossaryPieces } from "../src/estimated/poker-glossary.ts";

test("glossary terms are found longest-first and carry definitions in both languages", () => {
  const ja = glossaryPieces("ナッツアドバンテージがあり、ポラライズしたベットでブラフキャッチャーを追い込みます。", "ja");
  assert.deepEqual(ja.filter(piece => piece.term).map(piece => piece.term), ["ナッツアドバンテージ", "ポラライズ", "ブラフキャッチャー"]);
  assert.ok(ja.every(piece => !piece.term || piece.definition));
  assert.equal(ja.map(piece => piece.text).join(""), "ナッツアドバンテージがあり、ポラライズしたベットでブラフキャッチャーを追い込みます。");
  const en = glossaryPieces("A polarised overbet pressures bluff-catchers; the equity denial matters.", "en");
  assert.deepEqual(en.filter(piece => piece.term).map(piece => piece.term), ["polarised", "overbet", "bluff-catchers", "equity denial"]);
});

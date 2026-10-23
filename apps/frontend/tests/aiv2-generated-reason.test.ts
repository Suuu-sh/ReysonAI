import test from "node:test";
import assert from "node:assert/strict";
import { generatedAiv2Reason } from "../src/estimated/english-reasons.ts";

test("AIv2 explanations preserve the saved A2s and A9s text in both languages", () => {
  const reasons = {
    A2s: {
      en: "Open 45%, fold 55%. Suited wheel potential supports some opens; the lowest ace kicker keeps folds more common.",
      ja: "オープン45%、フォールド55%。スーテッドのホイールの可能性から一部オープンしますが、最も低いエースのキッカーのためフォールドのほうが多くなります。",
    },
    A9s: {
      en: "Open 90%, fold 10%. Suited ace potential supports frequent opens, with some restraint from UTG.",
      ja: "オープン90%、フォールド10%。スーテッドのエースのポテンシャルから高頻度でオープンしますが、UTGではやや慎重になります。",
    },
  };
  for (const [hand, { en, ja }] of Object.entries(reasons)) {
    assert.equal(generatedAiv2Reason({ reason: en, reason_ja: ja }, "en"), en, `${hand} should display the saved English explanation verbatim`);
    assert.equal(generatedAiv2Reason({ reason: en, reason_ja: ja }, "ja"), ja, `${hand} should display its saved Japanese translation`);
  }
});

test("AIv2 makes an explicit English fallback when Japanese translation is missing", () => {
  assert.equal(generatedAiv2Reason(undefined), null);
  assert.equal(generatedAiv2Reason({ reason: "  " }), null);
  assert.equal(generatedAiv2Reason({ reason: "Open 45%." }, "ja"), "日本語訳がありません。英語原文: Open 45%.");
});

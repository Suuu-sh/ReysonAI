import { useEffect, useMemo, useState } from "react";
import { ActionBars, Panel, SectionHeading, StatusState } from "../components/primitives.jsx";
import { StrategyMatrix } from "../components/StrategyMatrix.jsx";
import { deck, flopDecision, recognizedFlop } from "./postflop-trial.js";

const labels = { check: "チェック", bet33: "ベット 33%", bet75: "ベット 75%", fold: "フォールド", call: "コール", raise: "3倍チェックレイズ" };
const nodeTitles = {
  btn_first: "BTN · BBのチェックへの応答", bb_vs_33: "BB · 33%ベットへの応答",
  bb_vs_75: "BB · 75%ベットへの応答", btn_vs_raise: "BTN · チェックレイズへの応答",
};
const suitLabels = { s: "♠", h: "♥", d: "♦", c: "♣" };

function matrixFor(node) {
  return new Map(node.rows.map(row => [row.hand, {
    hand: row.hand, comboCount: row.comboCount, unreachable: !row.reachable, actions: row.mix,
  }]));
}

export function FlopCardPicker({ cards, onCardsChange }) {
  return <Panel className="postflop-board-panel" aria-label="フロップカード選択">
    <SectionHeading title="フロップのカードを選択" />
    <div className="postflop-card-pickers">
      {cards.map((card, index) => <label key={index} className="postflop-card-picker">
        <span>{index + 1}枚目</span>
        <select aria-label={`フロップ${index + 1}枚目`} value={card} onChange={event => onCardsChange(cards.map((value, slot) => slot === index ? event.target.value : value))}>
          <option value="">カードを選択</option>
          {deck.map(option => <option key={option} value={option} disabled={cards.some((selected, slot) => slot !== index && selected === option)}>{option[0]}{suitLabels[option[1]]}</option>)}
        </select>
      </label>)}
    </div>
    <small>3枚を選択してください。同じカードは選べません。AI推定は代表12ボードのみです。</small>
  </Panel>;
}

export function PostflopTrial({ context, cards, actions = [], displayMode = "standard" }) {
  const board = recognizedFlop(cards);
  const [selectedHand, setSelectedHand] = useState("AKo");
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const decision = flopDecision(actions);

  useEffect(() => {
    setData(null); setError("");
    if (!context.pilotAvailable || !board) { setStatus("idle"); return; }
    const controller = new AbortController();
    setStatus("loading");
    fetch(`/local-postflop?board=${encodeURIComponent(board)}`, { signal: controller.signal })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "ポストフロップ候補を読み込めませんでした。");
        if (body.kind !== "ai_estimate_not_gto" || body.board !== board || !body.nodes) throw new Error("候補の盤面または形式が一致しません。");
        return body;
      })
      .then(body => { setData(body); setStatus("ready"); })
      .catch(reason => { if (reason.name !== "AbortError") { setError(reason.message); setStatus("error"); } });
    return () => controller.abort();
  }, [board, context.pilotAvailable]);

  const current = decision.node && data?.board === board && data.nodes[decision.node];
  const aggregates = useMemo(() => current ? matrixFor(current) : null, [current]);
  const chosen = aggregates?.get(selectedHand);
  return <div className="postflop-trial" aria-label="ポストフロップ試作">
    <p className="postflop-context">{context.players.join(" · ")}がフロップへ進みました。開始ポット {context.potBb}BB。<br />AI推定・GTOではない・代表12ボードのみ。人による確認前のローカル試作です。</p>
    {!context.pilotAvailable ? <Panel className="postflop-unavailable"><StatusState title="この局面のポストフロップ方針は未収録">現在のAI試作があるのは、標準設定のBTN 2.5BBオープン→BBコールだけです。プリフロップの行動ブロックから戻れます。</StatusState></Panel>
      : !cards.every(Boolean) ? <Panel className="postflop-unavailable"><StatusState title="フロップを選択してください">上の3枚を選ぶと、この局面の方針とレンジ表を確認できます。</StatusState></Panel>
      : !board ? <Panel className="postflop-unavailable"><StatusState title="このフロップの方針は未収録">選んだ3枚は代表12ボードに含まれません。未監査のレンジは表示しません。</StatusState></Panel>
      : <>
        {status === "loading" && <Panel><StatusState title="ローカル候補を読み込み中" /></Panel>}
        {status === "error" && <Panel><StatusState title="ローカル候補を表示できません" tone="error">{error}</StatusState></Panel>}
        {!decision.node && <Panel><StatusState title="フロップの判断終了">{decision.result} ターン・リバーの公開用方針はまだありません。</StatusState></Panel>}
        {current && aggregates && <div className="postflop-range-layout">
          <StrategyMatrix node={{ actingPosition: current.seat }} title={`${nodeTitles[decision.node]} · AI推定レンジ`} ariaLabel={`${current.seat}のフロップAI推定レンジ`}
            aggregates={aggregates} actions={current.actions} actionLabels={labels} simplified={displayMode === "simple"}
            selected={selectedHand} onSelect={setSelectedHand} unreachableReason="元のプリフロップ頻度0%またはボードで到達不能、推奨なし" />
          <Panel className="postflop-hand-detail"><SectionHeading title={`${selectedHand} · アクション頻度`} />
            {chosen?.unreachable ? <StatusState title="到達不能">元のプリフロップレンジに含まれないか、このボードで組み合わせがありません。</StatusState>
              : chosen && <><p>有効な2枚組 {chosen.comboCount}通り。盤面のブロッカーを除外した試作頻度です。</p>
                <ActionBars items={current.actions.map(action => ({ action, frequency: chosen.actions[action] }))} labels={labels} /></>}
            <small>各実コンボに方針ルールを適用し、到達可能なコンボで集計。相手の非公開カードは使用しません。</small>
          </Panel>
        </div>}
      </>}
  </div>;
}

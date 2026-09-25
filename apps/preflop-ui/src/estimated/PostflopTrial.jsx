import { useEffect, useMemo, useState } from "react";
import { ActionBars, Panel, SectionHeading, StatusState } from "../components/primitives.jsx";
import { StrategyMatrix } from "../components/StrategyMatrix.jsx";
import { flopDecision, representativeFlops } from "./postflop-trial.js";

const labels = {
  check: "チェック", bet33: "ベット 33%", bet75: "ベット 75%",
  fold: "フォールド", call: "コール", raise: "3倍チェックレイズ",
};
const nodeTitles = {
  btn_first: "BTN · BBのチェックへの応答",
  bb_vs_33: "BB · 33%ベットへの応答",
  bb_vs_75: "BB · 75%ベットへの応答",
  btn_vs_raise: "BTN · チェックレイズへの応答",
};

function matrixFor(node) {
  return new Map(node.rows.map(row => [row.hand, {
    hand: row.hand, comboCount: row.comboCount,
    unreachable: !row.reachable, actions: row.mix,
  }]));
}

export function PostflopTrial({ context, onBack, displayMode = "standard" }) {
  const [board, setBoard] = useState(representativeFlops[0]);
  const [actions, setActions] = useState([]);
  const [selectedHand, setSelectedHand] = useState("AKo");
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const decision = flopDecision(actions);

  useEffect(() => {
    if (!context.pilotAvailable) return;
    const controller = new AbortController();
    setData(null); setStatus("loading"); setError("");
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

  const current = decision.node && data?.nodes[decision.node];
  const aggregates = useMemo(() => current ? matrixFor(current) : null, [current]);
  const chosen = aggregates?.get(selectedHand);
  const boardCards = board.match(/../g) ?? [];

  return <main className="postflop-trial" aria-label="ポストフロップ試作">
    <Panel className="postflop-heading">
      <div className="postflop-heading-row">
        <div><small>プリフロップ → ポストフロップ</small><h1>フロップを試す</h1></div>
        <button type="button" className="postflop-back" onClick={onBack}>← プリフロップへ戻る</button>
      </div>
      <p>{context.players.join(" · ")}がフロップへ進みました。開始ポット {context.potBb}BB。</p>
      <small>AI推定・GTOではない・代表12ボードのみ。人による確認前のローカル試作で、公開レンジではありません。</small>
    </Panel>
    {!context.pilotAvailable ? <Panel className="postflop-unavailable">
      <StatusState title="この局面のポストフロップ方針は未収録">現在のAI試作があるのは、標準設定のBTN 2.5BBオープン→BBコールだけです。この局面の戦略は作り足さず、プリフロップの履歴から戻れます。</StatusState>
    </Panel> : <>
      <Panel className="postflop-board-panel">
        <SectionHeading title="代表フロップを選択" />
        <div className="postflop-board-list" role="group" aria-label="代表フロップ">
          {representativeFlops.map(item => <button type="button" key={item} aria-pressed={board === item}
            onClick={() => { setBoard(item); setActions([]); setSelectedHand("AKo"); }}>{item.match(/../g).join(" ")}</button>)}
        </div>
        <div className="postflop-board-cards" aria-label={`フロップ ${boardCards.join(" ")}`}>{boardCards.map(card => <span key={card} className={/[hd]$/.test(card) ? "red" : ""}>{card}</span>)}</div>
        <p>BBはチェック。以降の行動を選ぶと、次の判断と対応するレンジ表に切り替わります。</p>
      </Panel>
      <Panel className="postflop-action-panel">
        <SectionHeading title="フロップの行動" action={actions.length > 0 && <button type="button" className="postflop-back" onClick={() => setActions(actions.slice(0, -1))}>ひとつ戻る</button>} />
        <div className="postflop-history">{(decision.history ?? ["BB Check", ...actions]).map((item, index) => <span key={`${index}-${item}`}>{item}</span>)}</div>
        <p>現在のポット {decision.potBb}BB</p>
        {decision.node ? <>
          <h3>{nodeTitles[decision.node]}</h3>
          <div className="postflop-action-buttons">{(current?.actions ?? []).map(action => <button type="button" key={action} onClick={() => setActions([...actions, action])}>{labels[action]}</button>)}</div>
        </> : <StatusState title="フロップの判断終了">{decision.result} ターン・リバーの公開用方針はまだありません。</StatusState>}
      </Panel>
      {status === "loading" && <Panel><StatusState title="ローカル候補を読み込み中" /></Panel>}
      {status === "error" && <Panel><StatusState title="ローカル候補を表示できません" tone="error">{error}</StatusState></Panel>}
      {current && aggregates && <div className="postflop-range-layout">
        <StrategyMatrix node={{ actingPosition: current.seat }} title={`${nodeTitles[decision.node]} · AI推定レンジ`} ariaLabel={`${current.seat}のフロップAI推定レンジ`}
          aggregates={aggregates} actions={current.actions} actionLabels={labels} simplified={displayMode === "simple"}
          selected={selectedHand} onSelect={setSelectedHand} unreachableReason="元のプリフロップ頻度0%またはボードで到達不能、推奨なし" />
        <Panel className="postflop-hand-detail">
          <SectionHeading title={`${selectedHand} · アクション頻度`} />
          {chosen?.unreachable ? <StatusState title="到達不能">元のプリフロップレンジに含まれないか、このボードで組み合わせがありません。</StatusState>
            : chosen && <><p>有効な2枚組 {chosen.comboCount}通り。盤面によるブロッカーを除外した試作頻度です。</p>
              <ActionBars items={current.actions.map(action => ({ action, frequency: chosen.actions[action] }))} labels={labels} /></>}
          <small>同じハンドクラス内の各実コンボに方針ルールを適用し、到達可能なコンボで集計しています。相手の非公開カードは使用しません。</small>
        </Panel>
      </div>}
    </>}
  </main>;
}

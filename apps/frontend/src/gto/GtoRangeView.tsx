import { useMemo } from "react";
import { hands } from "../data.ts";
import { ActionBars, Panel, SectionHeading, StatusState } from "../components/primitives.tsx";
import { StrategyMatrix } from "../components/StrategyMatrix.tsx";
import { ComboPicker, PostflopRangeSummary, suitLabels } from "../estimated/PostflopTrial.tsx";
import { useState } from "react";
import { productLocale } from "../locale.ts";
import { validateGtoBenchmark } from "./benchmark.ts";
import savedCalculation from "./benchmark-flop.json";
import "./gto.css";

const copy = (en: string, ja: string, zh: string, es: string) => ({ en, ja, "zh-CN": zh, es })[productLocale()];
const calculation = (() => {
  try { return validateGtoBenchmark(savedCalculation); }
  catch { return null; }
})();

type NodeId = "bb-root" | "btn-after-check";
const actions = ["bet", "check"] as const;
type Props = {
  available: boolean;
  nodeId: NodeId;
  selected: string | null;
  onSelect: (hand: string) => void;
  displayMode: string;
  workspaceRake: string;
};

export function GtoRangeView({ available, nodeId, selected, onSelect, displayMode, workspaceRake }: Props) {
  const [selectedCombo, setSelectedCombo] = useState("all");
  const node = calculation?.nodes.find(item => item.id === nodeId);
  const aggregates = useMemo(() => {
    const mapped = new Map<string, { hand: string; comboCount: number; actions: Record<string, number>; unreachable?: boolean }>();
    for (const hand of hands) mapped.set(hand, { hand, comboCount: 0, actions: {}, unreachable: true });
    for (const entry of node?.classes ?? []) {
      mapped.set(entry.handClass, {
        hand: entry.handClass,
        comboCount: entry.comboCount,
        actions: { check: entry.frequencies.check, bet: entry.frequencies.bet },
      });
    }
    return mapped;
  }, [node]);
  const handClass = node?.classes.find(item => item.handClass === selected);
  const combos = node?.combos
    .filter(item => item.handClass === selected && item.reachWeight > 0)
    .sort((a, b) => a.combo.localeCompare(b.combo)).map(item => ({ cards: item.combo, mix: { bet: item.frequencies.bet, check: item.frequencies.check } })) ?? [];
  const selectedComboData = combos.find(combo => combo.cards === selectedCombo);
  const actionLabels = {
    check: copy("Check", "チェック", "过牌", "Pasar"),
    bet: copy("Bet 2.75 BB (50% pot)", "ベット 2.75 BB（ポット50%）", "下注 2.75 BB（底池50%）", "Apostar 2,75 BB (50 % del bote)"),
  };
  const title = nodeId === "bb-root"
    ? copy("BB · first to act", "BB · 最初のアクション", "BB · 首先行动", "BB · primera acción")
    : copy("BTN · after BB checks", "BTN · BBチェック後", "BTN · BB过牌后", "BTN · tras pasar BB");

  if (!available || !node) {
    return <Panel className="multiway-range-panel missing-range-panel">
      <SectionHeading title={copy("No saved GTO data for this selection", "この選択に保存済みGTOデータはありません", "此选择没有已保存的GTO数据", "No hay datos GTO guardados para esta selección")} />
      <StatusState>
        {copy(
          "Saved scope: BTN 2.5 BB open → BB call; flop Qs Jh 2h; 100 BB starting / 97.5 BB effective; pot 5.5 BB; 0% rake. Only BB first to act and BTN after BB checks are saved. No AI estimates are substituted.",
          "保存範囲: BTN 2.5 BBオープン→BBコール、フロップQs Jh 2h、開始100 BB・実効97.5 BB・ポット5.5 BB・レーキ0%。BB最初のアクションとBBチェック後のBTNのみ収録。AI推定で代用しません。",
          "已保存范围：BTN 2.5 BB开池→BB跟注；翻牌Qs Jh 2h；起始100 BB、有效97.5 BB、底池5.5 BB、抽水0%。仅收录BB先行动和BB过牌后的BTN；不会以AI估计替代。",
          "Cobertura: BTN abre 2,5 BB → BB paga; flop Qs Jh 2h; 100 BB iniciales / 97,5 BB efectivos; bote 5,5 BB; rake 0 %. Solo BB primero y BTN tras check de BB. No se sustituyen estimaciones IA.",
        )}
      </StatusState>
    </Panel>;
  }

  const savedScope = copy(
    `BTN 2.5 BB → BB call · Qs Jh 2h · effective 97.5 BB · pot 5.5 BB · saved rake 0%. Workspace rake: ${workspaceRake}. Starting ranges are provisional AI estimates, not preflop GTO. Colors show ${displayMode === "simple" ? "main action" : "action frequencies"}, not reach.`,
    `BTN 2.5 BB→BBコール · Qs Jh 2h · 実効97.5 BB · ポット5.5 BB · 保存計算のレーキ0%（現在の設定: ${workspaceRake}）。開始レンジは暫定AI推定で、プリフロップGTOではありません。色は到達率ではなくアクション頻度です。`,
    `BTN 2.5 BB→BB跟注 · Qs Jh 2h · 有效97.5 BB · 底池5.5 BB · 已保存计算抽水0%（当前设置：${workspaceRake}）。起始范围是暂定AI估计，并非翻牌前GTO。颜色表示行动频率，不表示到达率。`,
    `BTN 2,5 BB → BB paga · Qs Jh 2h · 97,5 BB efectivos · bote 5,5 BB · rake guardado 0% (configuración actual: ${workspaceRake}). Rangos iniciales son estimaciones IA, no GTO preflop. Los colores muestran frecuencias, no alcance.`,
  );

  const reachWeight = node.combos.reduce((sum, combo) => sum + combo.reachWeight, 0);
  const summaryItems = actions.map(action => ({ action,
    frequency: reachWeight ? node.combos.reduce((sum, combo) => sum + combo.reachWeight * combo.frequencies[action], 0) / reachWeight : 0,
  }));
  const comboCards = selectedComboData?.cards.match(/../g);

  return <div className="postflop-range-layout" aria-label={copy("Saved GTO range and selected hand", "保存済みGTOレンジと選択ハンド", "已保存GTO范围和所选手牌", "Rango GTO guardado y mano seleccionada")}>
    <StrategyMatrix
      node={{ actingPosition: node.position }}
      title={title}
      ariaLabel={copy(`${node.position} saved flop range`, `${node.position} の保存済みフロップレンジ`, `${node.position} 已保存翻牌范围`, `Rango de flop guardado de ${node.position}`)}
      aggregates={aggregates}
      actions={["bet", "check"]}
      actionLabels={actionLabels}
      simplified={displayMode === "simple"}
      selected={selected}
      onSelect={onSelect}
      footer={<details className="gto-scope"><summary>{copy("Saved conditions", "保存条件", "已保存条件", "Condiciones guardadas")}</summary><p>{savedScope}</p></details>}
      unreachableReason={copy("No saved positive-reach combo", "正の到達重みを持つコンボなし", "没有已保存正权重组合", "Sin combinaciones guardadas con peso positivo")}
    />
    <div className="postflop-side">
      <PostflopRangeSummary items={summaryItems} labels={actionLabels} actions={["bet", "check"]}
        combos={node.combos.filter(combo => combo.reachWeight > 0).length} />
      <Panel className="postflop-hand-detail">
        {!selected ? <SectionHeading title={copy("Select a hand", "ハンドを選択", "选择手牌", "Selecciona una mano")} />
          : !handClass ? <><SectionHeading title={selected} /><StatusState title={copy("Unavailable", "未収録", "不可用", "No disponible")}>{copy("No positive-reach combo was saved. This is not a 100% fold.", "正の到達重みを持つコンボはありません。フォールド100%を意味しません。", "没有保存正权重组合，不代表100%弃牌。", "No se guardó combo con alcance positivo; no significa retirarse al 100%.")}</StatusState></>
            : <>
              <div className="postflop-view-line static"><h3 className="postflop-view-title">
                {comboCards ? comboCards.map(card => <span key={card} className={`suit-${card[1]}`}>{card[0]}{suitLabels[card[1]]}</span>) : <>{selected}<small>{copy("Average", "平均", "平均", "Media")}</small></>}
              </h3></div>
              <ComboPicker hand={selected!} combos={combos} actions={actions} labels={actionLabels}
                selected={selectedCombo} onSelect={setSelectedCombo} missingReason={copy("Not saved", "未収録", "未保存", "No guardado")}
                missingTitle={copy("This combo was not included in the saved benchmark", "このコンボは保存済みベンチマークに含まれません", "此组合不在已保存基准中", "Este combo no está incluido en la referencia guardada")} />
              <ActionBars items={actions.map(action => ({ action, frequency: selectedComboData?.mix[action] ?? handClass.frequencies[action] }))} labels={actionLabels} />
            </>}
      </Panel>
    </div>
  </div>;
}

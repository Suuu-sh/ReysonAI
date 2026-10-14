import { useMemo, useState } from "react";
import type { Profile } from "../profile.ts";
import { hands, pct } from "../data.ts";
import { ActionBars, Panel, SectionHeading, StatusState } from "../components/primitives.tsx";
import { StrategyMatrix } from "../components/StrategyMatrix.tsx";
import { RANGE_SECTION, Sidebar } from "../components/layout.tsx";
import { productLocale } from "../locale.ts";
import { validateGtoBenchmark, type GtoNode } from "./benchmark.ts";
import savedCalculation from "./benchmark-flop.json";
import "./gto.css";

const copy = (en: string, ja: string, zh: string, es: string) => ({ en, ja, "zh-CN": zh, es })[productLocale()];
const calculation = (() => {
  try { return { data: validateGtoBenchmark(savedCalculation), error: null }; }
  catch { return { data: null, error: "invalid" }; }
})();
const formatFrequency = (value: number) => pct(value);

export function GtoRangeView({ profile, onEditProfile, onSectionChange }: { profile?: Profile | null; onEditProfile?: () => void; onSectionChange?: (section: string) => void }) {
  const [nodeId, setNodeId] = useState<"bb-root" | "btn-after-check">("bb-root");
  const [selected, setSelected] = useState<string | null>(null);
  const benchmark = calculation.data;
  const node = benchmark?.nodes.find(item => item.id === nodeId);
  const aggregates = useMemo(() => {
    const mapped = new Map<string, { hand: string; comboCount: number; actions: Record<string, number>; unreachable?: boolean }>();
    for (const hand of hands) mapped.set(hand, { hand, comboCount: 0, actions: {}, unreachable: true });
    for (const entry of node?.classes ?? []) mapped.set(entry.handClass, {
      hand: entry.handClass, comboCount: entry.comboCount,
      actions: { check: entry.frequencies.check, bet: entry.frequencies.bet },
    });
    return mapped;
  }, [node]);
  const handClass = node?.classes.find(item => item.handClass === selected);
  const combos = node?.combos.filter(item => item.handClass === selected && item.reachWeight > 0).sort((a, b) => a.combo.localeCompare(b.combo)) ?? [];
  const actionLabels = { check: copy("Check", "チェック", "过牌", "Pasar"), bet: copy("Bet 2.75 BB (50% pot)", "ベット 2.75 BB（ポット50%）", "下注 2.75 BB（底池50%）", "Apostar 2,75 BB (50 % del bote)") };
  const nodeLabel = (item: GtoNode) => item.id === "bb-root"
    ? copy("BB · first to act", "BB · 最初のアクション", "BB · 首先行动", "BB · primera acción")
    : copy("BTN · after BB checks", "BTN · BBチェック後", "BTN · BB过牌后", "BTN · tras pasar BB");
  return <div className="shell">
    <Sidebar activeSection={RANGE_SECTION} onSectionChange={onSectionChange ?? (() => {})} profile={profile} onEditProfile={onEditProfile} />
    <main className="gto-range-page">
      <Panel className="gto-context">
        <div className="gto-heading">
          <div><h1>{copy("GTO calculation", "GTO計算", "GTO 计算", "Cálculo GTO")}</h1>
            <p>{copy("Near-equilibrium within saved conditions. Not a general-purpose solver or preflop GTO range.", "保存済み条件内での近似均衡です。汎用ソルバーやプリフロップGTOレンジではありません。", "仅在已保存条件下接近均衡；不是通用求解器或翻牌前 GTO 范围。", "Cercano al equilibrio solo bajo las condiciones guardadas; no es un solver general ni un rango GTO preflop.")}</p></div>
          <span className="gto-badge">GTO</span>
        </div>
        <dl className="gto-facts">
          <div><dt>{copy("Preflop", "プリフロップ", "翻牌前", "Preflop")}</dt><dd>BTN 2.5 BB → BB {copy("call", "コール", "跟注", "igualar")}</dd></div>
          <div><dt>{copy("Flop", "フロップ", "翻牌", "Flop")}</dt><dd>Q♠ J♥ 2♥ <small>Qs Jh 2h</small></dd></div>
          <div><dt>{copy("Stacks / pot", "スタック / ポット", "筹码 / 底池", "Pilas / bote")}</dt><dd>100 BB → 97.5 BB / 5.5 BB</dd></div>
          <div><dt>{copy("Tree", "アクションツリー", "行动树", "Árbol")}</dt><dd>{copy("50% pot bets · 2.5× raises · unlimited raises", "ポット50%ベット・2.5倍レイズ・レイズ回数制限なし", "50% 底池下注 · 2.5 倍加注 · 不限加注次数", "Apuestas del 50 % · subidas ×2,5 · sin límite de subidas")}</dd></div>
          <div><dt>{copy("Rake", "レーキ", "抽水", "Comisión")}</dt><dd>0%</dd></div>
          {benchmark && <div><dt>{copy("Exploitability", "エクスプロイタビリティ", "可剥削度", "Explotabilidad")}</dt><dd>{(benchmark.metadata.exploitabilityPotFraction * 100).toFixed(6)}% {copy("of initial pot", "初期ポット比", "相对于初始底池", "del bote inicial")}</dd></div>}
        </dl>
        <p className="gto-caveat">{copy("Starting ranges are provisional ReysonAI preflop estimates, not preflop GTO inputs. Only the two flop decisions below were saved; other boards, streets and histories are unavailable in this version.", "開始レンジは ReysonAI の暫定的なプリフロップ推定値で、プリフロップGTOではありません。保存されているのは下記2つのフロップ判断のみです。別のボード・ストリート・履歴は未収録です。", "起始范围是 ReysonAI 暂定的翻牌前估计，并非翻牌前 GTO 输入。仅保存了以下两个翻牌决策；其他牌面、街道和行动历史不可用。", "Los rangos iniciales son estimaciones preflop provisionales de ReysonAI, no rangos GTO preflop. Solo se guardaron las dos decisiones de flop siguientes; otros boards, calles e historiales no están disponibles.")}</p>
      </Panel>
      {!node || !benchmark ? <Panel><StatusState tone="error" title={copy("Calculation unavailable", "計算結果を利用できません", "计算结果不可用", "Cálculo no disponible")}>{copy("The saved calculation is missing or invalid. No AI estimates are substituted.", "保存済み計算がないか無効です。AI推定値で代用しません。", "已保存的计算缺失或无效；不会用 AI 估计替代。", "Falta el cálculo guardado o no es válido. No se sustituyen estimaciones de IA.")}</StatusState></Panel> : <>
        <div className="gto-node-selector" role="group" aria-label={copy("Saved flop decision", "保存済みフロップ判断", "已保存的翻牌决策", "Decisión de flop guardada")}>
          {benchmark.nodes.map(item => <button type="button" key={item.id} aria-pressed={nodeId === item.id} onClick={() => { setNodeId(item.id); setSelected(null); }}>{nodeLabel(item)}</button>)}
        </div>
        <div className={`gto-results${selected ? " has-selection" : ""}`}>
          <StrategyMatrix node={{ actingPosition: node.position }} title={nodeLabel(node)} ariaLabel={copy(`${node.position} saved flop range`, `${node.position} の保存済みフロップレンジ`, `${node.position} 已保存的翻牌范围`, `Rango de flop guardado de ${node.position}`)}
            aggregates={aggregates} actions={["bet", "check"]} actionLabels={actionLabels} selected={selected} onSelect={setSelected}
            footer={<p className="gto-matrix-note">{copy("Colors show action frequencies, not hand reach.", "色はアクション頻度を示し、ハンドの到達率ではありません。", "颜色表示行动频率，而非手牌到达率。", "Los colores muestran frecuencias de acción, no el alcance de la mano.")}</p>}
            unreachableReason={copy("No saved positive-reach combo", "保存済みの正の到達重みを持つコンボなし", "没有已保存的正权重组合", "Sin combinaciones guardadas con peso positivo")} />
          <Panel className="gto-detail">
            <SectionHeading title={selected ? `${selected} · ${copy("saved frequencies", "保存済み頻度", "已保存频率", "Frecuencias guardadas")}` : copy("Select a hand", "ハンドを選択", "选择手牌", "Selecciona una mano")} />
            {!selected ? <p>{copy("Choose an available hand in the 13×13 range to inspect each saved combo.", "13×13レンジから収録済みハンドを選ぶと、各コンボを確認できます。", "从 13×13 范围中选择可用手牌，查看每个已保存组合。", "Elige una mano disponible en el rango 13×13 para ver cada combinación guardada.")}</p>
              : !handClass ? <StatusState title={copy("Unavailable", "未収録", "不可用", "No disponible")}>{copy("No positive-reach combo was saved for this hand. This is not a 100% fold.", "このハンドには正の到達重みを持つコンボが保存されていません。フォールド100%という意味ではありません。", "此手牌没有已保存的正权重组合；这不代表 100% 弃牌。", "No se guardó ninguna combinación con peso positivo. Esto no significa 100 % retirarse.")}</StatusState>
                : <><p className="gto-class-note">{copy("Reach-weighted average across", "到達重みによる加重平均・", "按权重加权平均，共", "Media ponderada por peso de alcance de")} {handClass.comboCount} {copy("saved combos", "収録コンボ", "个已保存组合", "combinaciones guardadas")}</p>
                  <ActionBars items={[{ action: "bet", frequency: handClass.frequencies.bet }, { action: "check", frequency: handClass.frequencies.check }]} labels={actionLabels} />
                  <div className="gto-combo-list"><h3>{copy("Individual combos", "個別コンボ", "各个组合", "Combinaciones individuales")}</h3>
                    <table><thead><tr><th scope="col">{copy("Combo", "コンボ", "组合", "Combo")}</th><th scope="col">{actionLabels.bet}</th><th scope="col">{actionLabels.check}</th></tr></thead><tbody>
                      {combos.map(combo => <tr key={combo.combo}><th scope="row">{combo.combo}</th><td>{formatFrequency(combo.frequencies.bet)}</td><td>{formatFrequency(combo.frequencies.check)}</td></tr>)}
                    </tbody></table>
                  </div></>}
          </Panel>
        </div>
      </>}
    </main>
  </div>;
}

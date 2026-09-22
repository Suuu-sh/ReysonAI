import { useEffect, useMemo, useState } from "react";
import { SolveaGTOApiError, SolveaGTOClient } from "../../../packages/solveagto-sdk-ts/src/index.ts";
import { handAggregates, sortActions, strategyCombos } from "./data.js";
import { solutionForStack, solutionStackBb, spotRequest, spotTitle } from "./spot.js";
import { AppFooter, Sidebar, SolutionStatusNotice } from "./components/layout.jsx";
import { AiRangeView } from "./components/AiRangeView.jsx";
import { ResultsView } from "./components/ResultsView.jsx";
import { SpotSettings } from "./components/SpotSettings.jsx";
import { StatusState } from "./components/primitives.jsx";

// Local development keeps the same-origin proxy so the local UI talks to the
// local Rust API and its local Worker. Production sets this at build time to
// the read-only Cloudflare API Worker URL.
const api = new SolveaGTOClient({
  baseUrl: import.meta.env.VITE_SOLVEAGTO_API_BASE_URL || "/api",
});

export function App() {
  const [viewMode, setViewMode] = useState("ai");
  const [aiSpot, setAiSpot] = useState("btn_open");
  const [solutions, setSolutions] = useState([]);
  const [solutionId, setSolutionId] = useState("");
  const [stackBb, setStackBb] = useState(100);
  const [spot, setSpot] = useState({ mode: "open", opener: "BTN", actor: "BB" });
  const [result, setResult] = useState(null);
  const [selected, setSelected] = useState("AKs");
  const [filter, setFilter] = useState("all");
  const [section, setSection] = useState("プリフロップ");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState("");
  const [reload, setReload] = useState(0);
  const [missing, setMissing] = useState(false);
  const [retry, setRetry] = useState(0);
  const queryKey = JSON.stringify([solutionId, spot]);
  const node = result?.key === queryKey ? result.node : null;

  let validation = "";
  try {
    spotRequest(solutionId, spot);
  } catch (exception) {
    validation = exception.message;
  }

  useEffect(() => {
    if (viewMode !== "solver") {
      setLoading("");
      setError("");
      return undefined;
    }
    let live = true;
    setLoading("保存済み推定レンジを取得中");
    setSolutions([]);
    setError("");
    setResult(null);
    setSolutionId("");
    setMissing(false);

    api.preflop.listSolutions()
      .then(values => {
        if (!live) return;
        setSolutions(values);
        const initialSolution = solutionForStack(values, 100) ?? values[0];
        setStackBb(solutionStackBb(initialSolution) ?? 100);
        setSolutionId(initialSolution?.solutionId ?? "");
        setMissing(!initialSolution && values.length > 0);
        setLoading("");
      })
      .catch(exception => {
        if (!live) return;
        setError(exception.message);
        setLoading("");
      });

    return () => { live = false; };
  }, [reload, viewMode]);

  useEffect(() => {
    if (viewMode !== "solver") return undefined;
    setResult(null);
    setMissing(false);
    setError("");
    setFilter("all");
    if (!solutionId || validation) {
      setLoading("");
      if (!solutionId) setMissing(solutions.length > 0);
      return;
    }

    let live = true;
    setLoading("指定局面を取得中");
    const request = spotRequest(solutionId, spot);

    api.preflop.resolve(request)
      .then(value => {
        if (!live) return;
        if (value.solutionId !== solutionId || value.node.actingPosition !== request.heroPosition) {
          throw new Error("取得した局面が選択条件と一致しません。");
        }
        setResult({ key: queryKey, node: value.node });
        const available = strategyCombos(value.node);
        setSelected(current => available.some(combo => combo.hand === current) ? current : available[0]?.hand ?? "");
        setMissing(!available.length);
        setLoading("");
      })
      .catch(exception => {
        if (!live) return;
        if (exception instanceof SolveaGTOApiError && (exception.status === 400 || exception.status === 404)) setMissing(true);
        else setError(exception.message);
        setLoading("");
      });

    return () => { live = false; };
  }, [queryKey, retry, validation, viewMode]);

  function changeSpot(nextSpot) {
    setSpot(nextSpot);
    setResult(null);
    setMissing(false);
  }

  function changeSolution(nextSolutionId) {
    setResult(null);
    setSolutionId(nextSolutionId);
    const nextSolution = solutions.find(item => item.solutionId === nextSolutionId);
    const nextStackBb = solutionStackBb(nextSolution);
    if (nextStackBb !== null) setStackBb(nextStackBb);
  }

  function changeStack(nextStackBb) {
    const nextSolution = solutionForStack(solutions, nextStackBb);
    setStackBb(nextStackBb);
    setSolutionId(nextSolution?.solutionId ?? "");
    setResult(null);
    setMissing(!nextSolution);
  }

  const solution = solutions.find(item => item.solutionId === solutionId);
  const combos = strategyCombos(node);
  const aggregates = useMemo(() => handAggregates(combos), [combos]);
  const actions = useMemo(() => sortActions([...new Set(combos.flatMap(combo => combo.actions.map(action => action.action))) ]), [combos]);

  return (
    <div className="shell">
      <Sidebar activeSection={section} onSectionChange={setSection} />
      <main>
        <div className="view-mode-switch" role="group" aria-label="表示する推定レンジ">
          <button aria-pressed={viewMode === "ai"} onClick={() => setViewMode("ai")}>推定レンジ</button>
          <button aria-pressed={viewMode === "solver"} onClick={() => setViewMode("solver")}>保存済み推定レンジ</button>
        </div>

        {viewMode === "ai" ? (
          <>
            <AiRangeView activeSpot={aiSpot} onSpotChange={setAiSpot} />
          </>
        ) : (
          <>
            <SolutionStatusNotice solution={solution} />
            <SpotSettings
              solutions={solutions}
              solutionId={solutionId}
              spot={spot}
              stackBb={stackBb}
              loading={loading}
              validation={validation}
              onSolutionChange={changeSolution}
              onStackChange={changeStack}
              onSpotChange={changeSpot}
              onDisplay={() => solutionId ? setRetry(value => value + 1) : setReload(value => value + 1)}
            />

            {validation && <StatusState tone="error">{validation}</StatusState>}
            {loading && <StatusState>{loading}…</StatusState>}
            {error && <StatusState tone="error" action={<button onClick={() => solutionId ? setRetry(value => value + 1) : setReload(value => value + 1)}>再試行</button>}>
              取得できませんでした。APIの起動・保存先を確認してください。
              <details><summary>エラー詳細</summary>{error}</details>
            </StatusState>}

            {!loading && !error && !validation && (!solutions.length || missing) && (
              <StatusState title={spotTitle(spot)}>
                {!solutions.length ? "保存済み推定レンジがありません。" : "この条件に一致する保存済み推定レンジがありません。"}
                局面設定はできますが、結果は表示しません。
              </StatusState>
            )}

            {!loading && !error && !validation && !missing && node && (
              !combos.length
                ? <StatusState>この局面には保存済みの戦略データがありません。</StatusState>
                : <ResultsView
                  section={section}
                  node={node}
                  solution={solution}
                  combos={combos}
                  aggregates={aggregates}
                  selected={selected}
                  filter={filter}
                  actions={actions}
                  onSelect={setSelected}
                  onFilterChange={setFilter}
                />
            )}
          </>
        )}
        <AppFooter />
      </main>
    </div>
  );
}

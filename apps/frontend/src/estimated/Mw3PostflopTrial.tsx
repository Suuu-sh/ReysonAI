import { useEffect, useMemo, useState } from "react";
import { Panel, SectionHeading, StatusState } from "../components/primitives.tsx";
import { productLocale } from "../i18n.ts";
import { mw3DecisionView } from "../../scripts/postflop-ai/mw3-runtime.mjs";
import { deferPostflopCalculation, isAbortError } from "./postflop-browser.ts";
import { isVerifiedMw3Kit, mw3DeliveryClient, type Mw3DeliveryClient, type Mw3Kit } from "./mw3-browser.ts";
import { buildMw3RangeNavigation, type Mw3RangeSelection } from "./mw3-range-state.ts";
import { mw3Copy } from "./mw3-copy.ts";
import { Mw3RangeView } from "./Mw3RangeView.tsx";

export function useMw3RangeSession(context: any, selection: Mw3RangeSelection, client: Mw3DeliveryClient = mw3DeliveryClient, active = true) {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<{ key: string; client: Mw3DeliveryClient; kit?: Mw3Kit; failed?: boolean } | null>(null);
  const [computed, setComputed] = useState<{ key: string; kit: Mw3Kit; view?: any; failed?: boolean } | null>(null);
  const id = context?.kind === "mw3_srp" ? context.spotId : null;
  const enabled = Boolean(active && id && context.mw3Available);
  useEffect(() => {
    if (!enabled || !client.supportsSpot(id)) return;
    const controller = new AbortController();
    client.load(id, controller.signal).then(kit => {
      if (controller.signal.aborted) return;
      if (!isVerifiedMw3Kit(kit) || kit.spotId !== id) { setLoaded({ key: id, client, failed: true }); return; }
      setLoaded({ key: id, client, kit });
    }, error => {
      if (!controller.signal.aborted && !isAbortError(error)) setLoaded({ key: id, client, failed: true });
    });
    return () => controller.abort();
  }, [id, enabled, client, attempt]);
  const kit = enabled && loaded?.key === id && loaded.client === client ? loaded.kit : null;
  const navigation = useMemo(() => {
    if (!enabled || !kit) return null;
    try { return buildMw3RangeNavigation(kit.inputs.spot, selection, productLocale()); }
    catch { return { invalid: true } as any; }
  }, [enabled, kit, selection.flopCards.join(), selection.flopActions.join(), selection.turnCard, selection.turnActions.join(), selection.riverCard, selection.riverActions.join(), productLocale()]);
  const key = JSON.stringify([id, selection, attempt]);
  useEffect(() => {
    if (!kit || !navigation || navigation.invalid) return;
    const controller = new AbortController();
    deferPostflopCalculation(() => mw3DecisionView(kit.inputs, kit.policies, { board: navigation.board, paths: navigation.paths }), controller.signal)
      .then(view => { if (!controller.signal.aborted) setComputed({ key, kit, view }); }, error => { if (!controller.signal.aborted && !isAbortError(error)) setComputed({ key, kit, failed: true }); });
    return () => controller.abort();
  }, [kit, navigation, key]);
  const view = computed?.key === key && computed.kit === kit ? computed.view : null;
  const failed = Boolean(enabled && loaded?.key === id && loaded.client === client && loaded.failed || navigation?.invalid || computed?.key === key && computed.kit === kit && computed.failed);
  const loading = enabled && client.supportsSpot(id) && !failed && (!kit || navigation && !view);
  return { navigation, view, loading, failed, approved: enabled && client.supportsSpot(id), retry: () => { setLoaded(null); setComputed(null); setAttempt(value => value + 1); } };
}

export function Mw3PostflopTrial({ context, session, cards, displayMode }: any) {
  const t = mw3Copy();
  if (session.view) return <Mw3RangeView view={session.view} settledPotBb={session.navigation?.settledPotBb} displayMode={displayMode} />;
  const pick = cards?.some((card: string) => !card);
  return <div className="mw3-tables" aria-label={t.unavailable}>
    {context.players.map((seat: string) => <Panel key={seat} className="matrix-panel missing-range-panel" aria-label={`${seat} · ${t.unavailable}`}>
      <SectionHeading title={seat} />
      <StatusState title={session.loading ? t.loading : session.approved && pick ? t.pick : t.unavailable}>{session.failed ? t.failed : !session.loading && (!session.approved || !pick) ? t.detail : null}</StatusState>
      {session.failed && <button type="button" onClick={session.retry}>{t.retry}</button>}
    </Panel>)}
  </div>;
}

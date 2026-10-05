import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowClockwise, Trophy } from "@phosphor-icons/react";
import { AgentTablePage } from "../agent/AgentTable.tsx";
import { PokerTable, PokerSeat, PokerChip, PokerActionButton } from "../agent/PokerTable.tsx";
import { StyleAvatar } from "../agent/StyleAvatar.tsx";
import { OpponentProfile, type OpponentProfileData } from "../agent/OpponentProfile.tsx";
import { RankLadder } from "./RankBadge.tsx";
import { ffAction } from "./FastFoldArena.tsx";
import { ffCopy as t, ffNumber, ffBreakRemaining, FastFoldError } from "./fastfold-api.ts";
import { humanProfile, humanRequest, humanRankState, validHumanProfile, type HumanProfile, type HumanOpponent, type HumanMatch, type HumanPublicPlayer } from "./human-api.ts";
import type { FastFoldProfile } from "./fastfold-api.ts";
import "./fastfold.css";

const playerName = (p: HumanPublicPlayer) => p.unavailable ? t("Departed player", "退席したプレイヤー", "已离桌的玩家", "Jugador retirado") : p.name;
const unavailableProfile = (p: HumanPublicPlayer): OpponentProfileData => ({ name: playerName(p), kind: "human", unavailable: true, type: "", avatar: <StyleAvatar id="collecting" color="#8a8f9c" size={64}/> });

type Props = { ready: boolean; view?: "play" | "waiting"; onBack: () => void; onWaiting: () => void; onPlay: () => void; onRanking: () => void; onProfile: (profile: FastFoldProfile) => void };
export function HumanRankArena({ ready, view = "play", onBack, onWaiting, onPlay, onRanking, onProfile }: Props) {
  const [profile, setProfile] = useState<HumanProfile | null>(null);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [consent, setConsent] = useState(false), [elapsed, setElapsed] = useState(0);
  const [opponent, setOpponent] = useState<OpponentProfileData | null>(null), [profileError, setProfileError] = useState("");
  const generation = useRef(0), sequence = useRef(0), applied = useRef(0), inFlight = useRef(false);
  const pending = useRef<{ path: string; body: unknown } | null>(null);
  const profileSequence = useRef(0);
  const current = useRef(profile); current.current = profile;
  const callbacks = useRef({onBack,onWaiting,onPlay,onProfile}); callbacks.current = {onBack,onWaiting,onPlay,onProfile};
  const clock = useRef({serverNow:0,receivedAt:0});
  const apply = useCallback((next: HumanProfile, seq: number) => {
    if (!validHumanProfile(next)) throw new FastFoldError("invalid_state", 503);
    if (seq < applied.current) return;
    applied.current = seq; clock.current = {serverNow:next.serverNow,receivedAt:performance.now()}; setElapsed(0); setProfile(next);
    callbacks.current.onProfile({...next,publicName:next.publicName ?? null,state:humanRankState(next.state)});
  }, []);
  const load = useCallback(async (initial = false) => {
    if (!ready || inFlight.current || pending.current) return;
    const token = generation.current, seq = ++sequence.current;
    if (initial) setLoading(true);
    try { const next = await humanProfile(); if (token === generation.current) { apply(next,seq); setError(""); } }
    catch { if (token === generation.current) setError(t("Human ranked server unavailable. No local rank is awarded.","対人ランク戦サーバーを利用できません。ローカルでランクは付与しません。","真人排位服务器不可用，不授予本地评分。","Servidor de clasificación humana no disponible. No se otorga rango local.")); }
    finally { if (token === generation.current) setLoading(false); }
  }, [ready,apply]);
  useEffect(() => {
    ++generation.current; setProfile(null); setConsent(false); setOpponent(null); setError(""); setBusy(false); pending.current = null; inFlight.current = false;
    if (ready) void load(true); else setLoading(false);
    return () => { ++generation.current; };
  }, [ready,load]);
  async function perform(path: string, body: unknown) {
    if (!ready || inFlight.current || pending.current && (pending.current.path !== path || pending.current.body !== body)) return;
    const token = generation.current, seq = ++sequence.current;
    applied.current = seq; inFlight.current = true; pending.current = {path,body}; setBusy(true); setError("");
    try {
      const next = await humanRequest<HumanProfile>(path,body);
      if (token !== generation.current) return;
      apply(next,seq); pending.current = null;
    } catch (cause) {
      if (token !== generation.current) return;
      if (cause instanceof FastFoldError && cause.status === 409) { pending.current = null; inFlight.current = false; await load(); }
      else setError(t("Not confirmed. Retry the identical request; ranked actions are locked.","未確認です。同じリクエストを再試行してください。ランク操作は停止中です。","尚未确认。请重试同一请求；排位操作已锁定。","Sin confirmar. Reintenta la misma solicitud; las acciones están bloqueadas."));
    } finally { if (token === generation.current) { inFlight.current = false; setBusy(false); } }
  }
  const state = profile?.state, phase = state?.phase;
  const locked = !ready || loading || busy || Boolean(error) || Boolean(pending.current);
  const request = (path: string, extra: Record<string,unknown> = {}) => state && perform(path,{version:state.version,actionId:crypto.randomUUID(),...extra});
  const exit = () => phase && phase !== "out" ? request("break") : onBack();
  const remaining = phase === "break" && state?.breakExpiresAt != null ? ffBreakRemaining(state.breakExpiresAt,clock.current.serverNow,elapsed) : null;
  const expiredCheck = useRef<string | null>(null);
  useEffect(() => {
    if (!state || loading || !ready) return;
    if (phase === "break" && view !== "waiting") callbacks.current.onWaiting();
    else if (view === "waiting" && phase === "out") callbacks.current.onBack();
    else if (view === "waiting" && phase !== "break") callbacks.current.onPlay();
  }, [state,phase,view,loading,ready]);
  useEffect(() => {
    if (!ready || !phase || phase === "out") return;
    const tick = () => setElapsed(Math.max(0,performance.now()-clock.current.receivedAt));
    const refresh = () => { tick(); if (!inFlight.current && !pending.current && document.visibilityState !== "hidden") void load(); };
    const interval = window.setInterval(() => { tick(); if (current.current?.state.phase === "hand" || current.current?.state.phase === "reserved") refresh(); },5000);
    const heartbeat = window.setInterval(() => { const s=current.current?.state; if (s && ["queued","reserved","hand"].includes(s.phase) && !inFlight.current && !pending.current && !error) void perform("heartbeat",{version:s.version,actionId:crypto.randomUUID()}); },15000);
    const second = window.setInterval(tick,1000);
    window.addEventListener("focus",refresh); document.addEventListener("visibilitychange",refresh);
    return () => { clearInterval(interval);clearInterval(heartbeat);clearInterval(second);window.removeEventListener("focus",refresh);document.removeEventListener("visibilitychange",refresh); };
  }, [phase,ready,load,error]);
  useEffect(() => {
    if (remaining !== 0 || !state || locked) return;
    const key = `${state.version}:${state.breakExpiresAt}:${profile?.serverNow}`;
    if (expiredCheck.current === key) return;
    expiredCheck.current = key; void load();
  }, [remaining,state,locked,load,profile?.serverNow]);
  useEffect(() => { ++profileSequence.current; setOpponent(null); setProfileError(""); }, [phase,state?.match?.id]);
  async function showPlayer(id: string, match: HumanMatch) {
    const token = generation.current, matchId = match.id, requestSeq = ++profileSequence.current; setProfileError("");
    const participant = match.participants.find(p=>p.player.id === id)?.player;
    if (participant?.unavailable) { setOpponent(unavailableProfile(participant)); return; }
    try {
      const result = await humanRequest<{season:string;player:HumanOpponent}>(`opponent?player=${encodeURIComponent(id)}`);
      if (result.season !== "human-fastfold-v1") throw new FastFoldError("invalid_profile",503);
      const p = result.player;
      if (requestSeq !== profileSequence.current || token !== generation.current || current.current?.state.match?.id !== matchId || p.id !== id) return;
      if (p.unavailable) { setOpponent(unavailableProfile(p)); return; }
      setOpponent({name:p.name,kind:"human",type:p.style === "unknown" ? t("Unknown · insufficient samples","未判定・サンプル不足","未知 · 样本不足","Desconocido · muestras insuficientes") : p.style,avatar:<StyleAvatar id="collecting" color="#8a8f9c" size={64}/>,samples:p.stats?.hands,vpip:p.stats?.vpip?.percent,pfr:p.stats?.pfr?.percent});
    } catch { if (requestSeq === profileSequence.current && token === generation.current && current.current?.state.match?.id === matchId) {
      if (participant) setOpponent(unavailableProfile(participant));
      else setProfileError(t("Public profile unavailable.","公開プロフィールを取得できません。","公开资料不可用。","Perfil público no disponible."));
    } }
  }
  const rankPanel = state && <section className="agent-panel ff-human-rank"><h3>{t("Human ranked β","対人ランク β","真人排位 β","Clasificación humana β")}</h3><div className="ff-scorebar"><div><span>{t("Current rating","現在のレート","当前评分","Puntuación actual")}</span><strong>{ffNumber(state.rating)}</strong></div><div><span>{t("Rated hands","ランク対象ハンド","计分手数","Manos puntuadas")}</span><b>{state.hands}</b></div></div><dl className="ff-result-summary"><dt>{t("Net result","収支","净收益","Resultado")}</dt><dd>{ffNumber(state.netBb,true)} bb</dd><dt>bb/100</dt><dd>{ffNumber(state.bbPer100,true)}</dd></dl><p>{t("Human matches only · AI correction not applied","人間同士の対戦のみ・AI補正未適用","仅真人对局 · 无AI修正","Solo partidas humanas · sin corrección IA")}</p><RankLadder rating={state.rating} /></section>;
  const queuePanel = state && <><section className="agent-panel ff-human-queue" aria-live="polite"><h3>{t("Waiting for people","対人待ち","等待真人","Esperando personas")}</h3><strong>{state.queue.humans} / 6</strong><p>{t("Queue count includes you. Six people must accept before cards are dealt.","待機人数は自分を含みます。6人全員が参加を確定してから配札します。","人数包含自己。六人全部确认后才发牌。","El número te incluye. Las seis personas deben aceptar antes de repartir.")}</p><p>{t("Practice against Agents while waiting · not rated or saved to Agent history.","待つ間はAgent戦・ランク非加算／Agent履歴には保存しません。","等待时练习Agent对局 · 不计分、不写入Agent记录。","Practica con Agents mientras esperas · sin puntuación ni historial Agent.")}</p>{state.reservation && <p>{state.reservation.accepted ? t("Accepted. Waiting for everyone…","参加確定済み。全員の確定を待っています…","已确认，等待其他人…","Aceptado. Esperando a todos…") : t("Six people reserved. Joining after this Agent hand finishes.","6人分の席を確保しました。このAgentハンド終了後に参加します。","已预留六个席位。本手Agent结束后参加。","Seis plazas reservadas. Te unes al terminar esta mano Agent.")}</p>}</section>{rankPanel}</>;
  const top = <header className="agent-top ff-header">{phase !== "break" && <button type="button" className="agent-back ff-exit" disabled={locked && phase !== "out"} onClick={exit}><ArrowLeft size={16}/>{t("Exit","退出","退出","Salir")}</button>}<div className="agent-title"><strong>{t("Human ranked β","対人ランク β","真人排位 β","Clasificación humana β")}</strong><small>6-max · 100BB</small></div><button type="button" className="agent-toggle" onClick={onRanking}><Trophy size={16}/>{t("Leaderboard","ランキング","排行榜","Clasificación")}</button></header>;
  const status = <>{loading && <p role="status">{t("Connecting…","接続中…","连接中…","Conectando…")}</p>}{error && <div className="ff-error" role="alert"><p>{error}</p><button type="button" disabled={busy} onClick={() => pending.current ? perform(pending.current.path,pending.current.body) : load()}><ArrowClockwise size={16}/>{t("Retry","再試行","重试","Reintentar")}</button></div>}{profileError && <p role="alert">{profileError}</p>}</>;
  const accept = () => { const s=current.current?.state; if (s?.phase === "reserved" && s.reservation && !s.reservation.accepted && !pending.current && !inFlight.current && !error) void perform("accept",{version:s.version,actionId:crypto.randomUUID(),reservationId:s.reservation.id}); };
  if ((phase === "queued" || phase === "reserved") && ready) return <div className="ff-human-wait">{status}<AgentTablePage tableId="reyson-01" waitingMode onExit={exit} exitDisabled={locked} waitingHeader={t("Waiting for people · unrated Agent practice","対人待ち・ランク非加算Agent戦","等待真人 · 不计分Agent练习","Esperando personas · práctica Agent sin puntuación")} waitingSidebar={queuePanel} handoffKey={state?.reservation ? `${state.reservation.id}:${locked ? "locked" : "ready"}` : undefined} onHandBoundary={accept}/></div>;
  return <div className={`ff-arena agent-page${phase !== "hand" ? " is-lobby" : ""}`}>{top}{status}
    {!ready && <p>{t("Sign in and wait for human ranked readiness.","ログインと対人ランクサーバーの準備が必要です。","请登录并等待真人排位就绪。","Inicia sesión y espera al servidor de clasificación humana.")}</p>}
    {phase === "out" && <section className="ff-intro"><h2>{t("Six people, then a ranked hand.","人間6人が揃ってからランク戦。","六人到齐后开始排位。","Seis personas, después una mano clasificatoria.")}</h2><p>{t("Your anonymous Player name and results are public. Old Agent-ranked and quiz records remain separate. No human match starts with missing players.","匿名Player名と結果は公開されます。旧Agentランク・クイズ記録とは別です。人数不足で対人戦を開始しません。","匿名Player名称和结果公开。旧Agent排位及问答记录分开保留。人数不足不会开始真人对局。","Tu nombre anónimo Player y resultados son públicos. Los registros antiguos de Agents y cuestionarios siguen separados. No empieza una partida sin personas suficientes.")}</p><label><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>{t("I agree to public participation.","公開参加に同意します。","我同意公开参与。","Acepto participar públicamente.")}</label><button type="button" className="setup-start" disabled={locked || !consent} onClick={()=>request("join",{consent:true})}>{t("Join human queue","対人待機へ参加","加入真人队列","Unirse a la cola humana")}</button>{rankPanel}</section>}
    {phase === "break" && <section className="ff-waiting agent-panel"><h2>{t("Waiting room · break","待機所・休憩","等候室 · 休息","Sala de espera · descanso")}</h2><p>{t("You leave without pausing other players. Pending play folds; an existing all-in still settles at showdown. Resume returns to the human queue, not the old hand. The fixed break lasts 15 minutes.","他のプレイヤーを止めずに退出します。未完了の操作はフォールドとなり、すでにオールインした分はショーダウンで精算されます。復帰は元のハンドではなく対人待機へ戻ります。休憩期限は固定15分です。","离桌不会暂停其他人。待行动手牌弃牌，已全下部分仍在摊牌时结算。恢复后返回真人队列，而不是原手牌。休息固定15分钟。","Sales sin pausar a los demás. Las decisiones pendientes se retiran; un all-in previo se liquida en el showdown. Volver te lleva a la cola, no a la mano anterior. El descanso dura 15 minutos fijos.")}</p><strong className="ff-countdown" aria-live="off">{remaining == null ? "—" : `${Math.floor(Math.ceil(remaining/1000)/60).toString().padStart(2,"0")}:${(Math.ceil(remaining/1000)%60).toString().padStart(2,"0")}`}</strong>{remaining === 0 && <p>{t("Confirming expiry with the server. Offline? Retry.","サーバーに期限終了を確認中。オフラインの場合は再試行してください。","正在向服务器确认到期。离线时请重试。","Confirmando el vencimiento con el servidor. Sin conexión, reintenta.")}</p>}<div className="agent-buttons"><button type="button" className="agent-act tone-call" disabled={locked || remaining === 0} onClick={()=>request("resume")}>{t("Resume","復帰","继续","Volver")}</button><button type="button" className="agent-act" disabled={locked} onClick={()=>request("leave")}>{t("Leave now","今すぐ退出","立即退出","Salir ahora")}</button></div></section>}
    {phase === "hand" && state?.match && <HumanTable match={state.match} locked={locked} onAction={action=>perform("action",{tableId:state.match!.id,version:state.match!.version,actionId:crypto.randomUUID(),action})} onProfile={id=>showPlayer(id,state.match!)} sidebar={<>{opponent && <OpponentProfile profile={opponent} onClose={()=>{++profileSequence.current;setOpponent(null);}}/>}{rankPanel}</>}/>}
  </div>;
}
function HumanTable({match,locked,onAction,onProfile,sidebar}: {match:HumanMatch;locked:boolean;onAction:(key:string)=>void;onProfile:(id:string)=>void;sidebar:React.ReactNode}) {
  const {hand} = match, mine = hand.pending?.seat === match.hero;
  return <div className="agent-layout"><section className="agent-stage"><PokerTable board={hand.board} center={<div className="agent-pot"><span>{t("Pot","ポット","底池","Bote")}</span><b>{ffNumber(hand.pending?.pot)}</b><small>bb</small></div>}>
    {hand.seats.map((seat,i)=>{const p=match.participants.find(p=>p.seat===i)?.player;return <PokerSeat key={seat.position} slot={(i-match.hero+6)%6} human={i===match.hero} folded={seat.folded} acting={hand.pending?.seat===i} cards={hand.holeCards[seat.position] ?? ["",""]} showCards={Boolean(hand.holeCards[seat.position])} handKey={hand.id} position={seat.position} name={i===match.hero?t("You","あなた","你","Tú"):p?<span translate="no">{playerName(p)}</span>:"—"} fullName={p?playerName(p):undefined} stack={`${ffNumber(seat.stack)} bb`} avatar={i!==match.hero?<StyleAvatar id="collecting" color="#8a8f9c" size={50}/>:undefined} onProfile={p?()=>onProfile(p.id):undefined} profileLabel={p?`${t("Profile","プロフィール","资料","Perfil")}: ${playerName(p)}`:undefined}/>;})}
    {hand.seats.map((seat,i)=>seat.bet>0?<PokerChip key={seat.position} slot={(i-match.hero+6)%6} amount={`${ffNumber(seat.bet)} bb`}/>:null)}
  </PokerTable><footer className={`agent-actions${mine?" is-turn":""}`}><div className="agent-turn"><b>{mine?t("Your turn","あなたの番","轮到你","Tu turno"):t("Waiting for the other player","相手の操作待ち","等待对手行动","Esperando al otro jugador")}</b>{mine&&<small>{t("To call","コール額","跟注额","Para igualar")} {ffNumber(hand.pending?.toCall)} bb</small>}</div>{mine&&<div className="agent-buttons ff-actions">{hand.pending?.options.map(o=><PokerActionButton key={o.key} tone={o.key==="fold"?"fold":o.key==="check"?"check":o.key==="call"?"call":"raise"} disabled={locked} onClick={()=>onAction(o.key)}>{ffAction(o.key,o.key==="call"?hand.pending?.toCall:o.to)}</PokerActionButton>)}</div>}</footer></section><aside className="agent-side">{sidebar}<section className="agent-panel"><h3>{t("People at this table","この卓の人間プレイヤー","本桌真人","Personas en esta mesa")}</h3>{match.participants.map(p=><div className="ff-opponent" key={p.player.id}><button type="button" className="agent-mini-profile" onClick={()=>onProfile(p.player.id)} aria-label={`${t("Profile","プロフィール","资料","Perfil")}: ${playerName(p.player)}`}><StyleAvatar id="collecting" color="#8a8f9c" size={32}/></button><div><strong translate="no">{playerName(p.player)}</strong><small>{p.position} · {t("Style unknown","タイプ未判定","风格未知","Estilo desconocido")}</small></div></div>)}</section><section className="agent-panel agent-log"><h3>{t("This hand","このハンド","当前手牌","Esta mano")}</h3><ol className="ff-log">{hand.log.map((e,i)=><li key={i}><b>{hand.seats[e.seat]?.position}</b> {e.street} · {ffAction(e.action,e.to == null ? undefined : e.to/100)}</li>)}</ol></section></aside></div>;
}

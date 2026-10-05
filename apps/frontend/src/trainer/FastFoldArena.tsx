import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowClockwise, Play, Trophy } from '@phosphor-icons/react';
import { PokerTable, PokerSeat, PokerChip, PokerActionButton } from '../agent/PokerTable.tsx';
import { StyleAvatar } from '../agent/StyleAvatar.tsx';
import type { StyleId } from '../agent/player-read.ts';
import { fastFoldProfile, fastFoldRequest, FastFoldError, ffCopy as t, ffNumber, ffBreakRemaining, validFastFoldSession, validFastFoldState } from './fastfold-api.ts';
import type { FastFoldProfile, FastFoldResponse, FastFoldResult, FastFoldPosition } from './fastfold-api.ts';
import './fastfold.css';

const POSITIONS: FastFoldPosition[] = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
const STYLES: Record<string, StyleId> = { balanced: 'balanced', nit: 'nit', tag: 'tag', lag: 'lag', station: 'station', tight_passive: 'tight_passive', passive: 'passive', aggressive: 'aggressive', maniac: 'aggressive' };
function tendency(type: string) {
  const copy: Record<string, string> = {
    nit: t('Few pots; strong large raises; folds marginal hands.', '参加が狭く、大きなレイズは強い手中心。中位以下は降りやすい。', '参与较少；大加注偏强牌；边缘牌易弃。', 'Pocos botes; subidas grandes fuertes; retira manos marginales.'),
    station: t('Wide calls; weak suited hands and small pairs continue.', '広くコールし、弱いスーテッドや小さいペアも残しやすい。', '宽范围跟注；弱同花牌与小对子也继续。', 'Iguala amplio; continúa con cartas del mismo palo débiles y pares bajos.'),
    lag: t('Wide entries and frequent raises.', '広く参加し、レイズを多く選ぶ。', '参与广泛，加注较多。', 'Participa ampliamente y sube con frecuencia.'),
    maniac: t('Very wide, aggressive preflop raises.', '非常に広く参加し、プリフロップで積極的にレイズ。', '范围很宽，翻牌前积极加注。', 'Rango muy amplio y subidas preflop agresivas.'),
    balanced: t('Saved balanced AI estimate.', '保存済みのバランス型AI推定。', '已保存的平衡型AI估计。', 'Estimación IA equilibrada guardada.'),
  };
  return copy[type] ?? t('Tendency unavailable.', '傾向は未取得です。', '倾向不可用。', 'Tendencia no disponible.');
}

export function ffAction(key: string, to?: number): string {
  const name = key === 'fold' ? t('Fold', 'フォールド', '弃牌', 'Retirarse') : key === 'check' ? t('Check', 'チェック', '过牌', 'Pasar') : key === 'call' || key === 'limp' ? t('Call', 'コール', '跟注', 'Igualar') : ['all_in', 'allin'].includes(key) ? t('All-in', 'オールイン', '全下', 'Todo') : key.startsWith('bet') ? t('Bet', 'ベット', '下注', 'Apostar') : t('Raise', 'レイズ', '加注', 'Subir');
  return `${name}${to == null ? '' : ` ${ffNumber(to)} bb`}`;
}
export function FastFoldArena({ ready, view = "play", onBack, onWaiting = () => {}, onPlay = () => {}, onRanking, onProfile }: { ready: boolean; view?: "play" | "waiting"; onBack: () => void; onWaiting?: () => void; onPlay?: () => void; onRanking: () => void; onProfile: (profile: FastFoldProfile) => void }) {
  const [profile, setProfile] = useState<FastFoldProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [last, setLast] = useState<FastFoldResult | null>(null);
  const [consent, setConsent] = useState(false);
  const generation = useRef(0);
  const navigation = useRef({ onBack, onWaiting, onPlay }); navigation.current = { onBack, onWaiting, onPlay };
  const clock = useRef({ serverNow: 0, receivedAt: 0 });
  const [elapsed, setElapsed] = useState(0);
  const expiryChecked = useRef<string | null>(null);
  const inFlight = useRef(false);
  // Retain the id and exact body after uncertain delivery; Retry never sends a second bet.
  const pendingRequest = useRef<{ path: string; body: unknown } | null>(null);
  const apply = useCallback((next: FastFoldProfile) => { clock.current = { serverNow: next.serverNow, receivedAt: performance.now() }; setElapsed(0); setProfile(next); onProfile(next); }, [onProfile]);
  const load = useCallback(async (keepBreak = false) => {
    const token = ++generation.current;
    setLoading(true); setBusy(false); setError(''); if (!keepBreak) setProfile(null);
    try { const next = await fastFoldProfile(); if (token === generation.current) apply(next); }
    catch { if (token === generation.current) setError(t('Ranked server unavailable. No local rating is awarded.', 'ランク戦サーバーは利用できません。ローカルでレートは付与しません。', '排位服务器不可用。不会授予本地评分。', 'Servidor no disponible. No se otorga clasificación local.')); }
    finally { if (token === generation.current) setLoading(false); }
  }, [apply]);
  useEffect(() => { if (ready) void load(); else { ++generation.current; setProfile(null); setLast(null); setConsent(false); setBusy(false); setError(''); setLoading(false); inFlight.current = false; pendingRequest.current = null; } return () => { ++generation.current; }; }, [ready, load]);
  async function perform(path: string, body: unknown) {
    if (!ready || inFlight.current || (pendingRequest.current && (pendingRequest.current.path !== path || pendingRequest.current.body !== body))) return;
    const token = generation.current;
    inFlight.current = true; setBusy(true); setError(''); pendingRequest.current = { path, body };
    try {
      const response = await fastFoldRequest<FastFoldResponse>(path, body);
      if (token !== generation.current) return;
      if (!Number.isFinite(response.serverNow) || !validFastFoldState(response.state) || (response.session != null && !validFastFoldSession(response.session)) || (response.session == null && response.state.active != null)) throw new FastFoldError('invalid_state', 503);
      pendingRequest.current = null;
      apply({ ...profile!, enabled: true, season: 'fastfold-v1', serverNow: response.serverNow, state: { ...response.state, active: response.session } });
      if (response.lastResult) setLast(response.lastResult);
    } catch (cause) {
      if (token !== generation.current) return;
      if (cause instanceof FastFoldError && cause.status === 409) { pendingRequest.current = null; await load(); }
      else setError(t('Not confirmed. Actions are locked; retry the same request to avoid a duplicate.', '未確認です。操作を停止しています。同じリクエストを再試行し、重複を防ぎます。', '尚未确认。操作已锁定；请重试同一请求以避免重复。', 'Sin confirmar. Acciones bloqueadas; reintenta la misma solicitud para evitar duplicados.'));
    } finally { if (token === generation.current) { inFlight.current = false; setBusy(false); } else if (!pendingRequest.current) inFlight.current = false; }
  }
  const state = profile?.state, session = state?.active, hand = session?.hand;
  const locked = busy || Boolean(error) || loading || !ready;
  const start = () => perform('start', { consent: true });
  const breakDeadline = session?.status === 'paused' ? session.breakExpiresAt : undefined;
  const remaining = breakDeadline == null ? null : ffBreakRemaining(breakDeadline, clock.current.serverNow, elapsed);
  const exit = () => { if (session) void perform('break', { sessionId: session.id, version: session.version, actionId: crypto.randomUUID() }); else onBack(); };
  const resume = () => session && perform(breakDeadline == null ? 'start' : 'resume', breakDeadline == null ? { consent: true } : { sessionId: session.id, version: session.version });
  useEffect(() => {
    if (!profile || loading || !ready) return;
    if (breakDeadline != null && view !== 'waiting') navigation.current.onWaiting();
    else if (view === 'waiting' && !session) navigation.current.onBack();
    else if (view === 'waiting' && breakDeadline == null) navigation.current.onPlay();
  }, [profile, loading, ready, view, session, breakDeadline]);
  useEffect(() => {
    if (breakDeadline == null || !ready) return;
    const tick = () => setElapsed(Math.max(0, performance.now() - clock.current.receivedAt));
    const refresh = () => { tick(); if (!inFlight.current && !pendingRequest.current && document.visibilityState !== 'hidden') void load(true); };
    const timer = window.setInterval(tick, 1000);
    window.addEventListener('focus', refresh); document.addEventListener('visibilitychange', refresh);
    tick();
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [breakDeadline, ready, load]);
  useEffect(() => {
    if (remaining !== 0 || !session || !ready || loading || busy || error || pendingRequest.current) return;
    const key = `${session.id}:${breakDeadline}:${session.version}:${profile?.serverNow}`;
    if (expiryChecked.current === key) return;
    expiryChecked.current = key;
    void load(true);
  }, [remaining, session, ready, loading, busy, error, breakDeadline, load, profile?.serverNow]);
  const countdown = remaining == null ? '' : `${Math.floor(Math.ceil(remaining / 1000) / 60).toString().padStart(2, '0')}:${(Math.ceil(remaining / 1000) % 60).toString().padStart(2, '0')}`;
  const street = hand?.pending?.street ?? hand?.log.at(-1)?.street ?? 'preflop';
  const bets: Record<string, Record<string, number>> = { preflop: { SB: 0.5, BB: 1 } };
  for (const entry of hand?.log ?? []) if (entry.to != null) (bets[entry.street] ??= {})[entry.pos] = entry.to;
  const committed = (position: string) => Object.values(bets).reduce((sum, row) => sum + (row[position] ?? 0), 0);
  const rankSummary = <section className="agent-panel ff-rank-panel">
    <details className="ff-rating-method"><summary>{t("About this rating", "評価について", "关于评分", "Sobre esta puntuación")}</summary><p className="ff-method">{t('Experimental result rating · per-hand contribution capped at ±10 bb and shrunk by hands + 10,000. Not a calibrated skill estimate. AI comparison unavailable; applied penalty 0.', '実験的な収支レート：1ハンドの寄与は±10bbに制限し、ハンド数＋10,000で縮約。較正済みの実力評価ではありません。AI比較は未対応・適用減点0。', '实验性收益评分：单手贡献限制在±10bb，并按手数+10,000收缩。不是已校准的实力评估。AI比较不可用，扣分0。', 'Puntuación experimental: contribución limitada a ±10 bb por mano y ajustada por manos + 10.000. No mide habilidad calibrada. Comparación IA no disponible; penalización 0.')}</p></details>
    {state && <div className="ff-scorebar"><div><span>{t('Rating', 'レート', '评分', 'Puntuación')}</span><strong>{ffNumber(state.rating)}</strong><small>{state.provisional ? t('Provisional', '暫定', '暂定', 'Provisional') : t('Server confirmed', 'サーバー確定', '服务器确认', 'Confirmada')}</small></div><div><span>{t('Net result', '収支', '净收益', 'Resultado neto')}</span><b>{ffNumber(state.netBb, true)} bb</b></div><div><span>bb/100</span><b>{ffNumber(state.bbPer100, true)}</b></div><div><span>{t('Hands', 'ハンド', '手数', 'Manos')}</span><b>{state.hands.toLocaleString()}</b></div><div><span>{t('Applied AI penalty', 'AI減点の適用', '已应用AI扣分', 'Penalización IA aplicada')}</span><b>0</b><small>{t('Shadow only', 'shadowのみ', '仅影子分析', 'Solo análisis paralelo')}</small></div></div>}
  </section>;
  return <div className={`ff-arena agent-page${session ? "" : " is-lobby"}`}>
    <header className="agent-top ff-header">{breakDeadline == null && <button type="button" className="agent-back ff-exit" disabled={busy || Boolean(pendingRequest.current)} onClick={exit}><ArrowLeft size={16} />{t('Exit', '退出', '退出', 'Salir')}</button>}<div className="agent-title"><strong>FastFold β · {t('Ranked', 'ランク戦', '排位', 'Clasificatoria')}</strong><small>{hand ? `6-max 100BB · #${hand.number}` : t('Unlimited hands · server-ranked', 'ハンド無制限・サーバーランク戦', '不限手数 · 服务器排位', 'Sin límite de manos · clasificación del servidor')}</small></div><div className="agent-tools">{session?.status === 'paused' && breakDeadline == null && <button type="button" className="agent-toggle" disabled={locked} onClick={resume}><Play size={15} />{t('Resume', '再開', '继续', 'Continuar')}</button>}<button type="button" className="agent-toggle" onClick={onRanking}><Trophy size={16} />{t('Leaderboard', 'ランキング', '排行榜', 'Clasificación')}</button></div></header>
    {loading && <p role="status">{t('Connecting to ranked server…', 'ランク戦サーバーに接続中…', '正在连接排位服务器…', 'Conectando al servidor…')}</p>}
    {error && <div className="ff-error" role="alert"><p>{error}</p><button type="button" disabled={busy} onClick={() => pendingRequest.current ? perform(pendingRequest.current.path, pendingRequest.current.body) : load(breakDeadline != null)}><ArrowClockwise size={16} />{t('Retry', '再試行', '重试', 'Reintentar')}</button></div>}
    {!ready && <p role="status">{t('Sign in and wait for live server readiness.', 'ログインとサーバーの準備が必要です。', '需要登录及服务器就绪。', 'Inicia sesión y espera a que el servidor esté disponible.')}</p>}
    {profile && !session && <section className="ff-intro"><h2>{t('Play the opponents, not a quiz.', 'クイズではなく、相手を見てプレイ。', '面对对手，而不是答题。', 'Juega contra rivales, no un cuestionario.')}</h2><p>{t('Your anonymous Player name and ranked results are public. Rating is driven by server-settled results. Opponent-aware AI comparison is uncalibrated shadow analysis and applies no penalty. No GTO score or EV-loss claim.', '匿名のPlayer名とランク結果は公開されます。レートはサーバー確定の収支が主軸です。相手別のAI比較は未較正のshadow分析で減点しません。GTOスコア・EV損失ではありません。', '匿名Player名称和排位结果公开。评分以服务器结算收益为主。对手感知AI比较尚未校准，仅作影子分析，不扣分。不是GTO评分或EV损失。', 'Tu nombre anónimo Player y resultados son públicos. La puntuación se basa en resultados liquidados por el servidor. La comparación IA por rival no está calibrada y no penaliza. No es GTO ni pérdida de EV.')}</p><label><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} />{t('I agree to public participation.', '公開参加に同意します。', '我同意公开参与。', 'Acepto participar públicamente.')}</label><button type="button" className="setup-start" disabled={locked || !consent} onClick={start}><Play size={17} />{t('Start FastFold', 'FastFoldを開始', '开始FastFold', 'Empezar FastFold')}</button></section>}
    {session && breakDeadline != null ? <section className="ff-waiting agent-panel">
      <h2>{t('Waiting room · break', '待機所・休憩', '等候室 · 休息', 'Sala de espera · descanso')}</h2>
      <p>{t('You can resume the same hand for 15 minutes. After the fixed server deadline, your unfinished hand is settled as a fold and you leave the table. This is not matchmaking.', '15分以内は同じハンドから復帰できます。固定のサーバー期限後は未完了ハンドをフォールドとして精算し、卓から退出します。人とのマッチング待ちではありません。', '15分钟内可从同一手牌继续。固定服务器期限后，未完成手牌按弃牌结算并离桌。这不是匹配等待。', 'Puedes volver a la misma mano durante 15 minutos. Tras el plazo fijo del servidor, la mano pendiente se liquida como retirada y sales de la mesa. No es búsqueda de rivales.')}</p>
      <strong className="ff-countdown" aria-live="off" aria-label={t('Break time remaining', '休憩の残り時間', '剩余休息时间', 'Tiempo de descanso restante')}>{countdown}</strong>
      {remaining === 0 && <p role="status">{t('Break ended. Confirming your table exit with the server. If offline, retry the connection.', '休憩時間が終了しました。サーバーに退出を確認中です。オフラインの場合は接続を再試行してください。', '休息已结束。正在向服务器确认离桌。离线时请重试连接。', 'Descanso terminado. Confirmando la salida con el servidor. Sin conexión, reintenta.')}</p>}
      <div className="agent-buttons"><button type="button" className="agent-act tone-call ff-resume" disabled={locked || remaining === 0} onClick={resume}><Play size={15} />{t('Resume', '復帰', '继续', 'Volver a jugar')}</button><button type="button" className="agent-act ff-leave" disabled={locked} onClick={() => perform('leave', { sessionId: session.id, version: session.version, actionId: crypto.randomUUID() })}>{t('Leave now', '今すぐ退出', '立即退出', 'Salir ahora')}</button></div>
    </section> : session && hand ? <div className="agent-layout ff-play-layout"><section className="agent-stage">
      <PokerTable board={hand.board} paused={session.status === 'paused'} center={<div className="agent-pot"><span>{t('Pot', 'ポット', '底池', 'Bote')}</span><b>{ffNumber(hand.pending?.pot ?? hand.pot)}</b><small>bb</small></div>}>
        {POSITIONS.map((position, index) => {
          const slot = (index - POSITIONS.indexOf(hand.hero) + 6) % 6;
          const opponent = hand.opponents.find(item => item.position === position);
          const mine = hand.log.filter(entry => entry.pos === position);
          const folded = mine.some(entry => entry.action === 'fold');
          const latest = mine.at(-1);
          const bubble = latest?.street === street && (latest.action !== 'fold' || latest === hand.log.at(-1)) ? latest : null;
          const hero = position === hand.hero;
          const cards = hand.holeCards[position];
          return <PokerSeat key={position} slot={slot} human={hero} folded={folded} acting={session.status === 'active' && hand.pending?.pos === position}
            cards={cards ?? ['', '']} showCards={Boolean(cards)} handKey={hand.id} position={position}
            avatar={opponent ? <StyleAvatar id={STYLES[opponent.type] ?? 'collecting'} color="#a8b7d0" size={50} dim={folded} /> : undefined}
            name={hero ? t('You', 'あなた', '你', 'Tú') : opponent?.label ?? position} stack={`${ffNumber(100 - committed(position))} bb`}
            bubble={bubble ? <span className={`agent-bubble tone-${bubble.action === 'fold' ? 'fold' : bubble.action === 'check' ? 'check' : bubble.action === 'call' || bubble.action === 'limp' ? 'call' : 'raise'}`}>{ffAction(bubble.action)}</span> : null} />;
        })}
        {POSITIONS.map((position, index) => (bets[street]?.[position] ?? 0) > 0 ? <PokerChip key={position} slot={(index - POSITIONS.indexOf(hand.hero) + 6) % 6} amount={`${ffNumber(bets[street][position])} bb`} /> : null)}
      </PokerTable>
      <footer className={`agent-actions${session.status === 'active' ? ' is-turn' : ''}`}>
        {session.status === 'paused' ? <div className="ff-paused" role="status">{t('Paused. This hand stays on the server; resume from the same decision.', '一時停止中。このハンドはサーバーに保存され、同じ判断から再開します。', '已暂停。服务器保留当前手牌；从同一决策继续。', 'En pausa. El servidor conserva esta mano; continúa desde la misma decisión.')}</div> : <><div className="agent-turn"><b>{t('Your turn', 'あなたの番', '轮到你', 'Tu turno')}</b><small>{hand.hero} · {street} · {t('To call', 'コール額', '跟注额', 'Para igualar')} {ffNumber(hand.pending?.toCall)} bb</small></div><div className="agent-buttons ff-actions" aria-label={t('Your action', 'あなたの操作', '你的行动', 'Tu acción')}>{hand.pending?.options.map(option => <PokerActionButton key={option.key} tone={option.key === 'fold' ? 'fold' : option.key === 'check' ? 'check' : option.key === 'call' || option.key === 'limp' ? 'call' : 'raise'} className={`ff-action-${option.key === 'fold' ? 'fold' : option.key === 'call' || option.key === 'check' ? 'call' : 'raise'}`} disabled={locked} onClick={() => perform('action', { sessionId: session.id, version: session.version, actionId: crypto.randomUUID(), action: option.key })}>{ffAction(option.key, option.key === 'call' ? hand.pending?.toCall : option.to)}</PokerActionButton>)}</div></>}
      </footer>
    </section><aside className="agent-side">
      {rankSummary}
      <section className="agent-panel ff-opponents"><h3>{t('This table', 'この卓の相手', '本桌对手', 'Esta mesa')}</h3><p>{t('Types change authored preflop policy. Postflop uses balanced policy with partial coverage.', 'タイプは実際のプリフロップ方針です。ポストフロップはバランス型・部分対応です。', '类型影响实际翻牌前策略。翻牌后为平衡型且部分覆盖。', 'Los tipos cambian la política preflop. Postflop es equilibrada con cobertura parcial.')}</p>{hand.opponents.map(opponent => <div className="ff-opponent" key={opponent.position}><StyleAvatar id={STYLES[opponent.type] ?? 'collecting'} color="#a8b7d0" size={32} /><div><strong>{opponent.position} · {opponent.label}</strong><small>{opponent.type} · {t("Preflop", "プリフロップ", "翻牌前", "Preflop")}</small><p>{tendency(opponent.type)}</p></div></div>)}<details className="ff-rating-method"><summary>{t('Policy', '方針', '策略', 'Política')}</summary><p className="ff-method">{hand.policyVersion}</p></details></section>
      {(hand.policyMissing || hand.pending?.notice) && <p className="agent-panel ff-policy-notice" role="status">{t('Saved policy is missing for this decision. Only the server’s available actions are offered; this is not a recommended strategy.', 'この判断の保存済み方針は未収録です。サーバーが提供できる操作のみであり、推奨戦略ではありません。', '该决策的已保存策略缺失。仅提供服务器可用行动，并非推荐策略。', 'Falta la política guardada para esta decisión. Solo se ofrecen acciones disponibles del servidor, no una estrategia recomendada.')}</p>}
          {last && <section className="ff-last" aria-live="polite"><span>{t('Last settled hand', '直前の確定ハンド', '上一手结算', 'Última mano liquidada')}</span><strong>{ffNumber(last.netBb, true)} bb</strong><b>{ffNumber(last.afterRating - last.beforeRating, true)} {t('rating', 'レート', '评分', 'puntos')}</b><small>{t('AI shadow: unavailable · applied penalty 0', 'AI shadow：未分析 · 適用減点 0', 'AI影子：未分析 · 已应用扣分0', 'IA paralelo: sin análisis · penalización aplicada 0')}</small></section>}
      <section className="agent-panel agent-log"><h3>{t('This hand', 'このハンド', '当前手牌', 'Esta mano')}</h3><ol className="ff-log agent-log-body" aria-label={t('Action history', 'アクション履歴', '行动历史', 'Historial de acciones')}>{hand.log.map((entry, index) => <li key={index}><b>{entry.pos}</b> {entry.street} · {ffAction(entry.action, entry.to)}</li>)}</ol></section>
    </aside></div> : profile ? rankSummary : null}
  </div>;
}

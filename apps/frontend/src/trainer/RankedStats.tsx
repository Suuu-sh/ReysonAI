import { humanProfile, humanRankState } from "./human-api.ts";
import { Fragment, useEffect, useState } from 'react';
import { accountSnapshot, subscribeAccount } from '../account/session.ts';
import { RankBadge } from './RankBadge.tsx';
import { tierFor } from './rank-store.ts';
import { ffCopy as t, ffNumber } from './fastfold-api.ts';
import type { FastFoldProfile } from './fastfold-api.ts';
import { LoadingInline, Skeleton, SkeletonText } from '../components/Loading.tsx';
import { ScorebarSkeleton } from './ScorebarSkeleton.tsx';
import './fastfold.css';

export function RankedStats({ ready }: { rank?: unknown; ready: boolean }) {
  const [profile, setProfile] = useState<FastFoldProfile | null>(null);
  const [error, setError] = useState(false);
  const [account, setAccount] = useState(accountSnapshot);
  useEffect(() => subscribeAccount(() => setAccount(accountSnapshot())), []);
  const allowed = ready && account.ready && account.user?.verified && !account.error;
  useEffect(() => {
    let canceled = false; setProfile(null); setError(false);
    if (allowed) humanProfile().then(next => { if (!canceled) setProfile({...next,publicName:next.publicName ?? null,state:humanRankState(next.state)}); }).catch(() => { if (!canceled) setError(true); });
    return () => { canceled = true; };
  }, [allowed, account.user?.id]);
  if (!allowed || error) return <section className="analysis-card analysis-welcome" role="status"><h2>{t('Ranked stats unavailable', 'ランク戦Statsは利用できません', '排位统计不可用', 'Estadísticas no disponibles')}</h2><p>{t('Sign in and connect to the live ranked server. No local, drill or unranked Agent data is substituted.', 'ログインとランク戦サーバーの接続が必要です。ローカル・ドリル・通常Agent戦の記録は代用しません。', '需要登录并连接排位服务器。不替用本地、训练或普通Agent数据。', 'Inicia sesión y conecta al servidor. No se sustituyen datos locales, de ejercicios ni Agent sin clasificación.')}</p></section>;
  if (!profile) return <div className="analysis-ranked-stats" aria-busy="true">
    <LoadingInline className="ff-loading">{t('Loading confirmed FastFold results…', 'FastFold確定結果を読み込み中…', '正在加载FastFold确认结果…', 'Cargando resultados confirmados…')}</LoadingInline>
    <ScorebarSkeleton />
    <div className="ff-stats-grid" aria-hidden="true">{[5, 4, 4, 4].map((lines, index) => <section className="analysis-card" key={index}><Skeleton width="38%" height={12} /><SkeletonText lines={lines} className="ff-skeleton-card" /></section>)}</div>
  </div>;
  const state = profile.state, recent = [...state.recent].reverse();
  const points = recent.flatMap((item, index) => [[index, item.afterRating]]);
  const values = [recent[0]?.beforeRating ?? state.rating, ...points.map(point => point[1])];
  const min = Math.min(...values) - 10, max = Math.max(...values) + 10;
  const line = values.map((value, index) => `${20 + index * 560 / Math.max(1, values.length - 1)},${130 - (value - min) / (max - min) * 110}`).join(' ');
  const stats = state.actionStats;
  return <div className="analysis-ranked-stats">
    <p className="ff-empty">{t('Human FastFold · new season. Legacy Agent-ranked and quiz records remain separate.', '対人FastFold・新シーズン。旧Agentランク・クイズのレートと記録は別枠で保持します。', '真人FastFold · 新赛季。旧Agent排位及答题评分和记录独立保留。', 'FastFold humano · nueva temporada. El rango y registros anteriores de Agents y cuestionarios se mantienen separados.')}</p>
    <div className="ff-scorebar"><div><span>{t('Current rating', '現在のレート', '当前评分', 'Puntuación actual')}</span><strong>{ffNumber(state.rating)}</strong><small><RankBadge name={tierFor(state.rating).name} size={22} /> {state.provisional ? t('Provisional', '暫定', '暂定', 'Provisional') : t('Confirmed', '確定', '已确认', 'Confirmada')}</small></div><div><span>{t('Net result', '累計収支', '累计净收益', 'Resultado neto')}</span><b>{ffNumber(state.netBb, true)} bb</b></div><div><span>bb/100</span><b>{ffNumber(state.bbPer100, true)}</b></div><div><span>{t('Settled hands', '確定ハンド', '已结算手数', 'Manos liquidadas')}</span><b>{state.hands.toLocaleString()}</b></div><div><span>{t('Peak rating', '最高レート', '最高评分', 'Máxima puntuación')}</span><b>{ffNumber(state.peak)}</b></div></div>
    <div className="ff-stats-grid"><section className="analysis-card"><h2>{t('Rating trend', 'レート推移', '评分趋势', 'Evolución de puntuación')}</h2>{recent.length ? <><svg className="ff-chart" viewBox="0 0 600 150" role="img" aria-label={`${t('Rating', 'レート', '评分', 'Puntuación')}: ${values.map(value => ffNumber(value)).join(' → ')}`}><line x1="20" x2="580" y1="130" y2="130" /><polyline points={line} /></svg><p className="ff-empty">{t('Recent server-settled hands, oldest to newest.', '最近のサーバー確定ハンド・古い順。', '近期服务器结算手牌，从旧到新。', 'Manos recientes liquidadas, de más antigua a más nueva.')}</p></> : <p className="ff-empty">{t('No settled hands yet.', '確定したハンドはまだありません。', '暂无已结算手牌。', 'Aún no hay manos liquidadas.')}</p>}</section>
    <section className="analysis-card"><h2>{t('Result vs AI shadow', '収支とAI shadow', '收益与AI影子分析', 'Resultado e IA paralelo')}</h2><dl><dt>{t('Rating basis', 'レートの主軸', '评分依据', 'Base de puntuación')}</dt><dd>{t('Settled result', '確定収支', '结算收益', 'Resultado liquidado')}</dd><dt>{t('Baseline deviation', '基準方針との差', '基准偏差', 'Desviación base')}</dt><dd>—</dd><dt>{t('Opponent-aware deviation', '相手別方針との差', '对手感知偏差', 'Desviación por rival')}</dt><dd>—</dd><dt>{t('Applied penalty', '適用した減点', '已应用扣分', 'Penalización aplicada')}</dt><dd>0</dd></dl><p className="ff-empty">{t('Experimental result rating: ±10 bb per-hand cap, shrunk by hands + 10,000. AI comparison is unavailable and not calibrated. Unsupported decisions remain unanalyzed, never zero-loss decisions. No GTO score, EV loss or win-rate estimate.', '実験的な収支レートは1ハンド±10bbに制限し、ハンド数＋10,000で縮約。AI比較は未対応・未較正です。未対応の判断は未分析で、損失ゼロとして扱いません。GTOスコア・EV損失・勝率推定ではありません。', '实验性收益评分限制每手±10bb，并按手数+10,000收缩。AI比较不可用且未校准。不支持的决策视为未分析，不能视为零损失。不是GTO评分、EV损失或胜率估算。', 'Puntuación experimental: límite ±10 bb por mano y ajuste por manos + 10.000. Comparación IA no disponible ni calibrada. Decisiones no cubiertas quedan sin analizar, nunca como pérdida cero. No es GTO, pérdida de EV ni estimación de victorias.')}</p></section>
    <section className="analysis-card"><h2>{t('Action tendencies', '行動傾向', '行动倾向', 'Tendencias de acción')}</h2>{stats ? <dl>{([['vpip', 'VPIP'], ['pfr', 'PFR'], ['threeBet', '3bet'], ['foldToThreeBet', 'Fold to 3bet']] as const).map(([key, label]) => <Fragment key={key}><dt>{label}</dt><dd>{stats[key]?.percent == null ? '—' : `${ffNumber(stats[key].percent)}%`} <small>({stats[key]?.taken ?? 0}/{stats[key]?.opportunities ?? 0})</small></dd></Fragment>)}</dl> : <p className="ff-empty">{t('Individual ranked action analysis is unavailable.', '個別のランク戦アクション分析は未取得です。', '暂无排位单独行动分析。', 'No hay análisis individual de acciones disponible.')}</p>}<p className="ff-empty">{t('Latest 100 settled ranked hands: actions / opportunities. No animal label is inferred from a small sample.', '直近100確定ハンドの行動数／機会数。少数サンプルから動物ラベルを推測しません。', '仅使用排位服务器行动与机会数。不从小样本推断动物标签。', 'Solo acciones y oportunidades del servidor. No se infiere animal con pocas muestras.')}</p></section>
    <section className="analysis-card"><h2>{t('Analysis coverage', '分析の対応範囲', '分析覆盖范围', 'Cobertura de análisis')}</h2><dl><dt>{t('Settled results', '確定収支', '结算收益', 'Resultados liquidados')}</dt><dd>{state.hands}</dd><dt>{t('Opponent profiles', '相手タイプ', '对手类型', 'Perfiles de rivales')}</dt><dd>{t('Observed public samples only', '公開実測サンプルのみ', '仅公开实测样本', 'Solo muestras públicas observadas')}</dd><dt>{t('Postflop policy', 'ポストフロップ方針', '翻牌后策略', 'Política postflop')}</dt><dd>{t('Human decisions', '人間の操作', '真人决策', 'Decisiones humanas')}</dd><dt>{t('AI compared decisions', 'AI比較済み判断', '已比较AI决策', 'Decisiones comparadas IA')}</dt><dd>0</dd></dl></section></div>
    {recent.length > 0 && <section className="analysis-card stats-breakdown"><h2>{t('Recent settled hands', '最近の確定ハンド', '近期结算手牌', 'Manos recientes liquidadas')}</h2><div className="stats-table-wrap"><table className="stats-table"><thead><tr><th>{t('Seat', '席', '座位', 'Posición')}</th><th>{t('Net result', '収支', '净收益', 'Resultado')}</th><th>{t('Rating', 'レート', '评分', 'Puntuación')}</th><th>{t('Change', '増減', '变化', 'Cambio')}</th></tr></thead><tbody>{[...recent].reverse().map(item => <tr key={item.id}><td>{item.hero}</td><td>{ffNumber(item.netBb, true)} bb</td><td>{ffNumber(item.afterRating)}</td><td>{ffNumber(item.afterRating - item.beforeRating, true)}</td></tr>)}</tbody></table></div></section>}
  </div>;
}

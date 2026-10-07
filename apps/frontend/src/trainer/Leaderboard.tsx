import { SkeletonTable } from '../components/Loading.tsx';
import { humanRequest } from "./human-api.ts";
import { useEffect, useState } from 'react';
import { ArrowLeft } from '@phosphor-icons/react';
import { RankBadge, RankLadder } from './RankBadge.tsx';
import { displayTier } from './rank-store.ts';
import { ffCopy as t, ffNumber } from './fastfold-api.ts';
import type { FastFoldRow, FastFoldState } from './fastfold-api.ts';

// Only server-assigned global placements determine Legend, never the client list order.
export function Leaderboard({ rank, onBack }: { rank: Pick<FastFoldState, 'rating'> & Partial<Pick<FastFoldState, 'hands' | 'provisional'>>; profile?: unknown; onBack: () => void }) {
  const [rows, setRows] = useState<FastFoldRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  useEffect(() => {
    let canceled = false;
    humanRequest<{ season: string; rows: FastFoldRow[] }>('leaderboard').then(response => {
      if (canceled) return;
      if (response.season !== 'human-fastfold-v1' || !Array.isArray(response.rows)) throw new Error('invalid_leaderboard');
      setRows(response.rows);
    }).catch(() => { if (!canceled) setError(true); }).finally(() => { if (!canceled) setLoading(false); });
    return () => { canceled = true; };
  }, []);
  const me = rows.find(row => row.self);
  return <div className="leaderboard">
    <button type="button" className="config-edit lb-back" onClick={onBack}><ArrowLeft size={14} />{t('Trainer', 'トレーナー', '训练', 'Entrenador')}</button>
    <header className="trainer-home-head lb-head"><div><h1 className="trainer-home-eyebrow">LEADERBOARD</h1><p>{t('Human FastFold season · server-settled result rating. 100 settled hands required for placement. Legacy quiz ranking remains separate.', '対人FastFoldシーズン・確定収支によるレート順。順位には100確定ハンドが必要です。旧クイズのランキングは別枠です。', '真人FastFold赛季 · 按结算收益评分。排名需要100手结算手牌。旧答题排行独立保留。', 'Temporada FastFold humana · puntuación por resultados. Necesitas 100 manos liquidadas para aparecer. El rango anterior queda separado.')}</p></div></header>
    <section className="lb-me"><div className="lb-me-id"><RankBadge name={displayTier(rank.rating, me?.place ?? null)} size={44} /><div><strong translate="no">{me?.name ?? t('You', 'あなた', '你', 'Tú')}</strong><span>{t('FastFold · new season', 'FastFold・新シーズン', 'FastFold · 新赛季', 'FastFold · nueva temporada')}</span></div></div><dl className="lb-me-stats"><div><dt>{t('Rating', 'レート', '评分', 'Puntuación')}</dt><dd>{ffNumber(rank.rating)}</dd></div><div><dt>{t('Place', '順位', '排名', 'Posición')}</dt><dd>{me?.place ?? '—'}</dd></div><div><dt>{t('Settled hands', '確定ハンド', '结算手数', 'Manos liquidadas')}</dt><dd>{rank.hands ?? 0}</dd></div></dl><span className="lb-me-note">{rank.provisional ? t('Provisional', '暫定', '暂定', 'Provisional') : t('Server confirmed', 'サーバー確定', '服务器确认', 'Confirmada por servidor')}</span></section>
    {loading ? <SkeletonTable rows={8} columns={6} label={t('Loading server leaderboard…', 'サーバーランキングを読み込み中…', '正在加载服务器排行榜…', 'Cargando clasificación del servidor…')} /> : error ? <p role="alert">{t('Leaderboard unavailable. No local or sample rankings are shown.', 'ランキングを取得できません。ローカル記録やダミー順位は表示しません。', '排行榜不可用。不显示本地或示例排名。', 'Clasificación no disponible. No se muestran posiciones locales ni de muestra.')}</p> : rows.length ? <div className="sessions-table-scroll"><table className="leaderboard-table"><thead><tr><th>{t('Place', '順位', '排名', 'Posición')}</th><th>{t('Player', 'プレイヤー', '玩家', 'Jugador')}</th><th>{t('Rank', 'ランク', '级别', 'Rango')}</th><th>{t('Rating', 'レート', '评分', 'Puntuación')}</th><th>bb/100</th><th>{t('Hands', 'ハンド', '手数', 'Manos')}</th></tr></thead><tbody>{rows.map(row => <tr key={row.id} className={row.self ? 'self' : ''}><td>{row.place ?? '—'}</td><td><span className="leaderboard-player" translate="no">{row.name}</span></td><td><RankBadge name={displayTier(row.rating, row.place)} size={26} /></td><td>{ffNumber(row.rating)}</td><td>{ffNumber(row.bbPer100, true)}</td><td>{row.hands.toLocaleString()}</td></tr>)}</tbody></table></div> : <p className="ff-empty">{t('No placed players yet.', '順位のついたプレイヤーはまだいません。', '暂无已排名玩家。', 'Aún no hay jugadores clasificados.')}</p>}
    <p className="leaderboard-note">{t('New season only. Experimental result rating, not calibrated skill, GTO or win rate. Legend: server-issued top 10 among Master-rated players. AI shadow comparison is uncalibrated; applied penalty 0.', '新シーズンのみ。実験的な収支レートで、較正済みの実力・GTO・勝率ではありません。レジェンドはサーバー発行のマスターのうち上位10人。AI shadow比較は未較正・適用減点0。', '仅新赛季。实验性收益评分，不是已校准实力、GTO或胜率。传奇须服务器确认的大师玩家前10名。AI影子比较未校准，扣分0。', 'Solo nueva temporada. Puntuación experimental, no habilidad calibrada, GTO ni victorias. Legend requiere estar entre los 10 mejores Master según el servidor. IA sin calibrar; penalización aplicada 0.')}</p>
    <section className="lb-ladder"><RankLadder rating={rank.rating} /></section>
  </div>;
}

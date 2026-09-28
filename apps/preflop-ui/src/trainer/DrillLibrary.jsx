import { ArrowClockwise, PencilSimple, Play, Plus, Trash, Trophy } from "@phosphor-icons/react";
import { DIFFICULTY_OPTIONS, POSITIONS, spotsForSettings } from "./trainer-data.js";
import { drillStats } from "./drill-store.js";
import { RANKED_DAILY_LIMIT, RANKED_LENGTH, TIER_EN, playedToday, tierFor } from "./rank-store.js";
import { localized } from "../locale.js";

const pct = value => value == null ? "—" : `${Math.round(value * 100)}%`;

export function settingsSummary(settings) {
  const kinds = settings.kinds.length === 2 ? "オープン＋vs オープン" : settings.kinds[0] === "open" ? "オープン" : "vs オープン";
  const seats = settings.positions.length === POSITIONS.length ? "全席" : settings.positions.join("・");
  return [kinds, seats, settings.count ? `${settings.count}問` : "無制限", DIFFICULTY_OPTIONS.find(item => item.value === settings.difficulty)?.label];
}

function relativeDay(at) {
  if (!at) return "未挑戦";
  const days = Math.floor((Date.now() - at) / 86400000);
  return days <= 0 ? localized("Today", "今日") : days === 1 ? localized("Yesterday", "昨日") : localized(`${days} days ago`, `${days}日前`);
}

// Tiny accuracy trend: last attempts left to right, 0–100%.
export function Sparkline({ values, width = 88, height = 28 }) {
  if (values.length < 2) return <svg className="drill-spark empty" width={width} height={height} aria-hidden="true"><line x1="0" x2={width} y1={height - 2} y2={height - 2} /></svg>;
  const step = width / (values.length - 1);
  const points = values.map((value, index) => `${(index * step).toFixed(1)},${(height - 3 - value * (height - 6)).toFixed(1)}`);
  return <svg className="drill-spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
    <polyline className="area" points={`0,${height} ${points.join(" ")} ${width},${height}`} />
    <polyline points={points.join(" ")} />
    <circle cx={points.at(-1).split(",")[0]} cy={points.at(-1).split(",")[1]} r="3" />
  </svg>;
}

// Larger history chart for the result screen, with an 80% guide line.
export function HistoryChart({ values, highlightLast = true }) {
  const width = 520, height = 120, pad = 18;
  if (!values.length) return null;
  const step = values.length > 1 ? (width - pad * 2) / (values.length - 1) : 0;
  const y = value => height - pad - value * (height - pad * 2);
  const points = values.map((value, index) => [pad + index * step, y(value)]);
  return <svg className="drill-history" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`正答率の推移：${values.map(pct).join("、")}`}>
    {[0, 0.5, 1].map(line => <g key={line}><line className="grid" x1={pad} x2={width - pad} y1={y(line)} y2={y(line)} /><text x="0" y={y(line) + 4}>{line * 100}</text></g>)}
    <line className="goal" x1={pad} x2={width - pad} y1={y(0.8)} y2={y(0.8)} />
    {points.length > 1 && <polyline points={points.map(point => point.join(",")).join(" ")} />}
    {points.map(([cx, cy], index) => <circle key={index} cx={cx} cy={cy} r={highlightLast && index === points.length - 1 ? 5 : 3} className={highlightLast && index === points.length - 1 ? "last" : ""} />)}
  </svg>;
}

function DrillCard({ drill, draft, onStart, onEdit, onDelete }) {
  const stats = drillStats(drill);
  const spots = spotsForSettings(drill.settings).length;
  return <article className={`drill-card${draft ? " in-progress" : ""}`}>
    <header>
      <div>
        <h3>{drill.name}</h3>
        <ul className="drill-tags">{settingsSummary(drill.settings).map(tag => <li key={tag}>{tag}</li>)}</ul>
      </div>
      <div className="drill-card-tools">
        <button type="button" onClick={onEdit} aria-label={`${drill.name}を編集`} title="編集"><PencilSimple size={15} /></button>
        <button type="button" onClick={onDelete} aria-label={`${drill.name}を削除`} title="削除"><Trash size={15} /></button>
      </div>
    </header>
    <div className="drill-card-stats">
      <dl>
        <div><dt>ベスト</dt><dd className="best">{pct(stats.best)}</dd></div>
        <div><dt>平均</dt><dd>{pct(stats.average)}</dd></div>
        <div><dt>前回</dt><dd>{pct(stats.last)}</dd></div>
        <div><dt>挑戦</dt><dd>{stats.attempts}<small>{localized(stats.attempts === 1 ? " time" : " times", "回")}</small></dd></div>
      </dl>
      <Sparkline values={stats.trend} />
    </div>
    <footer>
      <small>{draft ? `途中保存 · ${draft.session.answered}問` : `${relativeDay(stats.lastAt)} · ${spots}局面`}</small>
      <button type="button" className={`drill-start${draft ? " resume" : ""}`} onClick={onStart} disabled={!spots}>
        {draft ? <ArrowClockwise size={14} weight="bold" /> : <Play size={14} weight="fill" />}{draft ? "続きから" : "開始"}
      </button>
    </footer>
  </article>;
}

export function DrillLibrary({ drills, reviewCount, drafts = {}, onStart, onEdit, onDelete, onCreate, onStartReview, rank, onStartRanked, onOpenRanking }) {
  const totals = drills.map(drillStats);
  const attempts = totals.reduce((sum, item) => sum + item.attempts, 0);
  const answered = totals.reduce((sum, item) => sum + item.answered, 0);
  const bestDrill = drills.map((drill, index) => ({ drill, best: totals[index].best })).filter(item => item.best != null).sort((a, b) => b.best - a.best)[0];
  return <div className="drill-library">
    <div className="library-head">
      <div>
        <h1>ドリル</h1>
        <p>設定を保存したドリルを繰り返し解いて、正答率の伸びを記録します。</p>
      </div>
      <dl className="library-totals">
        <div><dt>挑戦</dt><dd>{attempts}<small>{localized(attempts === 1 ? " time" : " times", "回")}</small></dd></div>
        <div><dt>回答</dt><dd>{answered}<small>{localized(answered === 1 ? " question" : " questions", "問")}</small></dd></div>
        {bestDrill && <div><dt><Trophy size={12} weight="fill" />ベスト</dt><dd>{pct(bestDrill.best)}<small>{bestDrill.drill.name}</small></dd></div>}
      </dl>
    </div>
    {rank && <RankedCard rank={rank} draft={drafts.ranked} onStart={onStartRanked} onOpenRanking={onOpenRanking} />}
    <div className="drill-grid">
      {(reviewCount > 0 || drafts.review) && <article className={`drill-card review${drafts.review ? " in-progress" : ""}`}>
        <header><div><h3>復習ドリル</h3><ul className="drill-tags"><li>以前ミスしたハンドだけ</li></ul></div></header>
        <p className="review-count"><strong>{drafts.review?.session.answered ?? reviewCount}</strong>{drafts.review ? "問を回答済み" : "ハンドが復習待ち"}</p>
        <footer><small>{drafts.review ? "途中保存されています" : "正解すると復習待ちから外れます"}</small>
          <button type="button" className={`drill-start${drafts.review ? " resume" : ""}`} onClick={onStartReview}>
            <ArrowClockwise size={14} weight="bold" />{drafts.review ? "続きから" : "復習する"}
          </button></footer>
      </article>}
      {drills.map(drill => <DrillCard key={drill.id} drill={drill} draft={drafts[drill.id]} onStart={() => onStart(drill)} onEdit={() => onEdit(drill)} onDelete={() => onDelete(drill)} />)}
      <button type="button" className="drill-card create" onClick={onCreate}><Plus size={22} weight="bold" /><strong>新しいドリルを作る</strong><small>出題範囲・席・問題数・難易度を選んで保存</small></button>
    </div>
  </div>;
}

function RankedCard({ rank, draft, onStart, onOpenRanking }) {
  const tier = tierFor(rank.rating);
  const left = Math.max(0, RANKED_DAILY_LIMIT - playedToday(rank));
  const canStart = Boolean(draft) || left > 0;
  return <article className={`ranked-card${draft ? " in-progress" : ""}`}>
    <div className="ranked-tier">
      <Trophy size={26} weight="fill" />
      <div><small>ランク</small><strong>{tier.name}</strong></div>
      <div><small>レート</small><strong>{rank.rating}</strong></div>
      <div><small>最高</small><strong>{rank.peak}</strong></div>
    </div>
    <div className="ranked-progress" aria-label={tier.next ? localized(`${tier.next.min - rank.rating} to ${TIER_EN[tier.next.name]}`, `${tier.next.name}まで あと${tier.next.min - rank.rating}`) : "最高ランク"}>
      <i style={{ "--progress": tier.progress }} />
      <small>{tier.next ? localized(`${tier.next.min - rank.rating} to ${TIER_EN[tier.next.name]}`, `${tier.next.name}まで あと${tier.next.min - rank.rating}`) : "最高ランクです"}</small>
    </div>
    <footer>
      <p><b>ランク戦</b> {localized(`All spots · standard difficulty · ${RANKED_LENGTH} questions. Harder hands move your rating more.`, `全局面・標準難易度・${RANKED_LENGTH}問。難しいハンドほどレートが大きく動きます。`)}</p>
      <small>{draft ? localized(`${draft.session.answered} answered`, `${draft.session.answered}問 回答済み`) : localized(`${left} / ${RANKED_DAILY_LIMIT} left today`, `今日の残り ${left} / ${RANKED_DAILY_LIMIT}回`)}</small>
      <button type="button" className="setup-secondary" onClick={onOpenRanking}>ランキング</button>
      <button type="button" className={`drill-start${draft ? " resume" : ""}`} disabled={!canStart} onClick={onStart}>
        <Play size={14} weight="fill" />{draft ? "続きから" : canStart ? "ランク戦に挑む" : "また明日"}
      </button>
    </footer>
  </article>;
}

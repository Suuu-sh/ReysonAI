import { RankBadge, RankLadder, tierColor } from "./RankBadge.tsx";
import { ArrowClockwise, Eye, PencilSimple, Play, Plus, Trash, Trophy } from "@phosphor-icons/react";
import { AGENT_TABLE } from "../agent/characters.ts";
import { AgentAvatar } from "../agent/AgentAvatar.tsx";
import { loadAgentHands, summarizeAgentHands } from "../agent/agent-stats.ts";
import { DIFFICULTY_OPTIONS, POSITIONS, spotsForSettings } from "./trainer-data.ts";
import { drillStats } from "./drill-store.ts";
import { RANKED_DAILY_LIMIT, RANKED_ENABLED, RANKED_LENGTH, TIER_EN, playedToday, tierFor } from "./rank-store.ts";
import { localized } from "../locale.ts";

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

export function DrillLibrary({ drills, reviewCount, drafts = {}, onStart, onEdit, onDelete, onCreate, onStartReview, rank, onStartRanked, onOpenRanking, onStartAgent = null }) {
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
    <div className="mode-stack">
      {onStartAgent && <AgentEntry onStart={onStartAgent} />}
      {rank && RANKED_ENABLED && <RankedCard rank={rank} draft={drafts.ranked} onStart={onStartRanked} onOpenRanking={onOpenRanking} />}
    </div>
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
  const color = tierColor(tier.name);
  return <section className={`mode-block is-ranked${draft ? " in-progress" : ""}`} style={{ "--mode-theme": color }}>
    <div className="mode-visual ranked-visual">
      <RankBadge name={tier.name} size={96} />
      <span className="ranked-tier-name">{localized(TIER_EN[tier.name], tier.name)}</span>
    </div>
    <div className="mode-body">
      <span className="mode-eyebrow">RANKED · {localized("Local progress", "このブラウザの記録")}</span>
      <h3>{localized("Ranked matches", "ランク戦")}</h3>
      <p>{localized(`All spots · standard difficulty · ${RANKED_LENGTH} questions. Harder hands move your rating more.`, `全局面・標準難易度・${RANKED_LENGTH}問。難しいハンドほどレートが大きく動きます。`)}</p>
      <div className="ranked-stats">
        <div><span>{localized("Rating", "レート")}</span><strong>{rank.rating.toLocaleString()}</strong></div>
        <div><span>{localized("Best", "自己最高")}</span><strong>{rank.peak.toLocaleString()}</strong></div>
        <div className="ranked-next">
          <span>{tier.next ? localized(`To ${TIER_EN[tier.next.name]}`, `${tier.next.name}まで`) : localized("Top rank", "最高ランク")}</span>
          <strong>{tier.next ? localized(`${tier.next.min - rank.rating} pts`, `あと${tier.next.min - rank.rating}`) : "—"}</strong>
          <span className="ranked-bar" aria-hidden="true"><b style={{ width: `${Math.round(tier.progress * 100)}%` }} /></span>
        </div>
      </div>
    </div>
    <div className="mode-actions">
      <button type="button" className="mode-primary" disabled={!canStart} onClick={onStart}>
        <Play size={14} weight="fill" />{draft ? localized("Resume", "続きから") : canStart ? localized("Play ranked", "ランク戦に挑む") : localized("Back tomorrow", "また明日")}
      </button>
      <button type="button" className="mode-secondary" onClick={onOpenRanking}><Trophy size={15} />{localized("Leaderboard", "ランキング")}</button>
      <small className="mode-quota">{draft ? localized(`${draft.session.answered} answered`, `${draft.session.answered}問 回答済み`) : localized(`${left} / ${RANKED_DAILY_LIMIT} left today`, `今日の残り ${left} / ${RANKED_DAILY_LIMIT}回`)}</small>
    </div>
    <div className="mode-foot"><RankLadder rating={rank.rating} /></div>
  </section>;
}

// Evion Agent: a six-handed table against agents that play the Evion solver estimate.
function AgentEntry({ onStart }) {
  const table = AGENT_TABLE;
  const record = summarizeAgentHands(loadAgentHands());
  const points = Math.round(record.netBb * 100);
  return <section className="mode-block is-agent" style={{ "--mode-theme": table.theme }}>
    <div className="mode-visual agent-lineup" aria-hidden="true">
      {table.agents.map((agent, index) => <span key={agent.id} className="agent-table-face" style={{ "--i": index }}>
        <AgentAvatar id={agent.id} color={agent.color} size={52} /><small>{agent.name.en}</small></span>)}
    </div>
    <div className="mode-body">
      <span className="mode-eyebrow">EVION AGENT · {table.name.en}</span>
      <h3>{localized("Agent table", "Agent戦")}</h3>
      <p>{localized("A 6-max table where every Agent plays the Evion solver estimate. Fold any time, then watch the rest or skip.", "全員がEvion solver（AI推定）通りに打つ6人卓。降りたら続きを観戦することも、スキップすることもできます。")}</p>
      <ul className="mode-facts">
        <li>6-max · 100BB</li><li>{localized("1BB = 100 pts", "1BB = 100点")}</li><li>{localized("Beta · heads-up flops only", "β版 · フロップはHUのみ")}</li>
        <li className="mode-record">{record.hands
          ? <>{localized(`${record.hands} hands`, `${record.hands}ハンド`)} · <b className={points > 0 ? "up" : points < 0 ? "down" : ""}>{points > 0 ? "+" : ""}{points.toLocaleString()}</b></>
          : localized("Not played yet", "まだ対戦していません")}</li>
      </ul>
    </div>
    <div className="mode-actions">
      <button type="button" className="mode-primary" onClick={() => onStart(table.id, false)}><Play size={14} weight="fill" />{localized("Sit down", "着席する")}</button>
      <button type="button" className="mode-secondary" onClick={() => onStart(table.id, true)}><Eye size={15} />{localized("Watch", "観戦")}</button>
    </div>
  </section>;
}

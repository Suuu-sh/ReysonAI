import { RankBadge, RankLadder, tierColor } from "./RankBadge.tsx";
import { ArrowClockwise, ArrowLeft, Eye, PencilSimple, Play, Plus, Trash, Trophy } from "@phosphor-icons/react";
import { ModeBlock } from "./ModeBlock.tsx";
import { practicePulse } from "./trainer-pulse.ts";
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
  const kind = drill.settings.kinds.length === 2 ? "MIX" : drill.settings.kinds[0] === "open" ? "OPEN" : "VS OPEN";
  return <article className={`drill-card${draft ? " in-progress" : ""}`}>
    <header>
      <div>
        <span className="drill-eyebrow">DRILL · {kind}</span>
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

// Trainer home: a heading with today's practice, any session to resume, and one mode block per way to practise.
export function TrainerHome({ drills, history = [], reviewCount, drafts = {}, onOpenDrills, onCreate, onStartReview, onResume, rank, onStartRanked, onOpenRanking, onStartAgent = null }) {
  const pulse = practicePulse(history);
  // Only drafts that can still be opened: ranked, review, or a drill that still exists.
  const resumable = Object.values(drafts).filter(draft => draft && ((RANKED_ENABLED && draft.key === "ranked") || draft.key === "review" || (draft.key !== "ranked" && drills.some(drill => drill.id === draft.key))))
    .sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0));
  return <div className="drill-library trainer-home">
    <header className="trainer-home-head">
      <div>
        <span className="trainer-home-eyebrow">TRAINER</span>
        <h1>{localized("Choose how to practise", "練習モードを選ぶ")}</h1>
        <p>{localized("Measure yourself in ranked, get table reps against the Agents, and drill your weak spots.", "ランク戦で実力を測り、Agent戦で実戦の感覚をつかみ、ドリルで苦手を反復します。")}</p>
      </div>
      <dl className="trainer-pulse" aria-label={localized("Today's practice", "今日の練習")}>
        <div><dt>{localized("Today", "今日の回答")}</dt><dd>{pulse.today}<small>{localized(" answers", "問")}</small></dd></div>
        <div><dt>{localized(`Accuracy · last ${pulse.recentCount || 50}`, `直近${pulse.recentCount || 50}問の正答率`)}</dt><dd>{pulse.accuracy == null ? "—" : `${Math.round(pulse.accuracy * 100)}%`}</dd></div>
        <div><dt>{localized("Streak", "連続練習")}</dt><dd>{pulse.streak}<small>{localized(pulse.streak === 1 ? " day" : " days", "日")}</small></dd></div>
      </dl>
    </header>
    {resumable.length > 0 && <section className="trainer-resume" aria-label={localized("Resume", "続きから")}>
      <span className="trainer-resume-label"><ArrowClockwise size={14} weight="bold" />{localized("In progress", "途中のセッション")}</span>
      <ul>{resumable.slice(0, 3).map(draft => <li key={draft.key}>
        <button type="button" onClick={() => onResume(draft.key)}>
          <b>{draft.key === "ranked" ? localized("Ranked match", "ランク戦") : draft.key === "review" ? localized("Review drill", "復習ドリル") : draft.drillName}</b>
          <small>{localized(`${draft.session?.answered ?? 0} answered`, `${draft.session?.answered ?? 0}問 回答済み`)}</small>
          <span>{localized("Resume", "続きから")} →</span>
        </button>
      </li>)}</ul>
    </section>}
    <div className="mode-stack">
      {RANKED_ENABLED ? rank && <RankedCard rank={rank} draft={drafts.ranked} onStart={onStartRanked} onOpenRanking={onOpenRanking} /> : <RankedComingSoon />}
      {onStartAgent && <AgentEntry onStart={onStartAgent} />}
      <DrillsBlock drills={drills} reviewCount={reviewCount} drafts={drafts} onOpen={onOpenDrills} onCreate={onCreate} onStartReview={onStartReview} />
    </div>
  </div>;
}

function DrillsBlock({ drills, reviewCount, drafts, onOpen, onCreate, onStartReview }) {
  const totals = drills.map(drillStats);
  const attempts = totals.reduce((sum, item) => sum + item.attempts, 0);
  const answered = totals.reduce((sum, item) => sum + item.answered, 0);
  const best = totals.map(item => item.best).filter(value => value != null).sort((a, b) => b - a)[0] ?? null;
  const trend = drills.flatMap(drill => (drill.sessions ?? []).map(session => ({ at: session.at ?? 0, rate: session.answered ? session.score / session.answered : null })))
    .filter(item => item.rate != null).sort((a, b) => a.at - b.at).slice(-12).map(item => item.rate);
  const inProgress = drills.filter(drill => drafts[drill.id]).length;
  return <ModeBlock theme="#f0609e" className="is-drills" visualClass="drills-visual" label={localized("Drills", "ドリル")}
    visual={<div className="drills-visual-card">
      <span>{localized("Best", "ベスト")}</span>
      <strong>{pct(best)}</strong>
      <Sparkline values={trend} width={150} height={34} />
      <small>{localized(`${drills.length} saved drills`, `保存ドリル ${drills.length}個`)}</small>
    </div>}
    eyebrow={`DRILLS · ${localized(`${drills.length} saved`, `${drills.length}個`)}`}
    title={localized("Drills", "ドリル")}
    description={localized("Repeat saved drills and track how your accuracy improves.", "設定を保存したドリルを繰り返し解いて、正答率の伸びを記録します。")}
    actions={<>
      <button type="button" className="mode-primary" onClick={onOpen}><Play size={14} weight="fill" />{localized("Open drills", "ドリルを開く")}</button>
      {reviewCount > 0 || drafts.review
        ? <button type="button" className="mode-secondary" onClick={onStartReview}><ArrowClockwise size={14} weight="bold" />{localized("Review", "復習する")}</button>
        : <button type="button" className="mode-secondary" onClick={onCreate}><Plus size={14} weight="bold" />{localized("New drill", "新しいドリル")}</button>}
    </>}>
    <ul className="mode-facts">
      <li className="mode-record">{localized(`${attempts} attempts`, `挑戦 ${attempts}回`)}</li>
      <li className="mode-record">{localized(`${answered} answers`, `回答 ${answered}問`)}</li>
      {reviewCount > 0 && <li>{localized(`${reviewCount} to review`, `復習待ち ${reviewCount}`)}</li>}
      {inProgress > 0 && <li>{localized(`${inProgress} in progress`, `途中保存 ${inProgress}`)}</li>}
    </ul>
  </ModeBlock>;
}

// Drills page: every saved drill, the review drill and the create card.
export function DrillLibrary({ drills, reviewCount, drafts = {}, onStart, onEdit, onDelete, onCreate, onStartReview, onBack }) {
  const totals = drills.map(drillStats);
  const attempts = totals.reduce((sum, item) => sum + item.attempts, 0);
  const answered = totals.reduce((sum, item) => sum + item.answered, 0);
  const bestDrill = drills.map((drill, index) => ({ drill, best: totals[index].best })).filter(item => item.best != null).sort((a, b) => b.best - a.best)[0];
  return <div className="drill-library">
    <div className="library-head">
      <div>
        <button type="button" className="config-edit drills-back" onClick={onBack}><ArrowLeft size={14} />{localized("Trainer", "トレーナー")}</button>
        <h1>{localized("Drills", "ドリル")}</h1>
        <p>{localized("Repeat saved drills and track how your accuracy improves.", "設定を保存したドリルを繰り返し解いて、正答率の伸びを記録します。")}</p>
      </div>
      <dl className="library-totals">
        <div><dt>{localized("Attempts", "挑戦")}</dt><dd>{attempts}<small>{localized(attempts === 1 ? " time" : " times", "回")}</small></dd></div>
        <div><dt>{localized("Answers", "回答")}</dt><dd>{answered}<small>{localized(answered === 1 ? " question" : " questions", "問")}</small></dd></div>
        {bestDrill && <div><dt><Trophy size={12} weight="fill" />{localized("Best", "ベスト")}</dt><dd>{pct(bestDrill.best)}<small>{bestDrill.drill.name}</small></dd></div>}
      </dl>
    </div>
    <div className="drill-grid">
      {(reviewCount > 0 || drafts.review) && <article className={`drill-card review${drafts.review ? " in-progress" : ""}`}>
        <header><div><span className="drill-eyebrow">DRILL · REVIEW</span><h3>復習ドリル</h3><ul className="drill-tags"><li>以前ミスしたハンドだけ</li></ul></div></header>
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

// Emblem inside a ring that fills toward the next tier, beside the tier name and the last five matches.
function RankedEmblem({ rank, tier }) {
  const radius = 54, length = 2 * Math.PI * radius;
  const recent = rank.matches.slice(-5);
  const last = rank.matches.at(-1);
  return <div className="ranked-emblem-wrap">
    <div className="ranked-emblem">
      <svg className="ranked-ring" viewBox="0 0 128 128" aria-hidden="true">
        <circle cx="64" cy="64" r={radius} className="track" />
        <circle cx="64" cy="64" r={radius} className="arc" strokeDasharray={`${length * tier.progress} ${length}`} />
        {Array.from({ length: 24 }, (_, i) => <line key={i} x1="64" y1="3" x2="64" y2={i % 6 === 0 ? 9 : 6} transform={`rotate(${i * 15} 64 64)`} className="tick" />)}
      </svg>
      <RankBadge name={tier.name} size={56} />
    </div>
    <div className="ranked-emblem-info">
      <span className="ranked-tier-name">{localized(TIER_EN[tier.name], tier.name)}</span>
      <small>{last ? <>{localized("Last match", "前回")} <b className={last.after >= last.before ? "up" : "down"}>{last.after >= last.before ? "▲" : "▼"}{Math.abs(last.after - last.before)}</b></> : localized("No matches yet", "まだ試合なし")}</small>
      <ol className="ranked-pips" aria-label={localized("Last five ranked matches", "直近5試合")}>
        {Array.from({ length: 5 }, (_, i) => {
          const match = recent[i - (5 - recent.length)];
          const up = match ? match.after >= match.before : null;
          return <li key={i} className={match ? (up ? "up" : "down") : "empty"}
            title={match ? `${up ? "+" : "−"}${Math.abs(match.after - match.before)}` : localized("No match", "試合なし")} />;
        })}
      </ol>
    </div>
  </div>;
}

function RankedComingSoon() {
  return <ModeBlock theme="#b7a0db" className="is-ranked is-coming-soon" visualClass="ranked-visual" label={localized("Ranked matches", "ランク戦")}
    visual={<Trophy size={64} weight="duotone" aria-hidden="true" />}
    eyebrow="RANKED"
    title={localized("Ranked matches", "ランク戦")}
    status={localized("Coming soon", "近日公開")}
    actions={<button type="button" className="mode-primary" disabled>{localized("Coming soon", "近日公開")}</button>} />;
}

function RankedCard({ rank, draft, onStart, onOpenRanking }) {
  const tier = tierFor(rank.rating);
  const left = Math.max(0, RANKED_DAILY_LIMIT - playedToday(rank));
  const canStart = Boolean(draft) || left > 0;
  return <ModeBlock theme={tierColor(tier.name)} className={`is-ranked${draft ? " in-progress" : ""}`} visualClass="ranked-visual" label={localized("Ranked matches", "ランク戦")}
    visual={<RankedEmblem rank={rank} tier={tier} />}
    eyebrow={`RANKED · ${localized("Local progress", "このブラウザの記録")}`}
    title={localized("Ranked matches", "ランク戦")}
    description={localized(`All spots · standard difficulty · ${RANKED_LENGTH} questions. Harder hands move your rating more.`, `全局面・標準難易度・${RANKED_LENGTH}問。難しいハンドほどレートが大きく動きます。`)}
    actions={<>
      <button type="button" className="mode-primary" disabled={!canStart} onClick={onStart}>
        <Play size={14} weight="fill" />{draft ? localized("Resume", "続きから") : canStart ? localized("Play ranked", "ランク戦に挑む") : localized("Back tomorrow", "また明日")}
      </button>
      <button type="button" className="mode-secondary" onClick={onOpenRanking}><Trophy size={15} />{localized("Leaderboard", "ランキング")}</button>
      <small className="mode-quota">{draft ? localized(`${draft.session.answered} answered`, `${draft.session.answered}問 回答済み`) : localized(`${left} / ${RANKED_DAILY_LIMIT} left today`, `今日の残り ${left} / ${RANKED_DAILY_LIMIT}回`)}</small>
    </>}
    foot={<RankLadder rating={rank.rating} />}>
    <div className="ranked-stats">
      <div><span>{localized("Rating", "レート")}</span><strong>{rank.rating.toLocaleString()}</strong></div>
      <div><span>{localized("Best", "自己最高")}</span><strong>{rank.peak.toLocaleString()}</strong></div>
      <div className="ranked-next">
        <span>{tier.next ? localized(`To ${TIER_EN[tier.next.name]}`, `${tier.next.name}まで`) : localized("Top rank", "最高ランク")}</span>
        <strong>{tier.next ? localized(`${tier.next.min - rank.rating} pts`, `あと${tier.next.min - rank.rating}`) : "—"}</strong>
        <span className="ranked-bar" aria-hidden="true"><b style={{ width: `${Math.round(tier.progress * 100)}%` }} /></span>
      </div>
    </div>
  </ModeBlock>;
}

// Reyson Agent: a six-handed table against agents that play the Reyson solver estimate.
function AgentEntry({ onStart }) {
  const table = AGENT_TABLE;
  const record = summarizeAgentHands(loadAgentHands());
  const points = Math.round(record.netBb * 100);
  return <ModeBlock theme={table.theme} className="is-agent" visualClass="agent-lineup" label={localized("Agent table", "Agent戦")}
    visual={table.agents.map((agent, index) => <span key={agent.id} className="agent-table-face" style={{ "--i": index }} aria-hidden="true">
      <AgentAvatar id={agent.id} color={agent.color} size={52} /><small>{agent.name.en}</small></span>)}
    eyebrow={`REYSON AGENT · ${table.name.en}`}
    title={localized("Agent table", "Agent戦")}
    status={localized("Beta", "β版")}
    description={localized("A 6-max table where every Agent plays the Reyson solver estimate. Fold any time, then watch the rest or skip.", "全員がReyson solver（AI推定）通りに打つ6人卓。降りたら続きを観戦することも、スキップすることもできます。")}
    actions={<>
      <button type="button" className="mode-primary" onClick={() => onStart(table.id, false)}><Play size={14} weight="fill" />{localized("Sit down", "着席する")}</button>
      <button type="button" className="mode-secondary" onClick={() => onStart(table.id, true)}><Eye size={15} />{localized("Watch", "観戦")}</button>
    </>}>
    <ul className="mode-facts">
      <li>6-max · 100BB</li><li>{localized("1BB = 100 pts", "1BB = 100点")}</li><li>{localized("Beta · heads-up flops only", "β版 · フロップはHUのみ")}</li>
      <li className="mode-record">{record.hands
        ? <>{localized(`${record.hands} hands`, `${record.hands}ハンド`)} · <b className={points > 0 ? "up" : points < 0 ? "down" : ""}>{points > 0 ? "+" : ""}{points.toLocaleString()}</b></>
        : localized("Not played yet", "まだ対戦していません")}</li>
    </ul>
  </ModeBlock>;
}

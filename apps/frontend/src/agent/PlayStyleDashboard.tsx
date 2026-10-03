import { Crosshair, Hourglass, X } from "@phosphor-icons/react";
import { localized } from "../i18n.ts";
import { AGENT_BASELINE, READ_MIN_HANDS, READ_WINDOW, type PlayerRead } from "./player-read.ts";

const pct = (value: number | null | undefined) => value == null ? "—" : `${Math.round(value * 100)}%`;
const text = (value: { ja: string; en: string }) => localized(value.en, value.ja);

type Row = { key: string; label: string; hint: [string, string]; you: number | null; base: number | null; samples: number; ratio?: boolean };

function StatRow({ row }: { row: Row }) {
  const max = row.ratio ? 4 : 1;
  const width = (value: number | null) => `${Math.min(100, Math.max(0, (value ?? 0) / max * 100))}%`;
  const delta = row.you != null && row.base != null ? row.you - row.base : null;
  const shown = (value: number | null) => row.ratio ? (value == null ? "—" : value.toFixed(2)) : pct(value);
  return <li className="style-row" title={localized(row.hint[0], row.hint[1])}>
    <div className="style-row-label"><b>{row.label}</b><small>{localized(row.hint[0], row.hint[1])}</small></div>
    <div className="style-row-track" aria-hidden="true">
      <i className="you" style={{ width: width(row.you) }} />
      {row.base != null && <i className="base" style={{ left: width(row.base) }} />}
    </div>
    <div className="style-row-values">
      <strong>{shown(row.you)}</strong>
      <small>{localized("Agent", "Agent")} {shown(row.base)}{delta != null && Math.abs(delta) >= (row.ratio ? 0.1 : 0.01)
        ? <em className={delta > 0 ? "plus" : "minus"}>{delta > 0 ? "+" : ""}{row.ratio ? delta.toFixed(2) : `${Math.round(delta * 100)}pt`}</em> : null}</small>
    </div>
  </li>;
}

// Style map: the centre is the agents' balanced play.
function StyleMap({ read }: { read: PlayerRead }) {
  const point = read.map;
  return <figure className="style-map" aria-label={point ? localized(`Style map: ${text(read.style.name)}`, `スタイルマップ：${text(read.style.name)}`) : localized("Style map (collecting hands)", "スタイルマップ（集計中）")}>
    <div className="style-map-grid">
      <span className="q tl">{localized("Tight · aggressive", "タイト・アグレッシブ")}</span>
      <span className="q tr">{localized("Loose · aggressive", "ルース・アグレッシブ")}</span>
      <span className="q bl">{localized("Tight · passive", "タイト・パッシブ")}</span>
      <span className="q br">{localized("Loose · passive", "ルース・パッシブ")}</span>
      <span className="style-map-center" title={localized("Agent baseline", "Agent基準")} />
      {point && <span className="style-map-point" style={{ left: `${50 + point.x * 44}%`, top: `${50 - point.y * 44}%` }} />}
    </div>
    <figcaption><span>← {localized("Tight", "タイト")}</span><span>{localized("Centre = Agent baseline", "中心 = Agent基準")}</span><span>{localized("Loose", "ルース")} →</span></figcaption>
  </figure>;
}

export function PlayStyleDashboard({ read, onClose }: { read: PlayerRead; onClose?: () => void }) {
  const s = read.stats, b = AGENT_BASELINE;
  const rows: Row[] = [
    { key: "vpip", label: "VPIP", hint: ["Hands you put money in voluntarily", "自分から参加したハンドの割合"], you: s.vpip, base: b.vpip, samples: read.hands },
    { key: "pfr", label: "PFR", hint: ["Hands you raised preflop", "プリフロップでレイズした割合"], you: s.pfr, base: b.pfr, samples: read.hands },
    { key: "3bet", label: "3bet", hint: ["3bets when facing one raise", "1回レイズを受けた場面での3bet率"], you: s.threeBet, base: b.threeBet, samples: s.samples.threeBetOpp },
    { key: "f3b", label: localized("Fold to 3bet", "3betにフォールド"), hint: ["Folds after your open was 3bet", "オープンが3betされたときのフォールド率"], you: s.foldToThreeBet, base: b.foldToThreeBet, samples: s.samples.facedThreeBet },
    { key: "wtsd", label: "WTSD", hint: ["Showdowns among flops seen", "フロップを見てショーダウンまで行った割合"], you: s.wtsd, base: b.wtsd, samples: s.samples.sawFlop },
    { key: "wsd", label: "W$SD", hint: ["Showdowns won", "ショーダウンで勝った割合"], you: s.wsd, base: b.wsd, samples: s.samples.showdown },
    { key: "ftb", label: localized("Fold to bet", "ベットにフォールド"), hint: ["Folds when facing a postflop bet", "フロップ以降でベットを受けたときのフォールド率"], you: s.foldToBet, base: b.foldToBet, samples: s.samples.pfFacing },
    { key: "af", label: "AF", hint: ["Postflop (bets + raises) / calls", "フロップ以降の（ベット＋レイズ）÷コール"], you: s.af, base: b.af, samples: s.samples.pfCalls, ratio: true },
  ];
  const confidence = read.confidence === "settled" ? localized("Settled", "判定済み") : read.confidence === "provisional" ? localized("Provisional", "暫定") : localized("Collecting", "集計中");
  return <section className="style-dash" aria-label={localized("Your play style", "あなたのプレイスタイル")}>
    <header className="style-dash-head">
      <div>
        <span className="style-dash-eyebrow">{localized("AGENT READ", "AGENTの読み")}</span>
        <h2>{localized("Your play style", "あなたのプレイスタイル")}</h2>
        <small>{localized(`Latest ${read.hands} of ${READ_WINDOW} hands`, `直近 ${read.hands} / ${READ_WINDOW} ハンド`)} · <b className={`conf-${read.confidence}`}>{confidence}</b></small>
      </div>
      {onClose && <button type="button" className="style-dash-close" onClick={onClose} aria-label={localized("Close", "閉じる")}><X size={16} weight="bold" /></button>}
    </header>
    <div className="style-window" aria-hidden="true"><i style={{ width: `${Math.min(100, read.hands / READ_WINDOW * 100)}%` }} /></div>

    <div className="style-dash-top">
      <div className="style-label">
        <span>{localized("Style", "スタイル")}</span>
        <strong>{text(read.style.name)}</strong>
        <p>{text(read.style.summary)}</p>
      </div>
      <StyleMap read={read} />
    </div>

    <ul className="style-rows">{rows.map(row => <StatRow key={row.key} row={row} />)}</ul>

    <div className="style-exploit">
      <header><Crosshair size={14} weight="bold" /><b>{localized("What the agents would target", "Agentが狙う傾向")}</b></header>
      {read.confidence === "collecting"
        ? <p className="style-empty">{localized(`The agents start reading you after ${READ_MIN_HANDS} hands.`, `${READ_MIN_HANDS}ハンドを超えると、Agentがあなたの傾向を読み始めます。`)}</p>
        : read.tendencies.length
          ? <ul>{read.tendencies.map(item => <li key={item.id}>
              <div><b>{text(item.label)}</b><small>{item.stat} {item.stat === "AF" ? item.you.toFixed(2) : pct(item.you)} · Agent {item.stat === "AF" ? item.base.toFixed(2) : pct(item.base)}</small></div>
              <span>{text(item.target)}</span>
            </li>)}</ul>
          : <p className="style-empty">{localized("No clear gap from the agents' baseline yet.", "Agent基準との大きな差はまだ見つかっていません。")}</p>}
      <p className="style-status"><Hourglass size={13} weight="bold" />{localized(
        "Exploiting is coming: once opponent-adjusted range tables exist, the agents will switch their strategy to this read. For now they all play the balanced Evion solver estimate.",
        "エクスプロイトは準備中です。相手像別のレンジ表ができると、Agentはこの読みに合わせて打ち方を切り替えます。今は全員が均衡（Evion solver）通りに打っています。")}</p>
    </div>
    <p className="style-note">{localized("Practice tendencies at the Agent table only; not a diagnosis of real-money play. Kept in this browser.", "Agent卓での練習傾向です（実戦の診断ではありません）。記録はこのブラウザ内だけに保存されます。")}</p>
  </section>;
}

// Compact card for the table's side panel.
export function PlayStyleCard({ read, onOpen }: { read: PlayerRead; onOpen: () => void }) {
  const s = read.stats;
  return <button type="button" className="style-card" onClick={onOpen}>
    <span className="style-card-head"><span>{localized("Agent read", "Agentの読み")}</span><small>{read.hands}/{READ_WINDOW}</small></span>
    <strong>{text(read.style.name)}</strong>
    <span className="style-card-stats"><span>VPIP <b>{pct(s.vpip)}</b></span><span>PFR <b>{pct(s.pfr)}</b></span><span>3bet <b>{pct(s.threeBet)}</b></span></span>
    <span className="style-card-more">{localized("Open dashboard", "ダッシュボードを開く")} →</span>
  </button>;
}

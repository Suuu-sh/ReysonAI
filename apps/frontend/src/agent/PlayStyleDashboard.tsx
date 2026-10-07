import type { CSSProperties } from "react";
import { Crosshair, Hourglass, X } from "@phosphor-icons/react";
import { localized } from "../i18n.ts";
import { AGENT_BASELINE, READ_MIN_HANDS, READ_WINDOW, STYLES, type PlayerRead, type StyleId } from "./player-read.ts";
import { StyleAvatar } from "./StyleAvatar.tsx";
import { StyleMap, type StyleZone } from "./StyleMap.tsx";
import { ffCopy as t } from "../trainer/fastfold-api.ts";

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

// Every style's character, the current one lit.
const ROSTER: StyleId[] = ["nit", "tight_passive", "tag", "passive", "balanced", "aggressive", "station", "lag"];
function StyleRoster({ current }: { current: StyleId }) {
  return <ol className="style-roster style-roster-compact" aria-label={localized("Play styles", "プレイスタイル一覧")}>
    {ROSTER.map(id => { const style = STYLES[id], on = id === current;
      return <li key={id} className={on ? "is-current" : ""} aria-current={on ? "true" : undefined} title={text(style.summary)} style={{ "--style": style.color } as CSSProperties}>
        <StyleAvatar id={id} color={style.color} size={40} dim={!on} />
        <span>{text(style.name)}</span>
      </li>; })}
  </ol>;
}

// Style zones on the map, in percent. They mirror classifyPlayer in player-read.ts: x = looseness / 0.2
// (tight < -0.06, nit < -0.12, loose > 0.06) and y = aggression / 0.35 (passive < -0.15, aggressive > 0.15),
// placed at 50 + v * 44 like the player's point.
const ZX = { nit: 23.6, tight: 36.8, loose: 63.2 }, ZY = { aggressive: 31.1, passive: 68.9 };
const MAP_ZONES: StyleZone[] = [
  { id: "nit", x: [0, ZX.nit], y: [0, 100] },
  { id: "tag", x: [ZX.nit, ZX.tight], y: [0, ZY.passive] },
  { id: "tight_passive", x: [ZX.nit, ZX.tight], y: [ZY.passive, 100] },
  { id: "aggressive", x: [ZX.tight, ZX.loose], y: [0, ZY.aggressive] },
  { id: "balanced", x: [ZX.tight, ZX.loose], y: [ZY.aggressive, ZY.passive] },
  { id: "passive", x: [ZX.tight, ZX.loose], y: [ZY.passive, 100] },
  { id: "lag", x: [ZX.loose, 100], y: [0, ZY.passive] },
  { id: "station", x: [ZX.loose, 100], y: [ZY.passive, 100] },
];

// The existing Agent classifier supplies its own scale and population.
function AgentStyleMap({ read }: { read: PlayerRead }) {
  const point = read.map;
  const s = read.stats, ratio = s.vpip ? s.pfr! / s.vpip : 0;
  const dx = s.vpip == null ? null : s.vpip - AGENT_BASELINE.vpip;
  const dy = ratio - AGENT_BASELINE.pfr / AGENT_BASELINE.vpip;
  return <StyleMap source="agent" zones={MAP_ZONES} current={read.style.id}
    point={point ? { x: 50 + point.x * 44, y: 50 - point.y * 44, style: read.style,
      provisional: read.confidence !== "settled", clipped: Math.abs(dx!) > .2 || Math.abs(dy) > .35,
      description: `VPIP ${pct(s.vpip)}; PFR/VPIP ${ratio.toFixed(2)}` } : null}
    baseline={t("Agent baseline", "Agent基準", "Agent基准", "Referencia de Agent")}
    horizontal={t("VPIP difference", "VPIPの差", "VPIP差值", "Diferencia de VPIP")}
    vertical={t("PFR/VPIP difference", "PFR/VPIPの差", "PFR/VPIP差值", "Diferencia de PFR/VPIP")}
    yTop={t("More raises", "レイズ多", "加注较多", "Más subidas")} yBottom={t("Fewer raises", "レイズ少", "加注较少", "Menos subidas")}
    waiting={t("Shown after 30 hands", "30ハンド以上で表示", "30手后显示", "Visible tras 30 manos")}
    explanation={t("The centre is the Agent baseline. Horizontal: VPIP minus baseline; vertical: PFR/VPIP minus baseline. Latest 1,000 saved Agent hands; a point appears at 30 hands and stays provisional until 300. These are Agent-table practice tendencies.",
      "中心はAgent基準。横軸はVPIPの差、縦軸はPFR/VPIPの差です。直近1,000件の保存済みAgentハンドを使い、30ハンドで点を表示し300ハンドまでは暫定です。Agent卓での練習傾向です。",
      "中心为Agent基准。横轴为VPIP差，纵轴为PFR/VPIP差。使用最近1,000手已保存的Agent牌局；30手显示点，300手前为暂定。这是Agent桌练习倾向。",
      "El centro es la referencia de Agent. Eje horizontal: diferencia de VPIP; vertical: diferencia de PFR/VPIP. Últimas 1.000 manos guardadas de Agent; punto desde 30, provisional hasta 300. Son tendencias de práctica en mesas Agent.")} />;
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
      <div className="style-dash-summary">
        <div className="style-label" style={{ "--style": read.style.color } as CSSProperties}>
          <StyleAvatar id={read.style.id} color={read.style.color} size={76} />
          <div>
            <span>{localized("Style", "スタイル")} · {text(read.style.mascot)}</span>
            <strong>{text(read.style.name)}</strong>
            <p>{text(read.style.summary)}</p>
          </div>
        </div>
        <StyleRoster current={read.style.id} />
      </div>
      <AgentStyleMap read={read} />
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
        "Exploiting is coming: once opponent-adjusted range tables exist, the agents will switch their strategy to this read. For now they all play the balanced Reyson solver estimate.",
        "エクスプロイトは準備中です。相手像別のレンジ表ができると、Agentはこの読みに合わせて打ち方を切り替えます。今は全員が均衡（Reyson solver）通りに打っています。")}</p>
    </div>
    <p className="style-note">{localized("Practice tendencies at the Agent table only; not a diagnosis of real-money play. Kept in this browser.", "Agent卓での練習傾向です（実戦の診断ではありません）。記録はこのブラウザ内だけに保存されます。")}</p>
  </section>;
}

// Compact card for the table's side panel.
export function PlayStyleCard({ read, onOpen }: { read: PlayerRead; onOpen: () => void }) {
  const s = read.stats;
  return <button type="button" className="style-card" onClick={onOpen}>
    <span className="style-card-head"><span>{localized("Agent read", "Agentの読み")}</span><small>{read.hands}/{READ_WINDOW}</small></span>
    <span className="style-card-who"><StyleAvatar id={read.style.id} color={read.style.color} size={40} /><span><strong>{text(read.style.name)}</strong><small>{text(read.style.mascot)}</small></span></span>
    <span className="style-card-stats"><span>VPIP <b>{pct(s.vpip)}</b></span><span>PFR <b>{pct(s.pfr)}</b></span><span>3bet <b>{pct(s.threeBet)}</b></span></span>
    <span className="style-card-more">{localized("Open dashboard", "ダッシュボードを開く")} →</span>
  </button>;
}

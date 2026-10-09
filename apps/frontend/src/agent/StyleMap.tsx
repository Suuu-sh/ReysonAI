import { useId, type CSSProperties } from "react";
import { Info } from "@phosphor-icons/react";
import { ffCopy as t } from "../trainer/fastfold-api.ts";
import { STYLES, type PlayStyle, type StyleId } from "./player-read.ts";
import { StyleAvatar } from "./StyleAvatar.tsx";

export type StyleZone = { id: StyleId; x: [number, number]; y: [number, number]; label?: boolean };
type Point = { x: number; y: number; style: PlayStyle; provisional: boolean; clipped: boolean; description: string };
type Props = {
  source: "agent" | "drills"; zones: StyleZone[]; current: StyleId | null; point: Point | null;
  baseline: string; horizontal: string; vertical: string; yTop: string; yBottom: string;
  waiting: string; explanation: string; baselineRadius?: number;
};

export function styleTypeName(id: StyleId) {
  const names: Record<StyleId, [string, string, string, string]> = {
    collecting: ["Collecting", "集計中", "收集中", "Recopilando"],
    nit: ["Nit", "NIT", "极紧型", "Nit"],
    tight_passive: ["Tight-passive", "タイト・パッシブ", "紧弱型", "Conservador pasivo"],
    tag: ["TAG", "TAG", "TAG", "TAG"],
    balanced: ["Balanced", "バランス型", "平衡型", "Equilibrado"],
    passive: ["Passive-leaning", "パッシブ寄り", "偏被动", "Tendencia pasiva"],
    aggressive: ["Aggressive-leaning", "アグレッシブ寄り", "偏激进", "Tendencia agresiva"],
    station: ["Calling station", "コーリングステーション", "跟注站", "Pagador habitual"],
    lag: ["LAG", "LAG", "LAG", "LAG"],
  };
  return t(...names[id]);
}

// Shared presentation only. Each caller supplies its original classifier, scale,
// sample thresholds and source-specific meaning; no model or storage changes here.
export function StyleMap(props: Props) {
  const id = useId(), { point } = props;
  const you = t("You", "あなた", "你", "Tú");
  const provisional = t("Provisional", "暫定", "暂定", "Provisional");
  return <section className="shared-style-map" data-style-source={props.source} aria-labelledby={id}>
    <header className="shared-style-map-head">
      <h2 id={id}>{t("Play-style map", "プレイスタイルマップ", "游戏风格图", "Mapa de estilo de juego")}</h2>
      <details className="analysis-info">
        <summary aria-label={t("How to read the map", "マップの見方", "如何阅读图表", "Cómo leer el mapa")}><Info size={14} /></summary>
        <div className="analysis-info-body"><p>{props.explanation}</p></div>
      </details>
    </header>
    <figure className="play-style-map" aria-label={`${props.horizontal}; ${props.vertical}`}>
      <span className="play-style-map-y" aria-hidden="true"><span>↑<br />{props.yTop}</span><span>{props.yBottom}<br />↓</span></span>
      <div className="play-style-map-grid">
        {props.zones.map((zone, index) => {
          const style = STYLES[zone.id], on = props.current === zone.id;
          const name = styleTypeName(zone.id);
          const description = `${name} · ${props.source === "agent"
            ? t("Region based on VPIP and PFR/VPIP differences from the Agent baseline.", "Agent基準に対するVPIPとPFR/VPIPの差で分けた領域です。", "按VPIP及PFR/VPIP相对Agent基准的差异划分的区域。", "Región según diferencias de VPIP y PFR/VPIP respecto a la referencia de Agent.")
            : t("Region based on participation and 3bet differences from the same-question estimate.", "同じ問題の推定値に対する参加率と3bet率の差で分けた領域です。", "按参与率及3bet率相对同题估计的差异划分的区域。", "Región según diferencias de participación y 3bet respecto a la estimación de las mismas preguntas.")}`;
          return <span key={index} className={`style-zone${on ? " is-current" : ""}`} title={description}
            style={{ left: `${zone.x[0]}%`, width: `${zone.x[1] - zone.x[0]}%`, top: `${zone.y[0]}%`, height: `${zone.y[1] - zone.y[0]}%`, "--style": style.color } as CSSProperties}>
            {zone.label !== false && <>{!on && <StyleAvatar id={zone.id} color={style.color} size={22} dim />}<small>{name}</small></>}
          </span>;
        })}
        {props.baselineRadius != null && <span className="play-style-map-baseline" aria-hidden="true" style={{ "--r": `${props.baselineRadius}%` } as CSSProperties} />}
        <span className="play-style-map-center" aria-hidden="true" title={props.baseline} />
        {point ? <>
          <svg className="play-style-map-trail" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><line x1="50" y1="50" x2={point.x} y2={point.y} pathLength="1" /></svg>
          <span className={`play-style-map-point${point.y > 70 ? " label-above" : ""}${point.x < 25 ? " label-left" : point.x > 75 ? " label-right" : ""}`} role="img" aria-label={`${you}: ${point.description}${point.provisional ? `; ${provisional}` : ""}`}
            style={{ left: `${point.x}%`, top: `${point.y}%`, "--style": point.style.color } as CSSProperties}>
            {point.style.id === "collecting" ? <i /> : <StyleAvatar id={point.style.id} color={point.style.color} size={36} />}<b>{you}{point.provisional ? ` · ${provisional}` : ""}</b>
          </span>
        </> : <span className="play-style-map-wait">{props.waiting}</span>}
      </div>
      <figcaption className="play-style-map-x"><span>← {t("Tight", "タイト", "紧", "Cerrado")}</span><span>{t("Loose", "ルース", "松", "Abierto")} →</span></figcaption>
    </figure>
    <div className="shared-style-map-legend"><span><i className="map-you-key" />{you}</span><span><i className="map-baseline-key" />{props.baseline}</span></div>
    <p className="shared-style-map-metrics">{props.horizontal} · {props.vertical}</p>
    {point?.clipped && <p className="shared-style-map-metrics">{t("Position capped at the map edge; recorded values are unchanged.", "位置はマップ端で制限しています。記録値は変更していません。", "位置限制在图表边缘，记录值未变。", "Posición limitada al borde; los valores registrados no cambian.")}</p>}
  </section>;
}

import { useId } from "react";
import type { ReactNode } from "react";
import { productLocale } from "../locale.ts";
import "./agent.css";
export const profileCopy = (en: string, ja: string, zh: string, es: string) => ({ en, ja, "zh-CN": zh, es })[productLocale()];
export type OpponentProfileData = { name: string; avatar: ReactNode; kind: "agent" | "human"; type: string; description?: string; samples?: number; vpip?: number | null; pfr?: number | null; unavailable?: boolean };
export function OpponentProfile({ profile, onClose }: { profile: OpponentProfileData; onClose: () => void }) {
  const id = useId();
  return <section className="agent-panel agent-profile-block" role="region" aria-labelledby={id}>
    <header><div aria-hidden="true">{profile.avatar}</div><h3 id={id} translate="no">{profile.name}</h3><button type="button" onClick={onClose}>{profileCopy("Close", "閉じる", "关闭", "Cerrar")}</button></header>
    <p>{profile.unavailable ? profileCopy("Public profile unavailable", "公開プロフィールを利用できません", "公开资料不可用", "Perfil público no disponible") : profile.kind === "human" ? profileCopy("Human · public ranked profile", "人間・公開ランクプロフィール", "真人 · 公开排位资料", "Persona · perfil público de clasificación") : profileCopy("Agent · AI-estimated policy", "Agent・AI推定方針", "Agent · AI估计策略", "Agent · política estimada por IA")}</p>
    <strong>{profile.type}</strong>{profile.description && <p>{profile.description}</p>}
    {profile.unavailable ? <p>{profileCopy("No public identity or statistics are available for this seat.", "この席の公開情報・統計は利用できません。", "此座位没有可用的公开身份或统计资料。", "No hay identidad ni estadísticas públicas disponibles para este asiento.")}</p> : profile.kind === "agent" ? <p>{profileCopy("Style applies to preflop only. Postflop is balanced with partial coverage; not GTO or a guarantee of results.", "タイプはプリフロップのみ。ポストフロップはバランス型・部分対応で、GTOや収益の保証ではありません。", "风格仅适用于翻牌前。翻牌后为平衡型且部分覆盖；不是GTO或收益保证。", "El estilo solo se aplica preflop. Postflop es equilibrado con cobertura parcial; no es GTO ni garantiza resultados.")}</p> : <>
      <p>{profileCopy("Only server-public samples are shown. Small samples have no established style.", "サーバーの公開サンプルのみ表示。少数サンプルのタイプは未確定です。", "仅显示服务器公开样本。样本不足时风格未确定。", "Solo muestras públicas del servidor. Con pocas muestras no hay estilo establecido.")}</p>
      <dl><dt>{profileCopy("Hands sampled", "集計ハンド", "样本手数", "Manos de muestra")}</dt><dd>{profile.samples ?? "—"}</dd><dt>VPIP</dt><dd>{profile.vpip == null ? "—" : `${profile.vpip}%`}</dd><dt>PFR</dt><dd>{profile.pfr == null ? "—" : `${profile.pfr}%`}</dd></dl>
    </>}
  </section>;
}

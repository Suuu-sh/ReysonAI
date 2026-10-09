import type { InputAdjustment, InputOpponentProfile } from "../../scripts/postflop-ai/types.ts";
import type { PlayerRole } from "../../scripts/postflop-ai/tree.ts";
import { localized } from "../i18n.ts";
import nit from "./profiles/nit/villain/meta.json" with { type: "json" };
import station from "./profiles/station/villain/meta.json" with { type: "json" };
import lag from "./profiles/lag/villain/meta.json" with { type: "json" };
import maniac from "./profiles/maniac/villain/meta.json" with { type: "json" };
import { Panel, StatusState } from "../components/primitives.tsx";

const metadata = { nit, station, lag, maniac };
export const POSTFLOP_OPPONENT_PROFILES: readonly InputOpponentProfile[] = ["standard", "nit", "station", "lag", "maniac"];
export function opponentProfileCopy(profile: InputOpponentProfile) {
  if (profile === "standard") return {
    name: localized("Standard", "標準"),
    description: localized("Use the saved standard AI policy without an opponent archetype.", "特定の相手像を仮定せず、保存済みの標準AI方針を使います。"),
  };
  const meta = metadata[profile];
  return { name: localized(meta.name.en, meta.name.ja), description: localized(meta.description.en, meta.description.ja) };
}

// The opponent seat is fixed together with the flop, so it lives in the flop dialog
// rather than beside each decision.
export function OpponentSeatField({ seat, positions, onChange }: {
  seat: PlayerRole; positions: { ip: string | null; oop: string | null }; onChange?: (seat: PlayerRole) => void;
}) {
  return <div className="postflop-profile-field opponent-seat-field">
    <span className="postflop-profile-label">{localized("Opponent seat", "相手の席")}</span>
    <div className="display-mode-toggle" role="group" aria-label={localized("Opponent seat", "相手の席")}>
      {(["oop", "ip"] as const).map(value => <button type="button" key={value} aria-pressed={value === seat}
        disabled={!positions[value] || !onChange} onClick={() => onChange?.(value)}>{positions[value] ?? "—"} · {value.toUpperCase()}</button>)}
    </div>
  </div>;
}

export function PostflopProfileSettings({ profile, seat, positions, onProfileChange }: {
  profile: InputOpponentProfile; seat?: PlayerRole; positions?: { ip: string | null; oop: string | null };
  onProfileChange?: (profile: InputOpponentProfile) => void;
}) {
  const opponent = seat && positions?.[seat];
  return <Panel className="postflop-profile-settings">
    <div className="postflop-profile-controls">
      <div className="postflop-profile-field">
        <span className="postflop-profile-label">{localized("Opponent tendencies", "相手の傾向")}{opponent && <small className="postflop-profile-seat"> · {localized("Opponent", "相手")} {opponent}</small>}</span>
        <div className="display-mode-toggle" role="group" aria-label={localized("Opponent tendencies", "相手の傾向")}>
          {POSTFLOP_OPPONENT_PROFILES.map(value => <button type="button" key={value} aria-pressed={value === profile}
            disabled={!onProfileChange} onClick={() => onProfileChange?.(value)} title={opponentProfileCopy(value).description}>{opponentProfileCopy(value).name}</button>)}
        </div>
      </div>
    </div>
    <p className="postflop-profile-description">{opponentProfileCopy(profile).description}</p>
  </Panel>;
}

export function ProfilePolicyPreparing({ onRestoreStandard }: { onRestoreStandard?: () => void }) {
  return <Panel className="postflop-profile-preparing">
    <StatusState title={localized("Opponent profile policy is being prepared", "この相手像の方針は準備中です")}>
      {localized("No saved policy is available for this opponent profile and decision. Standard frequencies are not substituted.", "この相手像・判断の保存方針はまだありません。標準の頻度では代用しません。")}
    </StatusState>
    <button type="button" className="secondary-button" disabled={!onRestoreStandard} onClick={onRestoreStandard}>{localized("Return to Standard", "標準に戻す")}</button>
  </Panel>;
}

export function PostflopProfileNote({ profile, adjusted }: {
  profile: InputOpponentProfile; adjusted?: InputAdjustment;
}) {
  return <div className="postflop-profile-note">
    {adjusted && <small className="postflop-adjusted-marker">{localized("Adjusted for table / opponent tendencies", "卓の状況／相手の傾向に合わせて調整")}</small>}
    {profile !== "standard" && <p>{localized("These frequencies are AI decisions assuming the opponent is {0}.", "この頻度は相手が{0}の前提でのAIの判断です。").replace("{0}", opponentProfileCopy(profile).name)}</p>}
  </div>;
}

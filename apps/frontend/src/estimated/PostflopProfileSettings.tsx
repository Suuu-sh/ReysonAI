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
    description: localized("No specific opponent type. Uses the standard AI policy.", "相手像を仮定しない、標準のAI方針です。"),
  };
  const meta = metadata[profile];
  return { name: localized(meta.name.en, meta.name.ja), description: localized(meta.description.en, meta.description.ja) };
}

// Opponent assumptions are fixed together with the flop, so they live in the flop dialog
// rather than beside each decision.
export function OpponentSeatField({ seat, positions, onChange }: {
  seat: PlayerRole; positions: { ip: string | null; oop: string | null }; onChange?: (seat: PlayerRole) => void;
}) {
  return <div className="postflop-profile-field opponent-seat-field">
    <span className="postflop-profile-label">{localized("Which player is the opponent?", "どちらが相手？")}</span>
    <div className="opponent-seat-options" role="group" aria-label={localized("Opponent seat", "相手の席")}>
      {(["oop", "ip"] as const).map(value => {
        const opponent = value === seat;
        return <button type="button" key={value} className="opponent-seat-option" aria-pressed={opponent}
          disabled={!positions[value] || !onChange} onClick={() => onChange?.(value)}>
          <span className="opponent-seat-position">{positions[value] ?? "—"}<small>{value === "ip" ? localized("In position", "IP") : localized("Out of position", "OOP")}</small></span>
          <span className="opponent-seat-role">{opponent ? localized("Opponent", "相手") : localized("You", "あなた")}</span>
        </button>;
      })}
    </div>
  </div>;
}

export function OpponentProfileField({ profile, onChange }: { profile: InputOpponentProfile; onChange?: (profile: InputOpponentProfile) => void }) {
  return <div className="postflop-profile-field">
    <span className="postflop-profile-label">{localized("Opponent type", "相手のタイプ")}</span>
    <div className="opponent-profile-options" role="group" aria-label={localized("Opponent tendencies", "相手の傾向")}>
      {POSTFLOP_OPPONENT_PROFILES.map(value => {
        const copy = opponentProfileCopy(value);
        return <button type="button" key={value} className="opponent-profile-option" aria-pressed={value === profile}
          disabled={!onChange} onClick={() => onChange?.(value)}>
          <span className="opponent-profile-check" aria-hidden="true" />
          <span className="opponent-profile-text"><strong>{copy.name}</strong><small>{copy.description}</small></span>
        </button>;
      })}
    </div>
  </div>;
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

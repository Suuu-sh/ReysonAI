import { Club, Diamond, Heart, Lightning, Moon, Spade, Star, User } from "@phosphor-icons/react";
import { DEFAULT_PROFILE_AVATAR, PROFILE_AVATARS, profileAvatar, type ProfileAvatarId } from "../../../shared/profile-avatar.ts";

const icons = { person: User, spade: Spade, diamond: Diamond, club: Club, heart: Heart, star: Star, moon: Moon, bolt: Lightning } as const;
export { DEFAULT_PROFILE_AVATAR, PROFILE_AVATARS, profileAvatar };
export type { ProfileAvatarId };
export function ProfileAvatar({ avatar, size = 28, className = "" }: { avatar?: string | null; size?: number; className?: string }) {
  const Icon = icons[profileAvatar(avatar)];
  return <span className={`profile-avatar ${className}`} style={{ width: size, height: size }} aria-hidden="true"><Icon size={Math.round(size * .55)} weight="regular" /></span>;
}

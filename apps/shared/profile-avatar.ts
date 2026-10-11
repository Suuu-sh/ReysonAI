// Public, user-selectable avatar IDs. Do not accept URLs or arbitrary icon names.
export const PROFILE_AVATARS = ["person", "spade", "diamond", "club", "heart", "star", "moon", "bolt"] as const;
export type ProfileAvatarId = (typeof PROFILE_AVATARS)[number];
export const DEFAULT_PROFILE_AVATAR: ProfileAvatarId = "person";
export function isProfileAvatar(value: unknown): value is ProfileAvatarId {
  return typeof value === "string" && (PROFILE_AVATARS as readonly string[]).includes(value);
}
export function profileAvatar(value: unknown): ProfileAvatarId {
  return isProfileAvatar(value) ? value : DEFAULT_PROFILE_AVATAR;
}

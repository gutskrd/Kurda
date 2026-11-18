/**
 * The activity sections a profile can show: the same five as `api/src/social/profile-activity.ts`, in the order both
 * apps show them. This list must stay in step with the server's, which would accept an unknown key and drop it
 * silently.
 */
export const PROFILE_SECTIONS = ['posts', 'games', 'likes', 'reposts', 'saved'] as const;

export type ProfileSection = (typeof PROFILE_SECTIONS)[number];

/**
 * Which of them a profile shows. Partial: the server sends only what has been set, and an absent key means shown, so
 * read it as `!== false`.
 */
export type ProfileSections = Partial<Record<ProfileSection, boolean>>;

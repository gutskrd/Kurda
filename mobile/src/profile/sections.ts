/**
 * The activity sections a profile can show.
 *
 * The same five the server names in `api/src/social/profile-activity.ts`, in
 * the order both apps display them. The server builds its request schema from
 * its own list rather than repeating it, after the two drifted once and a
 * toggle for a new section was accepted with a 200 and silently dropped — so
 * this list is the one thing here that has to stay in step with it.
 */
export const PROFILE_SECTIONS = ['posts', 'games', 'likes', 'reposts', 'saved'] as const;

export type ProfileSection = (typeof PROFILE_SECTIONS)[number];

/**
 * Which of them a profile shows.
 *
 * Partial on purpose: the server sends back only what has been set, and an
 * absent key means shown. Reading it as `!== false` rather than `=== true`
 * keeps a section that nobody has ever touched visible.
 */
export type ProfileSections = Partial<Record<ProfileSection, boolean>>;

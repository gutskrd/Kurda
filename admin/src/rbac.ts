/**
 * Admin app nav gating (KUR-099). Maps the capabilities the API reports (from
 * `GET /admin/me`) to which nav sections are shown. This is COSMETIC ONLY —
 * hiding a link is not access control. Every admin action is authorized again
 * server-side by the API's `requireAdmin` guard; this just avoids showing a user
 * links they can't use.
 */

export type Capability =
  | 'content.edit'
  | 'content.publish'
  | 'users.view'
  | 'users.moderate'
  | 'economy.view'
  | 'economy.adjust'
  | 'fraud.review'
  | 'events.manage'
  | 'admins.manage';

export interface NavSection {
  key: string;
  label: string;
  /** Shown when the admin has at least one of these capabilities. */
  requires: Capability[];
}

export const NAV_SECTIONS: NavSection[] = [
  { key: 'content', label: 'Content', requires: ['content.edit', 'content.publish'] },
  { key: 'users', label: 'Users', requires: ['users.view', 'users.moderate'] },
  { key: 'moderation', label: 'Moderation', requires: ['users.moderate'] },
  { key: 'economy', label: 'Economy', requires: ['economy.view', 'economy.adjust'] },
  { key: 'fraud', label: 'Fraud', requires: ['fraud.review'] },
  { key: 'events', label: 'Events', requires: ['events.manage'] },
  { key: 'admins', label: 'Admins', requires: ['admins.manage'] },
];

/** The nav sections a set of capabilities can see (order preserved). */
export function visibleNav(capabilities: readonly string[]): NavSection[] {
  const owned = new Set(capabilities);
  return NAV_SECTIONS.filter((section) => section.requires.some((cap) => owned.has(cap)));
}

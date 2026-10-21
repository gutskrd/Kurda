/**
 * The admin's map: every page, the group it sits in, and who may open it.
 *
 * Who may open a page is what the API allows, not a guess. Each page names
 * the guard its routes use — a capability (`moderation.act`) or a list of
 * roles, the legacy `admin` role included — and `GET /admin/session` says what
 * this account holds (`capabilities` and `staffRoles`). The old nav hid three
 * links by a hard-coded role list and showed every other link to everyone, so
 * a moderator was offered pages that answered 403 and landed on one of them.
 *
 * Hiding a link is not access control: the API checks every request again.
 * This only keeps the panel from offering what will be refused.
 *
 * Pure data and functions, so the gating is tested without a browser.
 */
import type { IconName } from './ui/icons';

export type Capability =
  | 'content.edit'
  | 'content.publish'
  | 'users.view'
  | 'users.moderate'
  | 'economy.view'
  | 'economy.adjust'
  | 'fraud.review'
  | 'events.manage'
  | 'admins.manage'
  | 'moderation.act';

/** What this session holds, from GET /admin/session. */
export interface SessionAccess {
  /** every staff role, the legacy `admin` and `founder` included */
  staffRoles: readonly string[];
  capabilities: readonly string[];
}

/** A page's guard, as its API routes have it. */
export type Access = { anyone: true } | { capability: Capability } | { roles: readonly string[] };

export function canOpen(access: Access, session: SessionAccess): boolean {
  if ('anyone' in access) return true;
  if ('capability' in access) return session.capabilities.includes(access.capability);
  return access.roles.some((r) => session.staffRoles.includes(r));
}

// The guards behind the pages (api/src/…): kept in one place so a change to a
// route's guard is a change to one line here.
const LEGACY_ADMIN = { roles: ['admin'] } as const; // requireRoles('admin'): analytics, economy, events, flags, jobs…
const RECORDERS = { roles: ['superadmin', 'content_editor', 'admin'] } as const; // ALPHABET_AUDIO_ROLES / LESSON_AUDIO_ROLES
const STORY_EDITORS = { roles: ['superadmin', 'content_editor', 'admin'] } as const; // STORY_EDITOR_ROLES
const GAME_EDITORS = { roles: ['admin', 'superadmin', 'content_editor'] } as const; // game-content-routes, race-routes
const LESSON_EDITORS = { roles: ['superadmin', 'content_editor'] } as const; // requireAdmin(totp, 'superadmin', 'content_editor')
const USER_VIEWERS = { roles: ['superadmin', 'moderator', 'support'] } as const; // user-admin-routes canView
const MODERATORS = { capability: 'moderation.act' } as const;
const SHOP_EDITORS = { roles: ['admin', 'superadmin'] } as const; // /admin/shop/items, /shop/items
const APPROVERS = { roles: ['admin', 'superadmin'] } as const; // /admin/config/changes
const TAG_EDITORS = { roles: ['admin', 'superadmin', 'founder'] } as const; // /admin/tags
const SUPERADMINS = { roles: ['superadmin'] } as const; // /admin/audit
const FEEDBACK_READERS = { roles: ['moderator', 'superadmin', 'admin', 'support'] } as const; // feedback/routes.ts FEEDBACK_READERS
const SUPPORT_READERS = { roles: ['superadmin', 'admin', 'support'] } as const; // email/admin-routes.ts SUPPORT_READERS (the settings half: EMAIL_ADMINS)
/** RANK_TOOL_ROLES in api/src/admin/roles.ts: ranks/routes.ts, leagues/routes.ts, badges/routes.ts */
export const RANK_TOOL_ROLES = ['admin', 'superadmin'] as const;
const RANK_TOOLS = { roles: RANK_TOOL_ROLES } as const;

export const NAV_GROUPS = [
  { key: 'overview', label: 'Overview' },
  { key: 'record', label: 'Record audio' },
  { key: 'people', label: 'People' },
  { key: 'moderation', label: 'Moderation' },
  { key: 'content', label: 'Content' },
  { key: 'games', label: 'Games' },
  { key: 'ranks', label: 'Ranks & rewards' },
  { key: 'economy', label: 'Economy' },
  { key: 'settings', label: 'Settings' },
] as const;
export type NavGroupKey = (typeof NAV_GROUPS)[number]['key'];

/**
 * One link in the nav. `page` is the page it opens and `sub` the first part
 * of the address below it (#/audio/lessons opens the audio page on its lessons
 * side); `keywords` are other words a person might search for it by.
 */
export interface NavEntry {
  id: string;
  label: string;
  group: NavGroupKey;
  icon: IconName;
  page: string;
  sub?: string;
  access: Access;
  keywords?: string;
  /**
   * The page's name where the nav's group is not beside it — the phone's top
   * bar and the browser tab — when the label alone would not say it: the
   * Economy group's "Overview" is the economy's overview, not the dashboard.
   */
  title?: string;
}

export const NAV: readonly NavEntry[] = [
  { id: 'dashboard', label: 'Dashboard', group: 'overview', icon: 'home', page: 'dashboard', access: { anyone: true }, keywords: 'home start summary' },
  { id: 'analytics', label: 'Analytics', group: 'overview', icon: 'chart', page: 'analytics', access: LEGACY_ADMIN, keywords: 'dau mau retention funnel' },

  // the owner could not find where to record: it gets a group of its own, near the top, in plain words
  { id: 'record-letters', label: 'Record the alphabet', group: 'record', icon: 'letters', page: 'audio', sub: 'letters', access: RECORDERS, keywords: 'audio studio letters alphabet voice microphone' },
  { id: 'record-lessons', label: 'Record lesson sentences', group: 'record', icon: 'mic', page: 'audio', sub: 'lessons', access: RECORDERS, keywords: 'audio studio words sentences voice microphone' },
  { id: 'record-stories', label: 'Record story sentences', group: 'record', icon: 'story', page: 'audio', sub: 'stories', access: RECORDERS, keywords: 'audio studio stories voice microphone narration' },
  { id: 'record-dictionary', label: 'Dictionary pronunciations', group: 'record', icon: 'words', page: 'audio', sub: 'dictionary', access: RECORDERS, keywords: 'audio studio speakers words pronunciation' },
  { id: 'record-characters', label: 'Characters', group: 'record', icon: 'face', page: 'audio', sub: 'characters', access: RECORDERS, keywords: 'audio studio speakers hevalo hamo xezo lip sync mouth timelines' },

  { id: 'users', label: 'Users', group: 'people', icon: 'users', page: 'users', access: USER_VIEWERS, keywords: 'accounts people ban mute wallet' },
  { id: 'email', label: 'Email', group: 'people', icon: 'inbox', page: 'email', access: SUPPORT_READERS, keywords: 'support inbox mail sending resend reply' },

  { id: 'moderation', label: 'Queue', title: 'Moderation queue', group: 'moderation', icon: 'flag', page: 'moderation', access: MODERATORS, keywords: 'reports cases moderation' },
  { id: 'appeals', label: 'Appeals', group: 'moderation', icon: 'scale', page: 'appeals', access: MODERATORS, keywords: 'review standing sanctions' },
  { id: 'ban-approvals', label: 'Ban approvals', group: 'moderation', icon: 'approve', page: 'ban-approvals', access: MODERATORS, keywords: 'permanent ban second admin' },
  { id: 'aimod', label: 'Automated flags', group: 'moderation', icon: 'shield', page: 'aimod', access: MODERATORS, keywords: 'ai text image flags' },
  { id: 'antibot', label: 'Bot flags', group: 'moderation', icon: 'bot', page: 'antibot', access: LEGACY_ADMIN, keywords: 'antibot spam bots' },
  { id: 'feedback', label: 'Feedback', group: 'moderation', icon: 'star', page: 'feedback', access: FEEDBACK_READERS, keywords: 'ratings stars reviews inbox' },
  { id: 'playbook', label: 'Playbook', group: 'moderation', icon: 'book', page: 'playbook', access: MODERATORS, keywords: 'csam self-harm child safety how to help' },

  { id: 'lessons', label: 'Lessons', group: 'content', icon: 'book', page: 'lessons', access: LESSON_EDITORS, keywords: 'content exercises courses' },
  { id: 'stories', label: 'Stories', group: 'content', icon: 'story', page: 'stories', access: STORY_EDITORS, keywords: 'reading quiz' },
  { id: 'tags', label: 'Profile tags', group: 'content', icon: 'tag', page: 'tags', access: TAG_EDITORS, keywords: 'identity titles labels' },
  { id: 'events', label: 'Live events', group: 'content', icon: 'calendar', page: 'events', access: LEGACY_ADMIN, keywords: 'quests seasonal newroz' },

  { id: 'words', label: 'Words & dictionary', group: 'games', icon: 'words', page: 'words', access: GAME_EDITORS, keywords: 'word pool import wiktionary' },
  { id: 'wordle', label: 'Peyvok', group: 'games', icon: 'grid', page: 'wordle', access: GAME_EDITORS, keywords: 'coverage word game' },
  { id: 'rhyme', label: 'Rhyme', group: 'games', icon: 'rhyme', page: 'rhyme', access: GAME_EDITORS, keywords: 'rhymes base words' },
  { id: 'race', label: 'Race texts', group: 'games', icon: 'keyboard', page: 'race', access: GAME_EDITORS, keywords: 'typing race' },

  { id: 'ranks', label: 'Game ranks', group: 'ranks', icon: 'mountain', page: 'ranks', access: RANK_TOOLS, keywords: 'rating tiers top players suspicious pairs void reset' },
  { id: 'seasons', label: 'Seasons', group: 'ranks', icon: 'trophy', page: 'seasons', access: RANK_TOOLS, keywords: 'season rewards frames gems end close' },
  { id: 'leagues', label: 'Leagues', group: 'ranks', icon: 'waves', page: 'leagues', access: RANK_TOOLS, keywords: 'weekly groups settle merge promotion xp' },
  { id: 'badges', label: 'Badges', group: 'ranks', icon: 'award', page: 'badges', access: RANK_TOOLS, keywords: 'achievements rarity catalogue award revoke' },

  { id: 'economy', label: 'Overview', title: 'Economy', group: 'economy', icon: 'coins', page: 'economy', access: LEGACY_ADMIN, keywords: 'economy supply drift zer gems' },
  { id: 'shop', label: 'Shop', group: 'economy', icon: 'store', page: 'shop', access: SHOP_EDITORS, keywords: 'items prices catalogue' },
  { id: 'gem-rules', label: 'Gem rules', group: 'economy', icon: 'gem', page: 'gem-rules', access: LEGACY_ADMIN, keywords: 'earning' },
  { id: 'fraud', label: 'Fraud', group: 'economy', icon: 'alert', page: 'fraud', access: LEGACY_ADMIN, keywords: 'purchases holds iap' },
  { id: 'approvals', label: 'Approvals', group: 'economy', icon: 'approve', page: 'approvals', access: APPROVERS, keywords: 'config second admin pending' },

  { id: 'flags', label: 'Feature flags', group: 'settings', icon: 'toggle', page: 'flags', access: LEGACY_ADMIN, keywords: 'experiments a/b tests' },
  { id: 'audit', label: 'Audit log', group: 'settings', icon: 'list', page: 'audit', access: SUPERADMINS, keywords: 'history trail' },
  { id: 'security', label: 'My security', group: 'settings', icon: 'lock', page: 'security', access: { anyone: true }, keywords: '2fa two-factor authenticator' },
  { id: 'system', label: 'System', group: 'settings', icon: 'server', page: 'system', access: LEGACY_ADMIN, keywords: 'jobs leaderboards push media storage' },
];

/**
 * Pages that are not a nav link of their own, with their guard: they are
 * reached from another page (a story from the story list), or by an old address.
 */
const PAGE_ACCESS: Record<string, Access> = Object.fromEntries(NAV.map((n) => [n.page, n.access]));

/**
 * Old addresses, so a bookmark or a link in a message still lands. The first
 * part of the address is swapped; anything after it is kept.
 */
export const ALIASES: Readonly<Record<string, string>> = {
  alphabet: 'audio/letters',
  content: 'lessons',
  config: 'approvals',
  experiments: 'flags',
  ops: 'system',
  games: 'words',
};

export interface Route {
  /** the page key: #/lessons/<id> → lessons */
  page: string;
  /** the parts below it: #/lessons/<id> → [<id>] */
  rest: string[];
  query: URLSearchParams;
}

/** Read an address (`#/audio/lessons?show=missing`), old names translated. */
export function parseRoute(hash: string): Route {
  const raw = hash.replace(/^#\/?/, '');
  const [path = '', search = ''] = raw.split('?');
  const parts = path.split('/').filter(Boolean).map((p) => {
    try {
      return decodeURIComponent(p);
    } catch {
      return p;
    }
  });
  const [first = '', ...rest] = parts;
  const alias = ALIASES[first];
  if (alias) {
    const [page = '', ...more] = alias.split('/');
    return { page, rest: [...more, ...rest], query: new URLSearchParams(search) };
  }
  return { page: first, rest, query: new URLSearchParams(search) };
}

/** The address of a page: href('audio', 'lessons') → #/audio/lessons */
export function href(page: string, ...rest: string[]): string {
  return `#/${[page, ...rest].map(encodeURIComponent).join('/')}`;
}

export function visibleNav(session: SessionAccess): NavEntry[] {
  return NAV.filter((n) => canOpen(n.access, session));
}

/** Whether this session may open a page; unknown pages are not anyone's. */
export function mayOpenPage(page: string, session: SessionAccess): boolean {
  const access = PAGE_ACCESS[page];
  return access ? canOpen(access, session) : false;
}

export function isKnownPage(page: string): boolean {
  return page in PAGE_ACCESS;
}

/** Where a session starts: the first page in the nav it can open. */
export function landingRoute(session: SessionAccess): string {
  const first = visibleNav(session)[0] ?? NAV[0]!;
  return first.sub ? `${first.page}/${first.sub}` : first.page;
}

/** The nav entry an address belongs to (the most specific one). */
export function activeEntry(route: Route): NavEntry | undefined {
  const sub = route.rest[0];
  return NAV.find((n) => n.page === route.page && n.sub !== undefined && n.sub === sub) ?? NAV.find((n) => n.page === route.page);
}

/** The nav entries whose label, group or keywords contain every word typed. */
export function searchNav(entries: readonly NavEntry[], query: string): NavEntry[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...entries];
  const groupLabel = (g: NavGroupKey): string => NAV_GROUPS.find((x) => x.key === g)?.label ?? '';
  return entries.filter((n) => {
    const hay = `${n.label} ${groupLabel(n.group)} ${n.keywords ?? ''}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/** Role names as people say them. */
export const ROLE_NAME: Readonly<Record<string, string>> = {
  superadmin: 'Superadmin',
  content_editor: 'Content editor',
  moderator: 'Moderator',
  support: 'Support',
  admin: 'Admin',
  founder: 'Founder',
};

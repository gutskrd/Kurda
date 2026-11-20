import type { BanContentChoice, ReportCategory, SanctionKind } from '@kurda/shared';
import { durationName } from './moderation';

/**
 * What a suspension or ban does to a person's content, and who might be the same person as someone banned: the words
 * the ban dialog, the Possible returns page, the user page's panel and Trusted networks use, and the shapes of the API
 * they read (api/src/moderation/takedown.ts, returns.ts, net/trusted-networks.ts).
 */

/** `GET /admin/users/:id/content-summary`: what is public of the person now. */
export interface ContentSummary {
  posts: number;
  pictures: number;
  comments: number;
  groupMessages: number;
  directMessages: number;
  lettersInFlight: number;
  profile: boolean;
  groupPhotos: number;
}

/** What each choice means, in the words the dialog shows beside it. */
export const CONTENT_CHOICE: Readonly<Record<BanContentChoice, { label: string; covers: readonly string[] }>> = {
  keep: {
    label: 'Keep',
    covers: ['Everything they shared stays up', 'Their name shows as an account that isn’t available'],
  },
  hide: {
    label: 'Hide',
    covers: [
      'Posts, pictures and comments',
      'Profile photo, name, bio, country, background and tags',
      'Group messages, and the group photos they set',
      'Letters still on their way',
      'All of it comes back exactly if the ban is lifted, overturned or ends',
    ],
  },
  remove: {
    label: 'Remove',
    covers: [
      'Everything Hide covers, hidden at once',
      'Their pictures and voice taken off the public site',
      'Deleted for good after six months, unless an appeal overturns the ban first',
    ],
  },
};

/** "23 posts" / "1 post". */
function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "a, b and c". */
function listed(parts: readonly string[]): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
}

/** What the content choice would touch, said as a list ("23 posts, 4 pictures and their profile"); `own` leaves out "their" after a "Their". */
export function coveredLine(summary: ContentSummary | null, includeMessages: boolean, own = false): string {
  if (!summary) return 'everything they shared';
  const parts: string[] = [];
  if (summary.posts) parts.push(count(summary.posts, 'post', 'posts'));
  if (summary.pictures) parts.push(count(summary.pictures, 'picture', 'pictures'));
  if (summary.comments) parts.push(count(summary.comments, 'comment', 'comments'));
  if (summary.groupMessages) parts.push(count(summary.groupMessages, 'group message', 'group messages'));
  if (summary.lettersInFlight) parts.push(count(summary.lettersInFlight, 'letter on its way', 'letters on their way'));
  if (includeMessages && summary.directMessages) parts.push(count(summary.directMessages, 'private message', 'private messages'));
  if (summary.profile) parts.push(own ? 'profile' : 'their profile');
  return parts.length ? listed(parts) : 'nothing public yet';
}

export interface BanSummaryInput {
  username: string;
  kind: SanctionKind;
  durationHours: number | null;
  choice: BanContentChoice;
  includeMessages: boolean;
  summary: ContentSummary | null;
  /** waits for a second moderator, suspended meanwhile */
  waits?: boolean;
}

/**
 * The summary before confirming, in plain sentences: "@rojda will be banned permanently. Their 23 posts, 4 pictures and
 * profile will be hidden from everyone. They will get an email with the reason and how to appeal."
 */
export function banSummary(input: BanSummaryInput): string[] {
  const who = `@${input.username}`;
  const first =
    input.kind === 'permanent_ban'
      ? input.waits
        ? `${who} will be suspended now, and banned permanently once a second moderator approves.`
        : `${who} will be banned permanently.`
      : `${who} will be suspended for ${durationName(input.durationHours).toLowerCase()}.`;
  const what = coveredLine(input.summary, input.includeMessages, true);
  // while the numbers load it is "everything they shared"; with nothing public there is nothing to take down
  const things = input.summary === null ? 'Everything they shared' : what === 'nothing public yet' ? null : `Their ${what}`;
  const content =
    input.choice === 'keep'
      ? 'What they shared stays up, under a name that shows the account isn’t available.'
      : !things
        ? 'They have shared nothing public yet.'
        : input.choice === 'hide'
          ? `${things} will be hidden from everyone${input.kind === 'suspension' ? ' until the suspension ends' : ''}.`
          : `${things} will be removed, and deleted for good after six months unless an appeal overturns the ban.`;
  return [first, content, 'They will get an email with the reason and how to appeal.'];
}

/** Whether a kind is one the content choice applies to. */
export function takesContent(kind: SanctionKind): boolean {
  return kind === 'suspension' || kind === 'permanent_ban';
}

// ---------------------------------------------------------------------------
// Possible returns
// ---------------------------------------------------------------------------

export type SignalStrength = 'identity' | 'strong' | 'medium' | 'weak';

export interface ReturnPerson {
  id: string;
  username: string;
  createdAt: string;
  unavailable: boolean;
  held: boolean;
}

export interface ReturnSignal {
  kind: string;
  strength: SignalStrength;
  at: string;
  event: string;
  days?: number;
}

/** `GET /admin/moderation/possible-returns` items. */
export interface PossibleReturnItem {
  id: string;
  account: ReturnPerson | null;
  banned: (ReturnPerson & { ban: { sanctionId: string; kind: SanctionKind; policy: ReportCategory; startsAt: string; endsAt: string | null } | null }) | null;
  strength: 'strong' | 'medium';
  signals: ReturnSignal[];
  held: boolean;
  status: 'open' | 'same_person' | 'not_same_person' | 'closed';
  firstSeenAt: string;
  lastSeenAt: string;
  personNote: { text: string; at: string } | null;
  decision: { byUsername: string | null; at: string; note: string | null; linkedSanctionId: string | null } | null;
}

export interface PossibleReturnsPage {
  items: PossibleReturnItem[];
  nextCursor: string | null;
  counts: { open: number; held: number };
}

/** `GET /admin/users/:id/possible-matches` items. */
export interface PanelEntry {
  other: ReturnPerson;
  relation: 'may_be_return_of' | 'may_have_returned_as' | 'shares_evidence';
  entryId: string | null;
  status: PossibleReturnItem['status'] | null;
  strength: SignalStrength;
  signals: ReturnSignal[];
  lastSeenAt: string;
}

export interface PanelPage {
  items: PanelEntry[];
  total: number;
  nextOffset: number | null;
}

/** What each signal is, plainly. */
export const SIGNAL_NAME: Readonly<Record<string, string>> = {
  email: 'The same email address',
  oauth: 'The same Google or Apple sign-in',
  phone: 'The same phone number',
  device: 'The same phone or tablet',
  push: 'The same phone’s notifications',
  network_near_ban: 'Their home network, days after the ban, same time zone and language',
  network_repeated: 'Their home network, on separate days',
  network: 'A network they shared once',
};

export function signalName(kind: string): string {
  return SIGNAL_NAME[kind] ?? kind;
}

export const STRENGTH_NAME: Readonly<Record<SignalStrength, string>> = { identity: 'Same identity', strong: 'Strong', medium: 'Medium', weak: 'Weak' };
export const STRENGTH_TONE: Readonly<Record<SignalStrength, 'bad' | 'warn' | 'info' | 'neutral'>> = {
  identity: 'bad',
  strong: 'warn',
  medium: 'info',
  weak: 'neutral',
};

export const RELATION_NAME: Readonly<Record<PanelEntry['relation'], string>> = {
  may_be_return_of: 'May be a return of',
  may_have_returned_as: 'May have come back as',
  shares_evidence: 'Shares a device or network with',
};

export const RETURN_STATUS_NAME: Readonly<Record<PossibleReturnItem['status'], string>> = {
  open: 'Waiting',
  same_person: 'Same person',
  not_same_person: 'Not the same person',
  closed: 'Closed',
};

/** The words a "Same person" ban starts from; the moderator can change them. */
export const SAME_PERSON_STATEMENT =
  'This account belongs to someone whose account is closed for breaking Hevalo’s rules. Opening another account to get round that isn’t allowed.';

// ---------------------------------------------------------------------------
// Trusted networks
// ---------------------------------------------------------------------------

export interface TrustedNetwork {
  id: string;
  hint: string;
  reason: string;
  createdAt: string;
  createdBy: string | null;
  expiresAt: string;
  expired: boolean;
}

export interface TrustedNetworksPage {
  networks: TrustedNetwork[];
  max: number;
  maxDays: number;
}

/** An IPv4 or IPv6 address, as the API takes it; the server checks it again. */
export function looksLikeAddress(text: string): boolean {
  const t = text.trim();
  if (/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(t)) return t.split('.').every((p) => Number(p) <= 255);
  return /^[0-9a-f:]+$/i.test(t) && t.includes(':') && t.length >= 2 && t.length <= 39;
}

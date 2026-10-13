import type { MutedErrorDetails, SuspendedErrorDetails } from '@kurda/shared';
import type { ApiError } from '../lib/types';
import type { MessageKey } from '../i18n/en';

/** Just enough of the i18n contract to write a sentence; no React in here. */
type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

/**
 * Why the server would not take something you sent — a message, a gift, a
 * post, a comment, a picture, a profile change — when the reason is a limit on
 * your account rather than the thing itself.
 *
 * Every one of these used to come back as a generic "something went wrong",
 * or as the server's English: a muted person kept pressing Send with no idea
 * why nothing happened, or for how long. Now each refusal says what is limited
 * and until when, in the reader's own language and time zone, and points to
 * Account standing where the reasons are written out.
 *
 * - `muted` — a Hevalo sanction (403 MUTED with `MutedErrorDetails`): chat,
 *   posting, or pictures and voice (a feature limit), until a time or with no
 *   end set.
 * - `groupMuted` — 403 MUTED with no details: a group's own admins muted you in
 *   that group. Not a Hevalo decision, so it is not on your standing page.
 * - `chatMuted` — 403 CHAT_MUTED: the automatic pause after several messages
 *   were flagged. It has no statement of reasons and no end the server tells
 *   us, so it gets neither a date nor a link that would show nothing.
 * - `suspended` — the account itself is suspended (ACCOUNT_SUSPENDED). Any
 *   other request from a suspended account answers ACCOUNT_DISABLED, which the
 *   API client turns into the suspension screen (lib/api.ts), so it is not
 *   here.
 */
export type Restriction =
  | { kind: 'muted'; scope: MutedErrorDetails['scope']; until: string | null }
  | { kind: 'groupMuted' }
  | { kind: 'chatMuted' }
  | { kind: 'suspended'; until: string | null };

const SCOPES: ReadonlySet<string> = new Set<MutedErrorDetails['scope']>(['chat', 'post', 'media']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** The ISO time in `details.until`, or null when there is none (or it is not a time). */
function untilOf(details: unknown): string | null {
  if (!isRecord(details) || typeof details.until !== 'string') return null;
  return Number.isNaN(new Date(details.until).getTime()) ? null : details.until;
}

/** What limit, if any, an error from the API is about. */
export function restrictionOf(error: ApiError | null | undefined): Restriction | null {
  if (!error || error.status === 429) return null;
  switch (error.code) {
    case 'MUTED': {
      const details = error.details;
      if (isRecord(details) && typeof details.scope === 'string' && SCOPES.has(details.scope)) {
        return { kind: 'muted', scope: details.scope as MutedErrorDetails['scope'], until: untilOf(details) };
      }
      return { kind: 'groupMuted' };
    }
    case 'CHAT_MUTED':
      return { kind: 'chatMuted' };
    case 'ACCOUNT_SUSPENDED':
      return { kind: 'suspended', until: untilOf(error.details) };
    default:
      return null;
  }
}

/** `SuspendedErrorDetails` from a sign-in refusal, when that is what it carries. */
export function suspensionOf(error: ApiError | null | undefined): SuspendedErrorDetails | null {
  if (error?.code !== 'ACCOUNT_SUSPENDED') return null;
  const d = error.details;
  if (!isRecord(d) || typeof d.appealToken !== 'string' || typeof d.statement !== 'string') return null;
  return {
    until: untilOf(d),
    policy: typeof d.policy === 'string' ? (d.policy as SuspendedErrorDetails['policy']) : null,
    statement: d.statement,
    appealable: d.appealable === true,
    appealToken: d.appealToken,
  };
}

/**
 * A moment as the reader would say it: "14 Oct, 18:00", with the year only
 * when it is not this one. In the reader's time zone (the browser's), because
 * "until 16:00 UTC" asks a child to do arithmetic about their own punishment.
 */
export function formatUntil(iso: string, locale: string, now: Date = new Date()): string {
  const when = new Date(iso);
  const options: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    ...(when.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  };
  try {
    return when.toLocaleString(locale, options);
  } catch {
    // a locale the browser has no data for (Kurdish, in some) falls back to its own
    return when.toLocaleString(undefined, options);
  }
}

/** The sentence that says what is limited and until when. */
export function restrictionText(r: Restriction, t: Translate, locale: string, now: Date = new Date()): string {
  switch (r.kind) {
    case 'muted': {
      if (r.until === null) {
        return t(r.scope === 'chat' ? 'restriction.chat' : r.scope === 'post' ? 'restriction.post' : 'restriction.media');
      }
      const time = formatUntil(r.until, locale, now);
      return t(
        r.scope === 'chat' ? 'restriction.chatUntil' : r.scope === 'post' ? 'restriction.postUntil' : 'restriction.mediaUntil',
        { time },
      );
    }
    case 'groupMuted':
      return t('restriction.groupMuted');
    case 'chatMuted':
      return t('restriction.chatMuted');
    case 'suspended':
      return r.until ? t('restriction.suspendedUntil', { time: formatUntil(r.until, locale, now) }) : t('restriction.suspended');
  }
}

/** Whether Account standing has the reasons for this limit — only Hevalo's own sanctions do. */
export function standingExplains(r: Restriction): boolean {
  return r.kind === 'muted' || r.kind === 'suspended';
}

/** Where Account standing lives. */
export const STANDING_PATH = '/app/settings/standing';
/** Where your reports are listed. */
export const MY_REPORTS_PATH = '/app/settings/reports';

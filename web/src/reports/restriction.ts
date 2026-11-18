import type { MutedErrorDetails, SuspendedErrorDetails } from '@kurda/shared';
import type { ApiError } from '../lib/types';
import type { MessageKey } from '../i18n/en';

/** Just enough of the i18n contract to write a sentence; no React in here. */
type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

/**
 * A refusal caused by a limit on the account rather than the content sent, so it can say what is limited and until
 * when in the reader's language and time zone, linking to Account standing.
 *
 * - `muted`: a Hevalo sanction (403 MUTED with `MutedErrorDetails`) on chat, posting, or pictures and voice.
 * - `groupMuted`: 403 MUTED without details, a group admins' mute, so not on the standing page.
 * - `chatMuted`: 403 CHAT_MUTED, the automatic pause after flagged messages, with no reasons or end date to show.
 * - `suspended`: ACCOUNT_SUSPENDED. Other requests from a suspended account answer ACCOUNT_DISABLED, which lib/api.ts
 *   turns into the suspension screen.
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

/** The ISO time in `details.until`, or null when absent or not a time. */
export function untilOf(details: unknown): string | null {
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

/** A moment in the reader's time zone, such as "14 Oct, 18:00", with the year only when it is not this one. */
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
    // A locale the browser has no data for (Kurdish in some) falls back to the browser's own.
    return when.toLocaleString(undefined, options);
  }
}

/** A day such as "14 Oct", with the year only when it is not this one. */
export function formatDay(iso: string, locale: string, now: Date = new Date()): string {
  const when = new Date(iso);
  const options: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'short',
    ...(when.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  };
  try {
    return when.toLocaleDateString(locale, options);
  } catch {
    return when.toLocaleDateString(undefined, options);
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

/** Whether Account standing has the reasons for this limit; only Hevalo's own sanctions do. */
export function standingExplains(r: Restriction): boolean {
  return r.kind === 'muted' || r.kind === 'suspended';
}

/** Where Account standing lives. */
export const STANDING_PATH = '/app/settings/standing';
/** Where the reader's reports are listed. */
export const MY_REPORTS_PATH = '/app/settings/reports';

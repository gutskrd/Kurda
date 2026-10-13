import type { MutedErrorDetails } from '@kurda/shared';
import type { ApiError } from '../api/types';
import { describeError, type Translate } from '../api/errors';
import type { TranslationKey } from '../i18n/translations';
import { mutedDetails } from './suspension';

/**
 * Why the server would not take something you sent — a message, a gift, a
 * game card, a post, a comment, a picture, a voice note, a profile change —
 * when the reason is a limit on your account rather than the thing itself.
 *
 * Each of these used to come back as the server's English or as "something
 * went wrong": a muted person kept pressing Send with no idea why nothing
 * happened, or for how long. Now each refusal says what is limited and until
 * when, in the reader's language and time zone, and — where Hevalo has written
 * the reasons down — points to Account standing. The browser says the same
 * sentences (web/src/reports/restriction.ts).
 *
 * - `muted` — a Hevalo sanction (403 MUTED with `MutedErrorDetails`): chat,
 *   posting, or pictures and voice (a feature limit), until a time or with no
 *   end set.
 * - `groupMuted` — 403 MUTED with no details: the group's own admins muted you
 *   in that group. Not a Hevalo decision, so it is not on the standing page.
 * - `chatMuted` — 403 CHAT_MUTED: the automatic pause after several messages
 *   were flagged. It has no statement of reasons and no end the server tells
 *   us, so it gets neither a date nor a link to a page that would show nothing.
 * - `suspended` — the account itself (ACCOUNT_SUSPENDED). Mid-session the
 *   client hands that to the suspension screen (`ApiClient.onSuspended`), so
 *   this is only the sentence for a screen that meets it first.
 */
export type Restriction =
  | { kind: 'muted'; scope: MutedErrorDetails['scope']; until: string | null }
  | { kind: 'groupMuted' }
  | { kind: 'chatMuted' }
  | { kind: 'suspended'; until: string | null };

/** What limit, if any, an error from the API is about. */
export function restrictionOf(error: ApiError | null | undefined): Restriction | null {
  if (!error || error.status === 429) return null;
  switch (error.code) {
    case 'MUTED': {
      const details = mutedDetails(error.details);
      return details ? { kind: 'muted', scope: details.scope, until: details.until } : { kind: 'groupMuted' };
    }
    case 'CHAT_MUTED':
      return { kind: 'chatMuted' };
    case 'ACCOUNT_SUSPENDED': {
      const d = error.details as { until?: unknown } | undefined;
      return { kind: 'suspended', until: typeof d?.until === 'string' ? d.until : null };
    }
    default:
      return null;
  }
}

/**
 * A moment as the reader would say it — "14 Oct, 18:00", with the year only
 * when it is not this one — in the phone's own time zone, because "until 16:00
 * UTC" asks a child to do arithmetic about their own punishment.
 */
export function formatUntil(iso: string, locale: string | undefined, now: Date = new Date()): string {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return iso;
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
    // a locale the device has no data for (Kurdish, on some) falls back to its own
    return when.toLocaleString(undefined, options);
  }
}

/** A day, for lists of what happened when: "14 Oct", with the year when it is not this one. */
export function formatDay(iso: string, locale: string, now: Date = new Date()): string {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return iso;
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

const MUTED_KEY: Record<MutedErrorDetails['scope'], { now: TranslationKey; until: TranslationKey }> = {
  chat: { now: 'restriction.chat', until: 'restriction.chatUntil' },
  post: { now: 'restriction.post', until: 'restriction.postUntil' },
  media: { now: 'restriction.media', until: 'restriction.mediaUntil' },
};

/** The sentence that says what is limited and until when. */
export function restrictionText(r: Restriction, t: Translate, locale: string | undefined, now: Date = new Date()): string {
  switch (r.kind) {
    case 'muted':
      return r.until === null
        ? t(MUTED_KEY[r.scope].now)
        : t(MUTED_KEY[r.scope].until, { time: formatUntil(r.until, locale, now) });
    case 'groupMuted':
      return t('restriction.groupMuted');
    case 'chatMuted':
      return t('restriction.chatMuted');
    case 'suspended':
      return r.until
        ? t('restriction.suspendedUntil', { time: formatUntil(r.until, locale, now) })
        : t('restriction.suspended');
  }
}

/** Whether Account standing has the reasons for this limit — only Hevalo's own sanctions do. */
export function standingExplains(r: Restriction): boolean {
  return r.kind === 'muted' || r.kind === 'suspended';
}

/**
 * Any failed send, in one sentence: the limit when it is one, otherwise what
 * `describeError` says. `restriction` is set when the answer is a limit, so a
 * screen can offer the way to Account standing beside it.
 */
export function sendErrorOf(
  error: ApiError,
  t: Translate,
  locale: string,
): { message: string; restriction: Restriction | null } {
  const restriction = restrictionOf(error);
  return {
    message: restriction ? restrictionText(restriction, t, locale) : describeError(error, t),
    restriction,
  };
}

import type { Translate } from '../i18n/I18nProvider';
import type { InboxNote, NoteView } from '../reports/notifications';
import { zonePlace } from './api';
import { calendarDay, monthYear } from './words';

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim().length > 0 ? v.trim() : null);

/** A whole number, sent as one or as its digits. */
const whole = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d+$/.test(v.trim()) ? Number(v) : NaN;
  return Number.isInteger(n) ? n : null;
};

/** The corrected birth month a notice carries, or null when it carries none that could be one. */
const birthOf = (data: Record<string, unknown>): { year: number; month: number } | null => {
  const year = whole(data.birthYear);
  const month = whole(data.birthMonth);
  return year !== null && month !== null && month >= 1 && month <= 12 ? { year, month } : null;
};

/**
 * Parental controls' notifications (a teen connected, another parent added, a link ended, limits or the teen's time zone
 * changed, a teen asked to leave or stayed, a birth month corrected) worded from `data` in the reader's language, each
 * opening the parental page or the teen's page there. Without a name in `data` the server's English is used. Anything
 * else is null.
 */
export function parentalNotification(note: InboxNote, t: Translate, locale = 'en'): NoteView | null {
  const data = note.data;
  if (!data || typeof data !== 'object' || typeof data.kind !== 'string' || !data.kind.startsWith('parental_')) return null;
  const home = '/app/settings/parental';
  const teenId = str(data.teenId);
  const teen = str(data.teenName) ?? str(data.teenUsername);
  const parent = str(data.parentName) ?? str(data.parentUsername);
  const teenTo = teenId ? `${home}/teen/${encodeURIComponent(teenId)}` : home;
  switch (data.kind) {
    case 'parental_connected':
      return teen
        ? { title: t('notify.parentalConnected', { name: teen }), body: t('notify.parentalConnected.body'), to: teenTo }
        : { title: note.title, body: note.body, to: home };
    case 'parental_ended':
      if (data.by === 'teen' && teen) return { title: t('notify.parentalEnded.byTeen', { name: teen }), body: null, to: home };
      // The teen's own word that the days they asked for have run.
      if (data.by === 'teen' && parent) return { title: t('notify.parentalEnded.left', { name: parent }), body: null, to: home };
      if (data.by === 'parent' && parent) return { title: t('notify.parentalEnded.byParent', { name: parent }), body: null, to: home };
      return { title: note.title, body: note.body, to: home };
    case 'parental_changed':
      // Another parent reads it about the teen, the teen about themselves.
      if (parent && teen) return { title: t('notify.parentalChangedFor', { parent, teen }), body: null, to: teenTo };
      return parent ? { title: t('notify.parentalChanged', { name: parent }), body: t('notify.parentalChanged.body'), to: home } : { title: note.title, body: note.body, to: home };
    case 'parental_parent_added':
      return parent && teen ? { title: t('notify.parentalParentAdded', { parent, teen }), body: null, to: teenTo } : { title: note.title, body: note.body, to: teenTo };
    case 'parental_zone': {
      const zone = str(data.timeZone) ?? str(data.zone);
      return teen && zone ? { title: t('notify.parentalZone', { teen, zone: zonePlace(zone) }), body: null, to: teenTo } : { title: note.title, body: note.body, to: teenTo };
    }
    case 'parental_leave': {
      const ends = str(data.endsAt);
      if (data.state === 'kept' && teen) return { title: t('notify.parentalKept', { name: teen }), body: null, to: teenTo };
      if (data.state === 'asked' && teen && ends) {
        return { title: t('notify.parentalLeave', { name: teen }), body: t('notify.parentalLeave.body', { date: calendarDay(t, ends, locale) }), to: teenTo };
      }
      return { title: note.title, body: note.body, to: teenTo };
    }
    case 'parental_birth': {
      const birth = birthOf(data);
      if (!birth || !parent) return { title: note.title, body: note.body, to: teenTo };
      const month = monthYear(t, birth, locale);
      // Another parent reads it about the teen, the teen about themselves.
      if (teen && data.to !== 'teen') return { title: t('notify.parentalBirthFor', { parent, teen, month }), body: null, to: teenTo };
      return { title: t('notify.parentalBirth', { name: parent, month }), body: t('notify.parentalBirth.body'), to: home };
    }
    default:
      return null;
  }
}

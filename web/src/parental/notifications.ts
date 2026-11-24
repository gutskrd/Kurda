import type { Translate } from '../i18n/I18nProvider';
import type { InboxNote, NoteView } from '../reports/notifications';
import { zonePlace } from './api';

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim().length > 0 ? v.trim() : null);

/**
 * Parental controls' notifications (a teen connected, another parent added, a link ended, limits or the teen's time zone
 * changed) worded from `data` in the reader's language, each opening the parental page or the teen's page there.
 * Without a name in `data` the server's English is used. Anything else is null.
 */
export function parentalNotification(note: InboxNote, t: Translate): NoteView | null {
  const data = note.data;
  if (!data || typeof data !== 'object' || typeof data.kind !== 'string' || !data.kind.startsWith('parental_')) return null;
  const home = '/app/settings/parental';
  const teenId = str(data.teenId);
  const teen = str(data.teenName);
  const parent = str(data.parentName);
  const teenTo = teenId ? `${home}/teen/${encodeURIComponent(teenId)}` : home;
  switch (data.kind) {
    case 'parental_connected':
      return teen
        ? { title: t('notify.parentalConnected', { name: teen }), body: t('notify.parentalConnected.body'), to: teenTo }
        : { title: note.title, body: note.body, to: home };
    case 'parental_ended':
      if (data.by === 'teen' && teen) return { title: t('notify.parentalEnded.byTeen', { name: teen }), body: null, to: home };
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
    default:
      return null;
  }
}

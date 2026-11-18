import { toLeagueTier } from '@kurda/shared';
import type { InboxNote, NoteView } from '../play/notifications';
import { badgeNamed, leagueName, type Translate } from './names';

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

/**
 * League and badge notifications (category `progress`) worded from `data` in the reader's language, linking to their
 * screen: `badge` (one `key` or the day's bundle `day`), `league_safe` (weekly goal met), `league_promotion` and
 * `league_trophy` (a top-three week in Okyanûs). Anything else is null and shown as the server wrote it.
 */
export function progressNotification(note: InboxNote, t: Translate): NoteView | null {
  const data = note.data;
  if (!data || typeof data !== 'object') return null;
  switch (data.kind) {
    case 'badge': {
      const key = str(data.key);
      if (!key) return { title: t('notify.badge.title'), body: t('notify.badge.day'), to: '/app/badges' };
      return { title: t('notify.badge.title'), body: t('notify.badge.body', { name: badgeNamed(t, key).name }), to: '/app/badges' };
    }
    case 'league_safe': {
      const tier = toLeagueTier(str(data.tier));
      return {
        title: t('notify.leagueSafe.title'),
        body: tier ? t('notify.leagueSafe.body', { league: leagueName(t, tier) }) : null,
        to: '/app/rankings',
      };
    }
    case 'league_promotion': {
      const tier = toLeagueTier(str(data.tier));
      return {
        title: t('notify.leaguePromotion.title'),
        body: tier ? t('notify.leaguePromotion.body', { league: leagueName(t, tier) }) : null,
        to: '/app/rankings',
      };
    }
    case 'league_trophy': {
      const tier = toLeagueTier(str(data.tier));
      return {
        title: t('notify.leagueTrophy.title'),
        body: tier ? t('notify.leagueTrophy.body', { league: leagueName(t, tier) }) : null,
        to: '/app/rankings',
      };
    }
    default:
      return null;
  }
}

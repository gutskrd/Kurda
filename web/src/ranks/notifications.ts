import { toLeagueTier } from '@kurda/shared';
import type { InboxNote, NoteView } from '../play/notifications';
import { badgeNamed, leagueName, type Translate } from './names';

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

/**
 * League and badge news in the notifications (contract 4 §U; category
 * `progress`): said in the reader's language and calmly, and a way to the
 * screen it is about. The server writes English for its own list; the words
 * here come from `data`, the same way the play and report notices do.
 *
 * - `badge` — one badge (`key`), or the day's bundle (`day`): the badges page;
 * - `league_safe` — the weekly goal met, so no move down this week;
 * - `league_promotion` — moved up at the week's close;
 * - `league_trophy` — a top-three week in Okyanûs.
 *
 * Anything else is null: shown as the server wrote it.
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

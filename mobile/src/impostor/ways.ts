import type { CouchWay } from '@kurda/shared';
import type { TranslationKey } from '../i18n/translations';

/**
 * The three ways Impostor is played on one phone, by the words the
 * start and the setup both say them in: each one's name, and the one line
 * that tells what the impostor is told.
 */
export const WAY_KEY: Record<CouchWay, TranslationKey> = { classic: 'games.couch.way.classic', blind: 'games.couch.way.blind', odd: 'games.couch.way.odd' };
export const WAY_NOTE: Record<CouchWay, TranslationKey> = {
  classic: 'games.couch.way.classic.note',
  blind: 'games.couch.way.blind.note',
  odd: 'games.couch.way.odd.note',
};

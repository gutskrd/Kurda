import type { CouchWay } from '@kurda/shared';
import type { MessageKey } from '../i18n/en';

/**
 * The three ways Impostor is played on one phone, by the words the
 * start page and the setup both say them in: each one's name, and the one
 * line that tells what the impostor is told.
 */
export const WAY_KEY: Record<CouchWay, MessageKey> = { classic: 'games.couch.way.classic', blind: 'games.couch.way.blind', odd: 'games.couch.way.odd' };
export const WAY_NOTE: Record<CouchWay, MessageKey> = { classic: 'games.couch.way.classic.note', blind: 'games.couch.way.blind.note', odd: 'games.couch.way.odd.note' };

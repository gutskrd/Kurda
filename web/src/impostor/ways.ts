import type { CouchWay } from '@kurda/shared';
import type { MessageKey } from '../i18n/en';

/** The three one-phone ways to play, as the start page and setup name them, each with what the impostor is told. */
export const WAY_KEY: Record<CouchWay, MessageKey> = { classic: 'games.couch.way.classic', blind: 'games.couch.way.blind', odd: 'games.couch.way.odd' };
export const WAY_NOTE: Record<CouchWay, MessageKey> = { classic: 'games.couch.way.classic.note', blind: 'games.couch.way.blind.note', odd: 'games.couch.way.odd.note' };

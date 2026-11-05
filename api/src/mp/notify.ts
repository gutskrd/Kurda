/**
 * The bus rooms the multiplayer learning games' long-polls are woken through
 * (story-games/notifier.ts with this prefix): a lobby's version, published by
 * whichever instance committed a change, so a poll waiting on another
 * instance answers at once. Never `user:` (the gateway's per-user channel),
 * and never the story games' own `story-game:`.
 */
export const MP_ROOM_PREFIX = 'mp-game:';

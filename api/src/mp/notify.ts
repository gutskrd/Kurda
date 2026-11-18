/**
 * Bus room prefix for waking the multiplayer games' long-polls on every instance (story-games/notifier.ts with this
 * prefix). Must differ from `user:` (the gateway's per-user channel) and the story games' `story-game:`.
 */
export const MP_ROOM_PREFIX = 'mp-game:';

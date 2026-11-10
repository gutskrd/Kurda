/**
 * What a Hevalo+ member is given, as numbers the server pays by and the apps
 * can say. Membership itself is the server's to decide (an end date on the
 * account); nothing here grants it.
 *
 * The streak benefits sit with the streak's own rules: one free restore a
 * month (`PLUS_FREE_REPAIRS_PER_MONTH`, streak-repair.ts) and room for a
 * second streak freeze (the server's streak logic).
 */

/** Gems a member receives with each day's reward, once a day, on a day they learned. */
export const PLUS_DAILY_GEMS = 5;

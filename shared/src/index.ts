export { normalizeKurdish, foldDiacritics } from './kurdish-text.js';
export { escapeHtml, stripControlChars, hasHtmlSpecialChars } from './sanitize.js';
export { XSS_PAYLOADS } from './xss-corpus.js';
export { COUNTRIES, countriesIn, countryName, type Country } from './countries.js';
export {
  buildInviteUrl,
  invitePath,
  inviteLinkPattern,
  parseInvite,
  inviteRoutePath,
  type GameInvite,
  type GameInviteType,
} from './game-invites.js';
export {
  APP_LOCALES,
  APP_LOCALE_CODES,
  DEFAULT_LOCALE,
  isAppLocale,
  localeDir,
  localeFromTag,
  type AppLocale,
} from './locales.js';
/**
 * Group role rules (KUR-084). Here rather than in the API because all three
 * apps decide what to show from them, and three copies of who-can-remove-whom
 * is three chances to disagree about it.
 */
export {
  ROLES,
  MAX_GROUP_MEMBERS,
  isRole,
  roleRank,
  outranks,
  canManage,
  canSetRole,
  type Role,
} from './group-roles.js';

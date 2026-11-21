import type { TranslationKey } from '../i18n/translations';

/**
 * Settings → About Hevalo: third-party work Hevalo uses, and its licences. Phosphor's icon paths (MIT) ship in
 * src/theme/icon-paths.ts with their notice. Noto Emoji (Apache 2.0) is the website's, and its line says where it is
 * used. The shop art and stickers are Hevalo's own (scripts/generate-cosmetic-art.mjs).
 */
export const CREDIT_LINES: readonly TranslationKey[] = [
  'settings.credits.icons',
  'settings.credits.emoji',
];

/** What a credit line credits, and its licence after the dash, so each can be set as a row's name and the line under it. */
export function splitCredit(line: string): { work: string; licence: string | null } {
  const at = Math.max(line.lastIndexOf(' — '), line.lastIndexOf(' – '));
  return at < 0 ? { work: line, licence: null } : { work: line.slice(0, at), licence: line.slice(at + 3) };
}

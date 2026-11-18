import type { TranslationKey } from '../i18n/translations';

/**
 * Settings → About Hevalo: third-party work Hevalo uses, and its licences. Phosphor's icon paths (MIT) ship in
 * src/theme/icon-paths.ts with their notice. Vazirmatn (OFL) and Noto Emoji (Apache 2.0) are the website's, and
 * their lines say where they are used. The shop art and stickers are Hevalo's own (scripts/generate-cosmetic-art.mjs).
 */
export const CREDIT_LINES: readonly TranslationKey[] = [
  'settings.credits.fonts',
  'settings.credits.icons',
  'settings.credits.emoji',
];

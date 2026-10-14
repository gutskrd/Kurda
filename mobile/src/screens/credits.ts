import type { TranslationKey } from '../i18n/translations';

/**
 * Settings → About Hevalo: whose work Hevalo uses, and under which licence.
 *
 * The phone ships Phosphor's icon paths (MIT; their notice is in
 * src/theme/icon-paths.ts). The Vazirmatn typeface (OFL) and the Noto Emoji
 * images (Apache 2.0) are the browser's, so their lines say where they are
 * used. The shop's art and the stickers are Hevalo's own, drawn by
 * scripts/generate-cosmetic-art.mjs — the last line says so.
 */
export const CREDIT_LINES: readonly TranslationKey[] = [
  'settings.credits.fonts',
  'settings.credits.icons',
  'settings.credits.emoji',
];

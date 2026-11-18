import type { GameDialect } from './games/dialect.js';

/** Three Kurdish openers an empty chat offers, each sent with one tap: content, the same in every interface language. */
export const CHAT_GREETINGS: Record<GameDialect, readonly string[]> = {
  kmr: ['Silav! 👋', 'Rojbaş!', 'Çawa yî?'],
  ckb: ['سڵاو! 👋', 'بەیانیت باش!', 'چۆنی؟'],
};

/**
 * The variety an empty chat greets in: the interface's own when it is a Kurdish one, so a reader in Soranî is offered
 * Soranî whichever course they take, else the variety of their course, Kurmancî before the first lesson.
 */
export function greetingDialect(locale: string, course: GameDialect | null): GameDialect {
  if (locale === 'ckb') return 'ckb';
  if (locale === 'ku') return 'kmr';
  return course ?? 'kmr';
}

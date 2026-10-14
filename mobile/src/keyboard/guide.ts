import {
  KEYBOARD_GUIDES,
  KURMANCI_SPECIAL,
  SORANI_SPECIAL,
  detectKeyboardPlatform,
  normalizeTyping,
  type KeyboardPlatform,
  type KeyboardStep,
  type TypingDialect,
} from '@kurda/shared';

/**
 * The "get the Kurdish keyboard" card's logic, apart from how it looks.
 *
 * Which device's steps to show, how a step's sentence and the names on the
 * device's own screens fit together, and how far the "try it" box has got.
 */

/** Accent misses in one race after which the result offers the keyboard guide. */
export const GUIDE_AFTER_MISSES = 3;

/**
 * The phone the app is running on, from React Native's `Platform.OS` — or, on
 * the web build, the browser's user agent. Null when it cannot tell; the card
 * then lets you choose.
 */
export function guidePlatform(platformOS: string, userAgent = ''): KeyboardPlatform | null {
  return detectKeyboardPlatform(userAgent, platformOS === 'web' ? undefined : platformOS);
}

export function guideSteps(platform: KeyboardPlatform, dialect: TypingDialect): readonly KeyboardStep[] {
  return KEYBOARD_GUIDES[platform][dialect];
}

/**
 * A step's sentence cut where the device's own names go: `{0}` and the like
 * become those names, marked so they can be set in bold. The names stay in
 * English on purpose — "Kurdish (Latin)" in translation is a menu item
 * nobody can find on their phone.
 */
export function stepParts(step: KeyboardStep, sentence: string): Array<{ text: string; ui: boolean }> {
  const parts: Array<{ text: string; ui: boolean }> = [];
  const re = /\{(\d+)\}/g;
  let last = 0;
  for (let m = re.exec(sentence); m; m = re.exec(sentence)) {
    if (m.index > last) parts.push({ text: sentence.slice(last, m.index), ui: false });
    const name = step.ui?.[Number(m[1])];
    parts.push(name === undefined ? { text: m[0], ui: false } : { text: name, ui: true });
    last = m.index + m[0].length;
  }
  if (last < sentence.length) parts.push({ text: sentence.slice(last), ui: false });
  return parts;
}

/** The letters the "try it" box asks for, for a variety. */
export function tryLetters(dialect: TypingDialect): readonly string[] {
  return dialect === 'sorani' ? SORANI_SPECIAL.slice(0, 5) : KURMANCI_SPECIAL;
}

/**
 * Which of the letters have been typed into the "try it" box. Upper or lower
 * case, and however the keyboard encoded them (a decomposed ê is ê), each
 * counts once it is anywhere in the box.
 */
export function lettersTyped(dialect: TypingDialect, text: string): Set<string> {
  const typed = normalizeTyping(text, dialect).toLowerCase();
  return new Set(tryLetters(dialect).filter((l) => typed.includes(l)));
}

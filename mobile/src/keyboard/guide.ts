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
 * The keyboard guide's logic: which device's steps to show, how a step's sentence and the device's menu names
 * combine, and progress in the "try it" box.
 */

/** Accent misses in one race after which the result offers the keyboard guide. */
export const GUIDE_AFTER_MISSES = 3;

/** The platform from React Native's `Platform.OS`, or on the web from the user agent. Null when unknown, and the card lets you choose. */
export function guidePlatform(platformOS: string, userAgent = ''): KeyboardPlatform | null {
  return detectKeyboardPlatform(userAgent, platformOS === 'web' ? undefined : platformOS);
}

export function guideSteps(platform: KeyboardPlatform, dialect: TypingDialect): readonly KeyboardStep[] {
  return KEYBOARD_GUIDES[platform][dialect];
}

/**
 * A step's sentence split where the device's menu names go (`{0}` and so on), marked for bold. The names stay in
 * English on purpose: a translated "Kurdish (Latin)" is a menu item nobody can find.
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

/** Which letters have been typed into the "try it" box, in either case and however encoded (a decomposed ê counts as ê). */
export function lettersTyped(dialect: TypingDialect, text: string): Set<string> {
  const typed = normalizeTyping(text, dialect).toLowerCase();
  return new Set(tryLetters(dialect).filter((l) => typed.includes(l)));
}

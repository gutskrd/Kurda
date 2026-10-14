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
import type { MessageKey } from '../i18n/en';

/**
 * The "get the Kurdish keyboard" card's logic, apart from how it looks: which
 * device's steps to show, how a step's sentence and the names on the device's
 * own screens fit together, and how far the "try it" box has got.
 */

/** Accented letters missed in one race after which its result offers the guide. */
export const GUIDE_AFTER_MISSES = 3;

/** After "Not now" on a race's result, the guide waits this long before it is offered there again. */
export const GUIDE_SNOOZE_MS = 14 * 24 * 3_600_000;

/**
 * Whether a race's result offers the keyboard guide: three or more accented
 * letters went in without their accent — unless the guide was shown just
 * before this very race (the same guide twice in a minute is nagging, not
 * help), "Later" was said to it lately, or the run was not scored.
 */
export function guideNudgeDue(
  result: { implausible: boolean; accentMisses: number },
  {
    guidedThisRace,
    dismissedAt,
    now = Date.now(),
  }: { guidedThisRace: boolean; dismissedAt: number | null; now?: number },
): boolean {
  if (result.implausible || result.accentMisses < GUIDE_AFTER_MISSES || guidedThisRace) return false;
  return dismissedAt === null || now - dismissedAt >= GUIDE_SNOOZE_MS;
}

/**
 * Every step sentence of every guide, as a message key.
 *
 * The guides live in @kurda/shared with their English; the words a reader
 * sees come from the catalogues. Listing the keys here ties the two together:
 * a step added to the shared guides without a sentence in the catalogues fails
 * the test beside this file, not on somebody's screen.
 */
export const GUIDE_STEP_KEYS: Record<string, MessageKey> = {
  'keyboardGuide.android.open': 'keyboardGuide.android.open',
  'keyboardGuide.android.add': 'keyboardGuide.android.add',
  'keyboardGuide.android.kurmanci': 'keyboardGuide.android.kurmanci',
  'keyboardGuide.android.switch': 'keyboardGuide.android.switch',
  'keyboardGuide.android.sorani': 'keyboardGuide.android.sorani',
  'keyboardGuide.android.switchSorani': 'keyboardGuide.android.switchSorani',
  'keyboardGuide.ios.noKurmanci': 'keyboardGuide.ios.noKurmanci',
  'keyboardGuide.ios.addTurkish': 'keyboardGuide.ios.addTurkish',
  'keyboardGuide.ios.switch': 'keyboardGuide.ios.switch',
  'keyboardGuide.ios.keyBar': 'keyboardGuide.ios.keyBar',
  'keyboardGuide.ios.openKeyboards': 'keyboardGuide.ios.openKeyboards',
  'keyboardGuide.ios.addSorani': 'keyboardGuide.ios.addSorani',
  'keyboardGuide.windows.open': 'keyboardGuide.windows.open',
  'keyboardGuide.windows.languageOptions': 'keyboardGuide.windows.languageOptions',
  'keyboardGuide.windows.turkishQ': 'keyboardGuide.windows.turkishQ',
  'keyboardGuide.windows.switch': 'keyboardGuide.windows.switch',
  'keyboardGuide.windows.addLanguage': 'keyboardGuide.windows.addLanguage',
  'keyboardGuide.windows.switchSorani': 'keyboardGuide.windows.switchSorani',
  'keyboardGuide.mac.open': 'keyboardGuide.mac.open',
  'keyboardGuide.mac.kurmanci': 'keyboardGuide.mac.kurmanci',
  'keyboardGuide.mac.typeKurmanci': 'keyboardGuide.mac.typeKurmanci',
  'keyboardGuide.mac.switch': 'keyboardGuide.mac.switch',
  'keyboardGuide.mac.sorani': 'keyboardGuide.mac.sorani',
  'keyboardGuide.linux.open': 'keyboardGuide.linux.open',
  'keyboardGuide.linux.kurmanci': 'keyboardGuide.linux.kurmanci',
  'keyboardGuide.linux.switch': 'keyboardGuide.linux.switch',
  'keyboardGuide.linux.sorani': 'keyboardGuide.linux.sorani',
};

/** What each device is called in the card's "on another device?" list. */
export const PLATFORM_NAME: Record<KeyboardPlatform, MessageKey> = {
  ios: 'keyboard.platform.ios',
  android: 'keyboard.platform.android',
  windows: 'keyboard.platform.windows',
  mac: 'keyboard.platform.mac',
  linux: 'keyboard.platform.linux',
};

/**
 * The device this browser is on, or null when it cannot tell (a Chromebook,
 * say) — the card then asks. An iPad's Safari says it is a Mac; a touch screen
 * gives it away.
 */
export function browserPlatform(): KeyboardPlatform | null {
  if (typeof navigator === 'undefined') return null;
  let coarsePointer = false;
  try {
    coarsePointer = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  } catch {
    // no media queries: a desktop guess is the safe one
  }
  return detectKeyboardPlatform(navigator.userAgent, undefined, { coarsePointer });
}

export function guideSteps(platform: KeyboardPlatform, dialect: TypingDialect): readonly KeyboardStep[] {
  return KEYBOARD_GUIDES[platform][dialect];
}

/**
 * A step's sentence cut where the device's own names go: `{0}` and the like
 * become those names, marked so they can be set apart. The names stay in
 * English on purpose — "Kurdish (Latin)" in translation is a menu item nobody
 * can find on their screen.
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

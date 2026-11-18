/**
 * "Your streak was kept": what Learn says once after a freeze covered a missed day. The server spends the freeze
 * and records the day (`freezeUsedOn`); this device remembers the last day it announced, so each is said once.
 * Pure.
 */
import { freezeLine } from '@kurda/shared';
import type { TranslationKey } from '../i18n/translations';
import type { Streak } from './format';

/** Kept on this phone, per account: the last kept day it has said. */
export const KEPT_KEY = 'hevalo_streak_kept_v1';

export function keptKey(userId: string): string {
  return `${KEPT_KEY}:${userId}`;
}

/** The most freezes held at once, when the server does not say (older responses). */
const MAX_FREEZES = 1;

/** Whole days from one 'YYYY-MM-DD' to another. */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/**
 * Whether to announce a kept streak: a freeze was spent on a day not yet announced (`acknowledged` is the last),
 * and it kept the current run (the kept day is the last counted day, or the one before today). A freeze from
 * weeks ago, seen on a newly signed-in device, stays unsaid.
 */
export function streakKept(streak: Streak | null, acknowledged: string | null): boolean {
  const used = streak?.freezeUsedOn;
  if (!streak || !used || streak.current <= 0 || !streak.lastActiveOn) return false;
  if (acknowledged !== null && used <= acknowledged) return false;
  const since = daysBetween(used, streak.lastActiveOn);
  return since === 0 || since === 1;
}

/** The freezes held, of the most there is room for: the places the sheet draws. */
export function freezeSlots(streak: Streak): { held: number; max: number } {
  const max = Math.max(1, streak.maxFreezes ?? MAX_FREEZES);
  return { held: Math.max(0, Math.min(max, streak.freezes)), max };
}

/** A message to look up: a catalogue key and what fills it in. */
export interface KeptWords {
  key: TranslationKey;
  params?: Record<string, number>;
}

/** The headline: "Your 6-day streak was kept by a freeze". */
export function keptTitle(streak: Streak): KeptWords {
  return streak.current === 1 ? { key: 'learn.kept.titleOne' } : { key: 'learn.kept.title', params: { count: streak.current } };
}

/**
 * How the next freeze comes: one is ready (a later lesson earned it back), or so many more lessons earn it. Null
 * when the server does not say.
 */
export function nextFreeze(streak: Streak): KeptWords | null {
  const line = freezeLine(streak);
  if (!line) return null;
  if (line.kind === 'ready') return { key: 'learn.kept.ready' };
  const left = Math.max(1, line.per - line.done);
  return left === 1 ? { key: 'learn.kept.earnOne' } : { key: 'learn.kept.earn', params: { count: left } };
}

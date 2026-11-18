/**
 * The characters an exercise's Kurdish can be planned for (`voice` on its payload), in the panel's order, and their
 * names in the plan. Hamo comes first as the main voice of a course. The plan calls the niece Xezal, her name in the
 * story, where the apps label her Xezo.
 */
import { CHARACTER_NAMES, type SpeakerId } from '@kurda/shared';

/** The characters a line can be planned for, in the order every list of them is shown. */
export const VOICE_ORDER: readonly SpeakerId[] = ['hamo', 'xezo', 'hevalo'];

const PLAN_NAMES: Partial<Record<SpeakerId, string>> = { xezo: 'Xezal' };

/** What the plan calls a character: "Hamo", "Xezal", "Hevalo". */
export function voiceName(voice: SpeakerId): string {
  return PLAN_NAMES[voice] ?? CHARACTER_NAMES[voice];
}

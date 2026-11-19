/**
 * The characters an exercise's Kurdish can be planned for (`voice` on its payload), in the panel's order, and their
 * names. Hamo comes first as the main voice of a course.
 */
import { CHARACTER_NAMES, type SpeakerId } from '@kurda/shared';

/** The characters a line can be planned for, in the order every list of them is shown. */
export const VOICE_ORDER: readonly SpeakerId[] = ['hamo', 'xezo', 'hevalo'];

/** What the plan and the apps call a character: "Hamo", "Xezo", "Hevalo". */
export function voiceName(voice: SpeakerId): string {
  return CHARACTER_NAMES[voice];
}

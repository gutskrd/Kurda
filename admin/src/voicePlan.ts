/**
 * Who records what: the characters an exercise's Kurdish is planned for
 * (`voice` on its payload), in the order the panel offers them, and what the
 * plan calls each of them.
 *
 * Hamo comes first because he records most of a course: he is its main
 * voice, Xezal most of the rest, and Hevalo, the guide, little. The plan uses
 * the names the story gives the characters, so the niece is Xezal here,
 * where the apps label her as her uncle calls her, Xezo.
 */
import { CHARACTER_NAMES, isSpeakerId, type SpeakerId } from '@kurda/shared';

/** The characters a line can be planned for, in the order every list of them is shown. */
export const VOICE_ORDER: readonly SpeakerId[] = ['hamo', 'xezo', 'hevalo'];

const PLAN_NAMES: Partial<Record<SpeakerId, string>> = { xezo: 'Xezal' };

/** What the plan calls a character: "Hamo", "Xezal", "Hevalo". */
export function voiceName(voice: SpeakerId): string {
  return PLAN_NAMES[voice] ?? CHARACTER_NAMES[voice];
}

/** A payload's planned voice, or null when it names none (or one that is not a character). */
export function plannedVoiceOf(payload: unknown): SpeakerId | null {
  const voice = typeof payload === 'object' && payload !== null ? (payload as { voice?: unknown }).voice : undefined;
  return isSpeakerId(voice) ? voice : null;
}

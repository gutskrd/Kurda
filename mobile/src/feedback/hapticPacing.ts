/**
 * The pacing rules live in @kurda/shared (haptics.ts), so the phone and the
 * website buzz by the same rules; this is where the phone reads them.
 */
export { HAPTIC_EVENTS, PACING, createPacer, type HapticEvent, type Pacer, type PacingRules } from '@kurda/shared';

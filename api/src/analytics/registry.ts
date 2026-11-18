import { z } from 'zod';

/**
 * The analytics events the ingest accepts. Each payload is validated against its schema here; unknown or
 * malformed events are dropped and counted.
 */
export const EVENT_SCHEMAS = {
  screen_view: z.object({ screen: z.string().min(1).max(80) }),
  lesson_start: z.object({ lessonId: z.string().min(1) }),
  lesson_complete: z.object({
    lessonId: z.string().min(1),
    correct: z.number().int().nonnegative(),
    total: z.number().int().positive(),
  }),
  practice_complete: z.object({ items: z.number().int().nonnegative() }),
  game_start: z.object({ roomId: z.string().min(1), mode: z.string().min(1).max(20) }),
  game_finish: z.object({ roomId: z.string().min(1), won: z.boolean() }),
  purchase: z.object({ sku: z.string().min(1).max(80), currency: z.string().max(10) }),
  experiment_exposure: z.object({ experiment: z.string().min(1).max(64), variant: z.string().min(1).max(64) }),
} as const;

export type EventType = keyof typeof EVENT_SCHEMAS;

export function isKnownEvent(type: string): type is EventType {
  return Object.prototype.hasOwnProperty.call(EVENT_SCHEMAS, type);
}

export type ValidationOutcome =
  | { ok: true; type: EventType; payload: unknown }
  | { ok: false; reason: 'unknown_type' | 'invalid_payload' };

/** Validate an event against the registry: unknown type or bad payload → dropped. */
export function validateEvent(type: string, payload: unknown): ValidationOutcome {
  if (!isKnownEvent(type)) return { ok: false, reason: 'unknown_type' };
  const parsed = EVENT_SCHEMAS[type].safeParse(payload);
  if (!parsed.success) return { ok: false, reason: 'invalid_payload' };
  return { ok: true, type, payload: parsed.data };
}

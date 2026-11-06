/**
 * Who may record from the "Record by person" page, and what.
 *
 * The studio's roles (whoever may edit content, and the legacy admin) record
 * anything, as they always have. The voice actor role opens the people page
 * and the two upload routes and nothing else in the console; an account that
 * holds it without a studio role sees only the voices linked to it, and may
 * store a take only of one of those voices' lines — so a voice actor cannot
 * replace another person's recordings, or record a phrase no lesson asks for.
 * Every check is here, on the server; the console only hides what it would
 * refuse.
 *
 * One people service per app, made by the people routes and shared with the
 * upload routes' check, so the script is built once a minute for both.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { VOICE_ACTOR_ROLE } from '../admin/roles.js';
import { AppError } from '../plugins/errors.js';
import type { LineStore } from './script.js';
import { RecordingPeopleService, type RecordingPeopleOptions } from './service.js';

/** The studio's recording roles: ALPHABET_AUDIO_ROLES and LESSON_AUDIO_ROLES (the test keeps them the same). */
export const STUDIO_ROLES = ['superadmin', 'content_editor', 'admin'] as const;

/** Who may use the people page and send takes from it. */
export const RECORDING_ROLES: readonly string[] = [...STUDIO_ROLES, VOICE_ACTOR_ROLE];

/** A voice actor with no studio role: they record their own voices' lines, and only those. */
export function recordsOwnVoicesOnly(roles: readonly string[]): boolean {
  return roles.includes(VOICE_ACTOR_ROLE) && !roles.some((r) => (STUDIO_ROLES as readonly string[]).includes(r));
}

const services = new WeakMap<FastifyInstance, RecordingPeopleService>();

/** The app's people service, made on first use (with `options`, which only the first call's count). */
export function recordingPeople(app: FastifyInstance, options?: RecordingPeopleOptions): RecordingPeopleService {
  let service = services.get(app);
  if (!service) {
    service = new RecordingPeopleService(app.db, options);
    services.set(app, service);
  }
  return service;
}

/**
 * Refuse a take a voice actor may not make: anything that is not a line of a
 * voice linked to their account. Called by the upload routes before the file
 * is stored, so a refused take costs no storage.
 */
export async function assertMayRecord(app: FastifyInstance, req: FastifyRequest, store: LineStore, key: string): Promise<void> {
  const user = req.user;
  if (!user || !recordsOwnVoicesOnly(user.roles)) return;
  if (await recordingPeople(app).mayRecord(user.id, store, key)) return;
  throw new AppError('NOT_YOUR_LINE', 403, 'this line is not one of the voices linked to your account');
}

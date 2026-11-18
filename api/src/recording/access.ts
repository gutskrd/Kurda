/**
 * Who may record from the "Record by person" page, and what. Studio roles record anything. The voice actor role opens
 * the people page and the two upload routes only; without a studio role it sees only its linked voices and may store
 * takes only of their lines, so it cannot replace others' recordings or record phrases no lesson uses. Every check is
 * here on the server; the console only hides what it would refuse. One people service per app is shared by the people
 * and upload routes, so the script is built at most once a minute.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { VOICE_ACTOR_ROLE } from '../admin/roles.js';
import { AppError } from '../plugins/errors.js';
import type { LineStore } from './script.js';
import { RecordingPeopleService, type RecordingPeopleOptions } from './service.js';

/** The studio's recording roles, equal to ALPHABET_AUDIO_ROLES and LESSON_AUDIO_ROLES (a test keeps them in step). */
export const STUDIO_ROLES = ['superadmin', 'content_editor', 'admin'] as const;

/** Who may use the people page and send takes from it. */
export const RECORDING_ROLES: readonly string[] = [...STUDIO_ROLES, VOICE_ACTOR_ROLE];

/** A voice actor with no studio role: they record their own voices' lines, and only those. */
export function recordsOwnVoicesOnly(roles: readonly string[]): boolean {
  return roles.includes(VOICE_ACTOR_ROLE) && !roles.some((r) => (STUDIO_ROLES as readonly string[]).includes(r));
}

const services = new WeakMap<FastifyInstance, RecordingPeopleService>();

/** The app's people service, made on first use; only the first call's `options` count. */
export function recordingPeople(app: FastifyInstance, options?: RecordingPeopleOptions): RecordingPeopleService {
  let service = services.get(app);
  if (!service) {
    service = new RecordingPeopleService(app.db, options);
    services.set(app, service);
  }
  return service;
}

/** Refuses a take a voice actor may not make (anything but a line of a voice linked to them), before the file is stored. */
export async function assertMayRecord(app: FastifyInstance, req: FastifyRequest, store: LineStore, key: string): Promise<void> {
  const user = req.user;
  if (!user || !recordsOwnVoicesOnly(user.roles)) return;
  if (await recordingPeople(app).mayRecord(user.id, store, key)) return;
  throw new AppError('NOT_YOUR_LINE', 403, 'this line is not one of the voices linked to your account');
}

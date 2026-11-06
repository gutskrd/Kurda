/**
 * Recording by person: everything each voice of the course has to say, in
 * course order, for the admin's "Record by person" page.
 *
 *   GET /admin/recording/people           one entry per voice — the voice plan's characters, any
 *                                         conversation part no character plays, a narrator for each
 *                                         variety — with what is recorded and what is left, by variety;
 *                                         and the voices linked to the account asking (`mine`)
 *   GET /admin/recording/people/:voice    that voice's lines, a page at a time (`?cursor=` from the
 *                                         page before), narrowed by `?dialect=kmr|ckb` and
 *                                         `?status=todo|done|all`; each with the key its take is filed
 *                                         under, what it means, where it is said and whether that is
 *                                         published, the line before it, and its take if there is one
 *
 * Read-only: a take is sent to the upload route the studio already uses
 * (PUT /admin/lesson-audio, PUT /admin/alphabet/audio), with the voice's
 * speaker and a lip-sync timeline, so it is filed and audited as any take is.
 * Who may read what is recording/access.ts: a voice actor sees only the
 * voices linked to their account.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireRoles } from '../plugins/auth.js';
import { AppError } from '../plugins/errors.js';
import { RECORDING_ROLES, recordingPeople, recordsOwnVoicesOnly } from './access.js';
import { voiceLinks } from './links.js';
import { VOICE_ID, linesFor, pageAfter, sectionsOf, tally, type ScriptLine } from './script.js';
import type { RecordingPeopleOptions } from './service.js';

/** The most lines one page holds: a voice's whole script is a few pages of this. */
export const LINES_PAGE_MAX = 500;
const LINES_PAGE_DEFAULT = 200;

const voiceParams = z.object({ voice: z.string().regex(VOICE_ID) });
const linesQuery = z.object({
  dialect: z.enum(['kmr', 'ckb']).optional(),
  status: z.enum(['todo', 'done', 'all']).optional(),
  cursor: z.string().regex(/^\d{1,7}$/).optional(),
  limit: z.coerce.number().int().min(1).max(LINES_PAGE_MAX).optional(),
});

export function registerRecordingRoutes(app: FastifyInstance, options: RecordingPeopleOptions = {}): void {
  const service = recordingPeople(app, options);
  const canRecord = requireRoles(...RECORDING_ROLES);

  app.get('/admin/recording/people', { config: { skipValidation: true }, preHandler: canRecord }, async (req) => {
    const own = recordsOwnVoicesOnly(req.user!.roles);
    const [built, recorded, mine, links] = await Promise.all([
      service.script(),
      service.recordedKeys(),
      service.voicesOf(req.user!.id),
      // who records what is the team's to know, not each voice actor's
      own ? Promise.resolve(new Map()) : voiceLinks(app.db),
    ]);
    const done = (l: ScriptLine): boolean => recorded[l.store].has(l.key);
    const byVoice = new Map<string, ScriptLine[]>();
    for (const l of built.lines) {
      const list = byVoice.get(l.voice);
      if (list) list.push(l);
      else byVoice.set(l.voice, [l]);
    }
    return {
      people: built.people
        .filter((p) => !own || mine.includes(p.id))
        .map((p) => ({ ...p, ...tally(byVoice.get(p.id) ?? [], done), linked: links.get(p.id) ?? [] })),
      mine,
      /** the account records only its own voices: the page says so, rather than show a list of one */
      ownVoicesOnly: own,
    };
  });

  app.get(
    '/admin/recording/people/:voice',
    { schema: { params: voiceParams, querystring: linesQuery }, preHandler: canRecord },
    async (req) => {
      const { voice } = req.params as z.infer<typeof voiceParams>;
      const q = req.query as z.infer<typeof linesQuery>;
      const [built, recorded] = await Promise.all([service.script(), service.recordedKeys()]);
      const person = built.people.find((p) => p.id === voice);
      if (!person) throw new AppError('NOT_FOUND', 404, 'nobody records that voice');
      if (recordsOwnVoicesOnly(req.user!.roles) && !(await service.voicesOf(req.user!.id)).includes(voice)) {
        throw new AppError('NOT_YOUR_VOICE', 403, 'that voice is not linked to your account');
      }
      const done = (l: ScriptLine): boolean => recorded[l.store].has(l.key);
      const theirs = linesFor(built.lines, { voice, dialect: q.dialect ?? null }, done);
      const matching = q.status && q.status !== 'all' ? linesFor(theirs, { voice, status: q.status }, done) : theirs;
      const page = pageAfter(matching, q.cursor === undefined ? null : Number(q.cursor), q.limit ?? LINES_PAGE_DEFAULT);
      const takes = await service.takes(page.lines);
      return {
        person: { ...person, ...tally(theirs, done) },
        lines: page.lines.map((l) => ({ ...l, take: takes.get(l.id) ?? null })),
        next: page.next === null ? null : String(page.next),
        total: matching.length,
        sections: sectionsOf(theirs, done),
      };
    },
  );
}

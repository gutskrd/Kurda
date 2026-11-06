import type pg from 'pg';
import { stripControlChars } from '@kurda/shared';
import { AppError } from '../plugins/errors.js';
import { assertUnrestricted } from '../moderation/restrictions.js';
import type { ModerationService } from '../moderation/service.js';
import type { TrustService } from '../trust/service.js';
import type { AiModerationService } from '../moderation/ai-service.js';

type Executor = Pick<pg.Pool, 'query'>;

/** The parts of the chat pipeline the gate runs, narrow so tests can stand in for them. */
export interface FreeTextDeps {
  db: Executor;
  moderation: Pick<ModerationService, 'isChatMuted' | 'filter' | 'recordOffense'>;
  trust?: Pick<TrustService, 'checkAction' | 'assessContent' | 'recordAction'>;
  aiMod?: Pick<AiModerationService, 'moderate'>;
}

export interface FreeTextOptions {
  /** the most characters (code points) one move's text may have */
  maxLength: number;
  /** what the text belongs to, for a moderation flag (`<game>:<lobbyId>`) */
  contentRef: string;
}

/**
 * The one way free text a player types in a game — a clue, a guess, a made-up
 * definition — gets anywhere near another player: the same checks a direct
 * message passes, in the same order (chat/routes.ts), before the move is
 * judged by the game at all.
 *
 * 1. Cleaned and capped: control characters out, spaces collapsed, at most
 *    `maxLength` characters (400 otherwise).
 * 2. Nobody muted from chat — by an admin, the queue or the spam engine
 *    (`assertUnrestricted`, 403 MUTED) or by the offense ladder (403
 *    CHAT_MUTED) — types to other players in a game either.
 * 3. The trust level's velocity cap for messages (429 TRUST_VELOCITY), and the
 *    duplicate and burst spam check, which can restrict the account (403
 *    AUTO_MODERATED).
 * 4. The wordlist filter: a flagged text is refused outright (422
 *    TEXT_NOT_ALLOWED) rather than masked as a chat message is, because a
 *    starred-out clue is no clue; it still counts as an offense on the ladder.
 * 5. The classifier: a high-confidence hit is refused (422 CONTENT_BLOCKED),
 *    lower ones are flagged for the moderators as chat ones are.
 *
 * What passes is returned as it will be stored with the move (for a report,
 * which judges what was written in the game) and shown — inside that game
 * only, to its players, never in a link or anywhere else.
 */
export async function gateFreeText(deps: FreeTextDeps, userId: string, raw: string, opts: FreeTextOptions): Promise<string> {
  const clean = stripControlChars(String(raw ?? ''))
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, ' ');
  if (!clean) throw new AppError('EMPTY_TEXT', 400, 'write something first');
  if ([...clean].length > opts.maxLength) {
    throw new AppError('TEXT_TOO_LONG', 400, `at most ${opts.maxLength} characters`, { max: opts.maxLength });
  }
  await assertUnrestricted(deps.db, userId, 'chat');
  if (await deps.moderation.isChatMuted(userId)) throw new AppError('CHAT_MUTED', 403, 'you are muted from chat');
  if (deps.trust) {
    const gate = await deps.trust.checkAction(userId, 'message');
    if (!gate.allowed) throw new AppError('TRUST_VELOCITY', 429, 'you are writing too fast — it slows down for new accounts');
    const spam = await deps.trust.assessContent(userId, clean);
    if (spam.enforced) throw new AppError('AUTO_MODERATED', 403, 'your account has been restricted for spam-like activity');
  }
  const filtered = deps.moderation.filter(clean);
  if (filtered.flagged) {
    await deps.moderation.recordOffense(userId).catch(() => undefined);
    throw new AppError('TEXT_NOT_ALLOWED', 422, 'that cannot be said here');
  }
  if (deps.aiMod) {
    const verdict = await deps.aiMod.moderate({ surface: 'chat', text: clean, authorId: userId, contentType: 'game', contentRef: opts.contentRef });
    if (verdict.blocked) throw new AppError('CONTENT_BLOCKED', 422, 'this was blocked by moderation');
  }
  await deps.trust?.recordAction(userId, 'message');
  return clean;
}

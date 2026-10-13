import type { AiModerationService } from '../moderation/ai-service.js';
import type { Surface } from '../moderation/policy.js';
import type { TrustService } from './service.js';

/** Why words were not let through, as the route answers. */
export interface GateRefusal {
  status: 429 | 403;
  code: 'TRUST_VELOCITY' | 'AUTO_MODERATED';
  message: string;
}

/** What the screening is told about words that went up. */
export interface Screened {
  surface: Surface;
  contentType: 'post' | 'caption';
  contentRef: string;
  text: string;
}

interface Log {
  warn: (obj: unknown, msg?: string) => void;
}

/**
 * The one gate every way of putting words in front of readers goes through: a
 * new post, a draft published, an edit, a picture's caption or alt text
 * (KUR-295, #293).
 *
 * It used to be on the create route alone, so an edit or a publish went up
 * unscreened — post something harmless, then edit it — and a picture post went
 * up with no check at all. Each of those counts as a post now: the per-level
 * velocity cap first, the duplicate/burst spam check on the new words, and the
 * AI screening after it lands (which flags for review and never blocks —
 * reviewers decide, as they always have for written posts).
 *
 * Without a trust service (no Redis in a test app) the gate is open, as the
 * trust checks have always been.
 */
export class PostGate {
  constructor(
    private readonly trust: TrustService | undefined,
    private readonly aiMod: AiModerationService | undefined,
    private readonly log: Log,
  ) {}

  /**
   * Before the write: may this person post now, and are these words spam?
   * `words` is only what is new — empty for a post that is only pictures, or an
   * edit that changes no words, and then only the velocity cap applies.
   */
  async check(userId: string, words: string): Promise<GateRefusal | null> {
    if (!this.trust) return null;
    // per-level velocity cap (KUR-295): new accounts post fewer per hour
    const gate = await this.trust.checkAction(userId, 'post');
    if (!gate.allowed) {
      return { status: 429, code: 'TRUST_VELOCITY', message: 'you are posting too fast — slow down for new accounts' };
    }
    // duplicate/burst spam → auto-mute/suspend before the words land
    if (words) {
      const spam = await this.trust.assessContent(userId, words);
      if (spam.enforced) {
        return { status: 403, code: 'AUTO_MODERATED', message: 'your account has been restricted for spam-like activity' };
      }
    }
    return null;
  }

  /** After the write: count it toward the cap and screen what readers now see. */
  async passed(userId: string, screened: Screened | null): Promise<void> {
    if (this.trust) await this.trust.recordAction(userId, 'post');
    if (this.aiMod && screened?.text) {
      await this.aiMod
        .moderate({ ...screened, authorId: userId })
        .catch((err) => this.log.warn({ err, surface: screened.surface }, 'auto-moderation failed'));
    }
  }
}

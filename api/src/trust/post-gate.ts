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
 * The one gate for every way words reach readers: a new post, a published draft, an edit, a caption or alt text. Each
 * counts as a post: the per-level velocity cap first, the duplicate and burst spam check on the new words, then
 * automated screening after it lands, which flags for review and never blocks. It is for people posting their own
 * content; staff editing someone else's post are not posting, so nothing is counted against them or flagged under
 * either name, and a draft staff publish is screened as its author's (`screen`) and counted against nobody. Without a
 * trust service (no Redis in a test app) the gate is open.
 */
export class PostGate {
  constructor(
    private readonly trust: TrustService | undefined,
    private readonly aiMod: AiModerationService | undefined,
    private readonly log: Log,
  ) {}

  /**
   * Before the write: may this person post now, and are these words spam? `words` is only what is new; when empty, as for
   * a pictures-only post or an edit changing no words, only the velocity cap applies.
   */
  async check(userId: string, words: string): Promise<GateRefusal | null> {
    if (!this.trust) return null;
    // Per-trust-level velocity cap: new accounts post less per hour.
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

  /** After the write: counts it toward the cap and screens what readers now see. */
  async passed(userId: string, screened: Screened | null): Promise<void> {
    if (this.trust) await this.trust.recordAction(userId, 'post');
    await this.screen(userId, screened);
  }

  /** Screens words that went up without counting as anyone's post, such as a draft staff published; a flag names `authorId`. */
  async screen(authorId: string, screened: Screened | null): Promise<void> {
    if (this.aiMod && screened?.text) {
      await this.aiMod
        .moderate({ ...screened, authorId })
        .catch((err) => this.log.warn({ err, surface: screened.surface }, 'auto-moderation failed'));
    }
  }
}

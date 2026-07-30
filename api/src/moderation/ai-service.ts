import { createHash } from 'node:crypto';
import type pg from 'pg';
import { classifyForSurface, HeuristicSpamClassifier, type ModerationClassifier } from './classifier.js';
import { evaluateForSurface, type CategoryScores, type ModerationAction, type Surface } from './policy.js';

export interface ModerateInput {
  surface: Surface;
  text: string;
  authorId: string;
  contentType: string; // 'dm' | 'comment' | 'post' | 'caption' | 'profile'
  contentRef?: string;
}

export interface ModerationOutcome {
  action: ModerationAction;
  /** publish is blocked on write (auto_block, or auto_hide on a send surface) */
  blocked: boolean;
  topCategory: string | null;
  topScore: number;
  flagId: string | null;
}

export interface PendingFlag {
  id: string;
  surface: string;
  contentType: string;
  contentRef: string | null;
  authorId: string | null;
  action: string;
  topCategory: string | null;
  topScore: number;
  modelVersion: string;
  createdAt: Date;
}

/** Small identical-text result cache to avoid re-classifying repeats. */
class TextCache {
  private readonly map = new Map<string, CategoryScores>();
  constructor(private readonly max = 500) {}
  get(key: string): CategoryScores | undefined {
    return this.map.get(key);
  }
  set(key: string, value: CategoryScores): void {
    if (this.map.size >= this.max) this.map.delete(this.map.keys().next().value as string);
    this.map.set(key, value);
  }
}

/**
 * AI-assisted moderation orchestrator (KUR-293). Sits *after* the #086 wordlist:
 * classifies text (provider-agnostic, fail-open/closed configurable), maps the
 * scores to an action via the policy engine, and records every above-`allow`
 * decision in `moderation_flags` — the automated tier feeding the #102 human
 * queue. Every automated action is reversible (false-positive appeals).
 */
export class AiModerationService {
  private readonly pool: pg.Pool;
  private readonly classifier: ModerationClassifier;
  private readonly failClosed: (surface: Surface) => boolean;
  private readonly cache = new TextCache();

  constructor(
    pool: pg.Pool,
    deps: { classifier?: ModerationClassifier; failClosed?: (surface: Surface) => boolean } = {},
  ) {
    this.pool = pool;
    this.classifier = deps.classifier ?? new HeuristicSpamClassifier();
    // default: high-risk surfaces fail closed, chat fails open (rely on reports)
    this.failClosed = deps.failClosed ?? ((s) => s !== 'chat');
  }

  /**
   * Moderate one piece of text. Persists a flag when the action is above
   * `allow`; `blocked` tells the caller whether to reject the write (auto_block,
   * and auto_hide on write-through surfaces like chat where "hide" == don't
   * deliver).
   */
  async moderate(input: ModerateInput): Promise<ModerationOutcome> {
    const key = `${input.surface}:${hash(input.text)}`;
    const cached = this.cache.get(key);
    let scores: CategoryScores;
    let modelVersion: string;
    let result;

    if (cached) {
      scores = cached;
      result = evaluateForSurface(scores, input.surface);
      modelVersion = 'cache';
    } else {
      const out = await classifyForSurface(this.classifier, input.text, input.surface, this.failClosed(input.surface));
      scores = out.scores;
      modelVersion = out.modelVersion;
      result = out.result;
      this.cache.set(key, scores);
    }

    let flagId: string | null = null;
    if (result.action !== 'allow') {
      flagId = await this.record(input, result.action, result.topCategory, result.topScore, scores, modelVersion);
    }

    return {
      action: result.action,
      // on chat, auto_hide also means "don't deliver" (there is nothing to hide
      // after the fact for a DM), so treat hide+block as blocked on write.
      blocked: result.blocked || result.action === 'auto_hide',
      topCategory: result.topCategory,
      topScore: result.topScore,
      flagId,
    };
  }

  /** Pending flags oldest-first — the automated feed for the #102 queue. */
  async pending(limit = 50): Promise<PendingFlag[]> {
    const res = await this.pool.query<{
      id: string; surface: string; content_type: string; content_ref: string | null;
      author_id: string | null; action: string; top_category: string | null;
      top_score: string; model_version: string; created_at: Date;
    }>(
      `SELECT id, surface, content_type, content_ref, author_id, action, top_category,
              top_score, model_version, created_at
       FROM moderation_flags WHERE status = 'pending' ORDER BY created_at ASC LIMIT $1`,
      [limit],
    );
    return res.rows.map((r) => ({
      id: r.id, surface: r.surface, contentType: r.content_type, contentRef: r.content_ref,
      authorId: r.author_id, action: r.action, topCategory: r.top_category,
      topScore: Number(r.top_score), modelVersion: r.model_version, createdAt: r.created_at,
    }));
  }

  /** Resolve a flag: `reversed` = false positive (content restored), else actioned. */
  async resolve(flagId: string, moderatorId: string, outcome: 'actioned' | 'reversed'): Promise<boolean> {
    const res = await this.pool.query(
      `UPDATE moderation_flags SET status = $2, resolved_at = now(), resolved_by = $3
       WHERE id = $1 AND status = 'pending'`,
      [flagId, outcome, moderatorId],
    );
    return (res.rowCount ?? 0) > 0;
  }

  private async record(
    input: ModerateInput,
    action: ModerationAction,
    topCategory: string | null,
    topScore: number,
    scores: CategoryScores,
    modelVersion: string,
  ): Promise<string> {
    const res = await this.pool.query<{ id: string }>(
      `INSERT INTO moderation_flags
         (surface, content_type, content_ref, author_id, action, top_category, top_score, scores, model_version)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9) RETURNING id`,
      [input.surface, input.contentType, input.contentRef ?? null, input.authorId, action, topCategory, topScore, JSON.stringify(scores), modelVersion],
    );
    return res.rows[0]!.id;
  }
}

function hash(text: string): string {
  return createHash('sha256').update(text.trim().toLowerCase()).digest('hex').slice(0, 24);
}

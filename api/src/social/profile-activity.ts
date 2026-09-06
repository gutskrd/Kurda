import type pg from 'pg';

/**
 * What a profile shows besides the person themselves: what they have posted and
 * how their recent games went.
 *
 * Every source already exists — library posts, image posts, and the per-game
 * tables — so this reads them rather than recording anything new. A profile is
 * a view over what someone has done, not a second copy of it.
 */

/** The sections a profile can show, in the order they appear. */
export const PROFILE_SECTIONS = ['stories', 'poems', 'images', 'games'] as const;
export type ProfileSection = (typeof PROFILE_SECTIONS)[number];

export function isProfileSection(value: string): value is ProfileSection {
  return (PROFILE_SECTIONS as readonly string[]).includes(value);
}

/**
 * Visible unless the owner says otherwise.
 *
 * Defaulting to on means a section added later appears for everyone without a
 * backfill; someone who wants it hidden turns it off, which is the choice they
 * were promised.
 */
export type SectionVisibility = Record<ProfileSection, boolean>;

export function resolveSections(stored: unknown): SectionVisibility {
  const bag = (stored ?? {}) as Record<string, unknown>;
  const out = {} as SectionVisibility;
  for (const key of PROFILE_SECTIONS) out[key] = bag[key] === false ? false : true;
  return out;
}

/** One thing that happened, in a shape every source can be flattened into. */
export interface ActivityEntry {
  id: string;
  kind: ProfileSection;
  /** what it was: a post title, or a game and how it went */
  title: string;
  /** a second line: an excerpt, a score, a result */
  detail: string | null;
  /** where to go when it is clicked, or null when there is nowhere */
  href: string | null;
  /** a resolved image, for the kinds that have one */
  imageUrl: string | null;
  at: Date;
}

export class ProfileActivityService {
  constructor(private readonly pool: pg.Pool) {}

  async sections(userId: string): Promise<SectionVisibility> {
    const res = await this.pool.query<{ profile_sections: unknown }>(
      `SELECT profile_sections FROM users WHERE id = $1`,
      [userId],
    );
    return resolveSections(res.rows[0]?.profile_sections);
  }

  /** Merge a partial choice over what is stored, so one toggle is one write. */
  async setSections(userId: string, partial: Partial<SectionVisibility>): Promise<SectionVisibility> {
    const res = await this.pool.query<{ profile_sections: unknown }>(
      `UPDATE users SET profile_sections = COALESCE(profile_sections, '{}'::jsonb) || $2::jsonb
        WHERE id = $1 RETURNING profile_sections`,
      [userId, JSON.stringify(partial)],
    );
    return resolveSections(res.rows[0]?.profile_sections);
  }

  /** Published stories or poems by this author, newest first. */
  async posts(userId: string, type: 'story' | 'poem', limit: number, offset: number): Promise<ActivityEntry[]> {
    const rows = await this.pool.query<{ id: string; title: string; body: string; created_at: Date }>(
      `SELECT id, title, body, COALESCE(published_at, created_at) AS created_at
         FROM library_posts
        WHERE author_id = $1 AND type = $2 AND status = 'published'
        ORDER BY COALESCE(published_at, created_at) DESC
        LIMIT $3 OFFSET $4`,
      [userId, type, limit, offset],
    );
    return rows.rows.map((r) => ({
      id: r.id,
      kind: type === 'story' ? 'stories' : 'poems',
      title: r.title,
      detail: excerpt(r.body),
      href: `/app/library/${r.id}`,
      imageUrl: null,
      at: r.created_at,
    }));
  }

  /** Published images by this author. The caller resolves the media key. */
  async images(
    userId: string,
    limit: number,
    offset: number,
  ): Promise<Array<ActivityEntry & { mediaId: string | null }>> {
    const rows = await this.pool.query<{
      id: string; caption: string | null; image_media_id: string | null; created_at: Date;
    }>(
      `SELECT id, caption, image_media_id, created_at
         FROM image_posts
        WHERE author_id = $1 AND status = 'published'
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3`,
      [userId, limit, offset],
    );
    return rows.rows.map((r) => ({
      id: r.id,
      kind: 'images' as const,
      title: r.caption?.trim() || 'Untitled',
      detail: null,
      href: `/app/dimen/${r.id}`,
      imageUrl: null,
      mediaId: r.image_media_id,
      at: r.created_at,
    }));
  }

  /**
   * Recent finished games across every mode, newest first.
   *
   * One UNION rather than four round trips, because the page wants them
   * interleaved by time — fetching each separately would mean over-fetching all
   * of them just to throw most away after sorting.
   *
   * Only finished games appear. A game still in progress is not a result.
   */
  async games(userId: string, limit: number, offset: number): Promise<ActivityEntry[]> {
    const rows = await this.pool.query<{
      id: string; game: string; outcome: string | null; detail: string | null; at: Date;
    }>(
      `SELECT id, game, outcome, detail, at FROM (
         SELECT w.id::text AS id, 'Wordle' AS game, w.status AS outcome,
                w.difficulty AS detail, w.finished_at AS at
           FROM wordle_games w
          WHERE w.user_id = $1 AND w.finished_at IS NOT NULL AND w.status <> 'playing'
         UNION ALL
         SELECT r.id::text, 'Rhyming Words', NULL,
                r.score::text || ' points', r.ended_at
           FROM rhyme_games r
          WHERE r.user_id = $1 AND r.ended_at IS NOT NULL
         UNION ALL
         SELECT g.id::text, 'Typing Race', NULL,
                g.wpm::text || ' WPM', g.finished_at
           FROM race_games g
          WHERE g.user_id = $1 AND g.finished_at IS NOT NULL
         UNION ALL
         SELECT b.battle_id::text, 'Wordle Battle',
                CASE WHEN b.solved THEN 'won' ELSE 'lost' END,
                b.guess_count::text || ' guesses', b.finished_at
           FROM wordle_battle_players b
          WHERE b.user_id = $1 AND b.finished_at IS NOT NULL
       ) AS played
       ORDER BY at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset],
    );
    return rows.rows.map((r) => ({
      id: `${r.game}:${r.id}`,
      kind: 'games' as const,
      title: r.game,
      detail: [r.outcome ? outcomeLabel(r.outcome) : null, r.detail].filter(Boolean).join(' · ') || null,
      href: null,
      imageUrl: null,
      at: r.at,
    }));
  }
}

/** "won"/"lost" read better capitalised beside a game's name. */
function outcomeLabel(status: string): string {
  return status === 'won' ? 'Won' : status === 'lost' ? 'Lost' : status;
}

function excerpt(body: string, n = 120): string {
  const clean = body.replace(/\s+/g, ' ').trim();
  return clean.length > n ? `${clean.slice(0, n).trimEnd()}…` : clean;
}

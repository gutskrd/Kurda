import type pg from 'pg';
import { EngagementService, type EngagementKind } from './engagement-service.js';

/**
 * What a profile shows besides the person themselves: what they have posted and
 * how their recent games went.
 *
 * Every source already exists — library posts, image posts, and the per-game
 * tables — so this reads them rather than recording anything new. A profile is
 * a view over what someone has done, not a second copy of it.
 */

/** The sections a profile can show, in the order they appear. */
/*
 * What a profile shows, in the order it shows it.
 *
 * 'posts' is everything they wrote or pictured — stories, poems, gotin, wêne,
 * mîm — for the same reason the community wall stopped being three pages: they
 * were one thing split three ways. 'saved' is what the app calls it everywhere
 * else, so the profile calls it that too.
 */
export const PROFILE_SECTIONS = ['posts', 'games', 'likes', 'saved'] as const;
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

/**
 * An entry whose picture is still a media key.
 *
 * The service does not know how media is served, so it hands the key up and the
 * route turns it into a URL. Optional because most sources have no picture.
 */
export type ActivityEntryWithMedia = ActivityEntry & { mediaId?: string | null };

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
  private readonly engagement: EngagementService;

  constructor(private readonly pool: pg.Pool) {
    this.engagement = new EngagementService(pool);
  }

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

  /**
   * Everything this person posted, newest first, whatever kind it is.
   *
   * The profile used to split writing into Stories and Poems and keep pictures
   * in a third tab, which is the same three-pages-for-one-thing the community
   * wall stopped doing. One UNION rather than three requests the client would
   * have to interleave — and paging works, which merging three lists client-side
   * could never do honestly.
   */
  async allPosts(
    userId: string,
    limit: number,
    offset: number,
  ): Promise<Array<ActivityEntry & { mediaId: string | null }>> {
    const rows = await this.pool.query<{
      id: string;
      source: 'library' | 'image';
      type: string;
      title: string | null;
      body: string | null;
      media_id: string | null;
      created_at: Date;
    }>(
      `SELECT id, 'library' AS source, type, title, body, NULL AS media_id,
              COALESCE(published_at, created_at) AS created_at
         FROM library_posts
        WHERE author_id = $1 AND status = 'published'
        UNION ALL
       SELECT id, 'image', category, caption, NULL, image_media_id, created_at
         FROM image_posts
        WHERE author_id = $1 AND status = 'published'
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3`,
      [userId, limit, offset],
    );

    return rows.rows.map((r) => ({
      id: r.id,
      kind: 'posts' as const,
      // a gotin and a picture both go without a title; falling back to the body
      // beats a column of "Untitled"
      title: r.title?.trim() || excerpt(r.body ?? '') || 'Untitled',
      detail: r.title?.trim() ? excerpt(r.body ?? '') : null,
      href: r.source === 'image' ? `/app/dimen/${r.id}` : `/app/library/${r.id}`,
      imageUrl: null,
      mediaId: r.media_id,
      at: r.created_at,
    }));
  }


  /**
   * What this person has liked or saved, newest first.
   *
   * Engagement is stored as pointers — (type, id) — so this fetches the posts
   * they point at and puts them back in the order they were liked. Two queries
   * for a mixed page rather than one per entry, and posts that have since been
   * removed simply drop out instead of leaving holes.
   */
  async engaged(userId: string, kind: EngagementKind, limit: number, offset: number): Promise<ActivityEntryWithMedia[]> {
    const refs = await this.engagement.listFor(userId, kind, limit, offset);
    if (refs.length === 0) return [];

    const [posts, images] = await Promise.all([
      this.libraryByIds(refs.filter((r) => r.targetType === 'library').map((r) => r.targetId)),
      this.imagesByIds(refs.filter((r) => r.targetType === 'image').map((r) => r.targetId)),
    ]);

    const out: ActivityEntryWithMedia[] = [];
    for (const ref of refs) {
      const found = ref.targetType === 'library' ? posts.get(ref.targetId) : images.get(ref.targetId);
      // the entry keeps its own kind — a liked picture is still a picture, and
      // the tab needs that to render it as one rather than as a line of text.
      // Which section this is was in the request.
      if (found) out.push({ ...found, at: ref.at });
    }
    return out;
  }

  /** Published stories and poems by id, keyed for the caller to order. */
  private async libraryByIds(ids: string[]): Promise<Map<string, ActivityEntryWithMedia>> {
    const map = new Map<string, ActivityEntryWithMedia>();
    if (ids.length === 0) return map;
    const rows = await this.pool.query<{ id: string; type: string; title: string | null; body: string }>(
      `SELECT id, type, title, body FROM library_posts WHERE id = ANY($1) AND status = 'published'`,
      [ids],
    );
    for (const r of rows.rows) {
      map.set(r.id, {
        id: r.id,
        // inside likes/saved these are all just posts you engaged with
        kind: 'posts',
        // a gotin has no title, so the words stand in for one
        title: r.title?.trim() || excerpt(r.body) || 'Untitled',
        detail: r.title?.trim() ? excerpt(r.body) : null,
        href: `/app/library/${r.id}`,
        imageUrl: null,
        at: new Date(),
      });
    }
    return map;
  }

  /** Published pictures by id. The caller resolves the media key to a URL. */
  private async imagesByIds(ids: string[]): Promise<Map<string, ActivityEntryWithMedia>> {
    const map = new Map<string, ActivityEntryWithMedia>();
    if (ids.length === 0) return map;
    const rows = await this.pool.query<{ id: string; caption: string | null; image_media_id: string | null }>(
      `SELECT id, caption, image_media_id FROM image_posts WHERE id = ANY($1) AND status = 'published'`,
      [ids],
    );
    for (const r of rows.rows) {
      map.set(r.id, {
        id: r.id,
        kind: 'posts',
        title: r.caption?.trim() || 'Untitled',
        detail: null,
        href: `/app/dimen/${r.id}`,
        imageUrl: null,
        mediaId: r.image_media_id,
        at: new Date(),
      });
    }
    return map;
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

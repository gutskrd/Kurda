/**
 * The Stories' proverbs, for learners (routes.ts): a variety's published
 * proverbs, of a theme when one is asked for, the proverb of the day, and one
 * proverb's page. Reading is open to everyone and pays nothing.
 *
 * Only published, approved rows are read, each checked again as it is read
 * (a row a rule now refuses is left out), and a proverb that is not one is
 * 404, the same as one that never existed. Each is sent with every language
 * it has been translated into, whatever that language's review says
 * (content-translations.ts), and without the notes left for its reviewers.
 * The round on the proverbs reads them from here too (proverb-round.ts).
 */
import type pg from 'pg';
import {
  PROVERB_THEMES,
  checkGameContent,
  dailyLorePick,
  isAppLocale,
  loreTranslationSchema,
  type AppLocale,
  type GameDialect,
  type ProverbContent,
  type ProverbList,
  type ProverbTheme,
  type ProverbTranslation,
  type ProverbView,
} from '@kurda/shared';
import { AppError } from '../plugins/errors.js';
import { localDate, safeTimeZone } from '../streaks/streak-logic.js';

/** A published proverb, read and checked, with its translations. */
export interface Proverb {
  id: string;
  dialect: GameDialect;
  level: number;
  payload: ProverbContent;
  translations: Partial<Record<AppLocale, ProverbTranslation>>;
}

const LIVE = `kind = 'proverb' AND status = 'published' AND review_status = 'approved'`;

export function proverbView(p: Proverb): ProverbView {
  const { slug, text, themes, tradition, region, variants, exampleKu, sources } = p.payload;
  return { slug, dialect: p.dialect, text, themes, tradition, region: region ?? null, variants, exampleKu, translations: p.translations, sources };
}

/** Published proverbs of a variety, or the one with a slug, in slug order. */
export async function publishedProverbs(db: Pick<pg.Pool, 'query'>, where: { dialect: GameDialect } | { slug: string }): Promise<Proverb[]> {
  const res = await db.query<{ id: string; dialect: GameDialect; level: number; payload: unknown }>(
    'dialect' in where
      ? `SELECT id, dialect, level, payload FROM game_content WHERE ${LIVE} AND dialect = $1`
      : `SELECT id, dialect, level, payload FROM game_content WHERE ${LIVE} AND payload->>'slug' = $1`,
    ['dialect' in where ? where.dialect : where.slug],
  );
  const rows = res.rows.flatMap((row) => {
    const checked = checkGameContent('proverb', row.dialect, row.payload);
    return checked.ok ? [{ id: row.id, dialect: row.dialect, level: row.level, payload: checked.payload, translations: {} } as Proverb] : [];
  });
  if (rows.length === 0) return rows;
  const t = await db.query<{ content_id: string; locale: string; payload: unknown }>(
    `SELECT content_id, locale, payload FROM game_content_translations WHERE content_id = ANY($1::uuid[])`,
    [rows.map((r) => r.id)],
  );
  const byId = new Map(rows.map((r) => [r.id, r]));
  const schema = loreTranslationSchema('proverb');
  for (const tr of t.rows) {
    const r = byId.get(tr.content_id);
    const parsed = schema.safeParse(tr.payload);
    if (r && isAppLocale(tr.locale) && parsed.success) r.translations[tr.locale] = JSON.parse(JSON.stringify(parsed.data)) as ProverbTranslation;
  }
  return rows.sort((a, b) => (a.payload.slug < b.payload.slug ? -1 : a.payload.slug > b.payload.slug ? 1 : 0));
}

export class ProverbService {
  constructor(private readonly pool: pg.Pool) {}

  private async today(userId: string | null, now: Date): Promise<string> {
    if (!userId) return localDate(now, 'UTC');
    const res = await this.pool.query<{ timezone: string | null }>(`SELECT timezone FROM users WHERE id = $1`, [userId]);
    return localDate(now, safeTimeZone(res.rows[0]?.timezone));
  }

  /**
   * A variety's proverbs, of one theme when it is given; the themes its
   * proverbs cover, in the list's order, for the filter; and the proverb the
   * day puts forward, among all of them whatever the filter.
   */
  async list(dialect: GameDialect, theme: ProverbTheme | undefined, userId: string | null, now = new Date()): Promise<ProverbList> {
    const [all, day] = await Promise.all([publishedProverbs(this.pool, { dialect }), this.today(userId, now)]);
    const covered = new Set(all.flatMap((p) => p.payload.themes));
    return {
      proverbs: all.filter((p) => !theme || p.payload.themes.includes(theme)).map(proverbView),
      themes: PROVERB_THEMES.filter((t) => covered.has(t)),
      today: dailyLorePick(all.map((p) => p.payload.slug), day),
    };
  }

  async detail(slug: string): Promise<{ proverb: ProverbView }> {
    const [p] = await publishedProverbs(this.pool, { slug });
    if (!p) throw new AppError('NOT_FOUND', 404, 'no such proverb');
    return { proverb: proverbView(p) };
  }
}

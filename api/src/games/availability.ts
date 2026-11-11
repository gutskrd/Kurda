/**
 * Which learning games can be played, per variety and level: the approved
 * content each one has, against its minimum (GET /games/availability, and the
 * admin's readiness view).
 *
 * Counted only from what a game may show — the trusted readers and published
 * `game_content` rows — so a game is never offered on drafts. A game whose
 * content has no levels (recordings, the dictionary) counts the same pool at
 * every level. Cached per variety for a couple of minutes: the games page asks
 * on every visit, and the answer changes only when something is published.
 */
import type pg from 'pg';
import {
  GAME_CONTENT_KINDS,
  GAME_LEVELS,
  LEARN_GAMES,
  WHO_AM_I_MIN_TEMPLATES,
  availableDifficulties,
  courseSpelling,
  type GameAvailability,
  type GameContentKind,
  type GameDialect,
  type GameDifficulty,
  type GameLevel,
  type GamesAvailability,
  type LearnGameId,
} from '@kurda/shared';
import type { Cache } from '../cache/cache.js';
import type { BuildSentenceGame } from './build-sentence.js';
import type { TrustedSources } from './sources.js';

const CACHE_DOMAIN = 'games-availability';
export const AVAILABILITY_TTL_SECONDS = 120;

type Levels = Record<GameLevel, number>;

const zero = (): Levels => ({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });
const flat = (n: number): Levels => ({ 1: n, 2: n, 3: n, 4: n, 5: n });

/** The kind of row whose count is a game's count, for the games made of their own rows. */
const MAIN_KIND: Partial<Record<LearnGameId, GameContentKind>> = {
  'memory-thief': 'passage',
  'what-would-you-say': 'scenario',
  detective: 'case_file',
  impostor: 'word_card',
  'who-am-i': 'identity',
};

/** Content without levels: these count one pool at every level. */
const UNLEVELLED: ReadonlySet<LearnGameId> = new Set(['hear-it', 'last-letter']);

/** Question templates Who Am I? needs before an identity is any use. */
const WHO_AM_I_TEMPLATES = WHO_AM_I_MIN_TEMPLATES;

/**
 * A game's own count, when what it can be played with is more than rows or
 * readers counted as they are: The Memory Thief counts the passages that hold
 * enough words to take, Hear It, Find It the recordings each rung can ask
 * about. `difficulties`, when given, are the game's own word on which
 * difficulties a round can be made at; otherwise they follow from the levels.
 */
export interface GameCounter {
  count(dialect: GameDialect): Promise<{ levels: Levels; difficulties?: GameDifficulty[] }>;
}

export class GameAvailabilityService {
  constructor(
    private readonly db: Pick<pg.Pool, 'query'>,
    private readonly sources: TrustedSources,
    private readonly sentences: BuildSentenceGame,
    private readonly cache: Cache | null = null,
    private readonly counters: Partial<Record<LearnGameId, GameCounter>> = {},
  ) {}

  async forDialect(dialect: GameDialect): Promise<GamesAvailability> {
    const load = () => this.count(dialect);
    return this.cache ? this.cache.withCache(CACHE_DOMAIN, dialect, AVAILABILITY_TTL_SECONDS, load) : load();
  }

  private async count(dialect: GameDialect): Promise<GamesAvailability> {
    const [rows, sentences, passages, recordings, dictionary] = await Promise.all([
      this.db.query<{ kind: string; level: number; n: number }>(
        // only the kinds a game is made of today: rows written for a game that is gone are not counted for anything
        `SELECT kind, level, count(*)::int AS n FROM game_content
          WHERE dialect = $1 AND status = 'published' AND review_status = 'approved' AND kind = ANY($2)
          GROUP BY kind, level`,
        [dialect, [...GAME_CONTENT_KINDS]],
      ),
      this.sentences.levels(dialect),
      this.sources.storyPassages(dialect),
      this.sources.recordings(dialect),
      this.db.query<{ n: number }>(`SELECT count(*)::int AS n FROM dict_entries WHERE in_games AND dialect = $1`, [courseSpelling(dialect)]),
    ]);
    const own = new Map(
      await Promise.all(Object.entries(this.counters).map(async ([id, counter]) => [id, await counter!.count(dialect)] as const)),
    );
    const byKind = new Map<string, Levels>();
    for (const r of rows.rows) {
      const levels = byKind.get(r.kind) ?? zero();
      if ((GAME_LEVELS as readonly number[]).includes(r.level)) levels[r.level as GameLevel] += r.n;
      byKind.set(r.kind, levels);
    }
    const total = (kind: GameContentKind) => GAME_LEVELS.reduce((sum, l) => sum + (byKind.get(kind)?.[l] ?? 0), 0);

    const levelsOf = (id: LearnGameId): Levels => {
      switch (id) {
        case 'build-sentence':
          return sentences;
        case 'memory-thief': {
          // a story paragraph with at least two glossary terms to take away is a passage too
          const out = { ...(byKind.get('passage') ?? zero()) };
          for (const p of passages) if (p.glossary.length >= 2 && (GAME_LEVELS as readonly number[]).includes(p.level)) out[p.level as GameLevel]++;
          return out;
        }
        case 'hear-it':
          return flat(recordings.length);
        case 'last-letter':
          return flat(dictionary.rows[0]?.n ?? 0);
        case 'who-am-i':
          return total('question_template') >= WHO_AM_I_TEMPLATES ? (byKind.get('identity') ?? zero()) : zero();
        default: {
          const kind = MAIN_KIND[id];
          return kind ? (byKind.get(kind) ?? zero()) : zero();
        }
      }
    };

    const games: GameAvailability[] = LEARN_GAMES.filter((g) => g.dialects.includes(dialect)).map((g) => {
      const counted = own.get(g.id);
      const levels = counted?.levels ?? levelsOf(g.id);
      const levelled = !UNLEVELLED.has(g.id);
      const difficulties = counted?.difficulties ?? availableDifficulties(levels, g.minimum, levelled);
      return { id: g.id, levels, levelled, minimum: g.minimum, difficulties, available: difficulties.length > 0 };
    });
    return { dialect, games };
  }
}

/** Count again on the next ask: something was published or taken down. */
export async function bustAvailability(cache: Cache | null | undefined): Promise<void> {
  if (!cache) return;
  await Promise.all([cache.del(CACHE_DOMAIN, 'kmr'), cache.del(CACHE_DOMAIN, 'ckb')]);
}

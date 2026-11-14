/**
 * Where the riddles and the proverbs live, what they ask the API, and what a
 * visitor's tab remembers of the riddles they played.
 *
 * They are the Stories section's two companion shelves (Learn → Stories), so
 * their addresses sit beside the library's. The shapes are @kurda/shared's
 * (`RiddleCard`, `RiddleAnswer`, `ProverbView` …): the API sends them and the
 * phone reads the same, so nothing here redefines one.
 *
 * A riddle never spoils itself. Its list and its page carry the question and
 * how many hints it has; a hint is one request when it is asked for, and the
 * answer comes with a right guess or a reveal the learner confirmed. Nothing
 * here asks for any of those ahead of time.
 */
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { isGameDialect, originalLocale, storySpelling, type AppLocale, type GameDialect, type RiddleState } from '@kurda/shared';
import { useGameDialect } from '../games/soloRounds';
import { rememberVariety } from '../stories/prefs';

export const RIDDLES = '/app/learn/riddles';
export const riddlePath = (slug: string): string => `${RIDDLES}/${encodeURIComponent(slug)}`;
/** A riddle's answer has an address of its own, so seeing it is always a step somebody took. */
export const answerPath = (slug: string): string => `${riddlePath(slug)}/answer`;

export const PROVERBS = '/app/learn/proverbs';
export const proverbPath = (slug: string): string => `${PROVERBS}/${encodeURIComponent(slug)}`;
/** The round on the proverbs; no proverb's slug can be this, since every slug starts with its variety. */
export const PROVERB_ROUND = `${PROVERBS}/play`;

/** A list's address in one variety. */
export const inVariety = (path: string, dialect: GameDialect): string => `${path}?dialect=${dialect}`;

/**
 * The variety a list is showing: the address's, when it names one (a link
 * somebody shared), else the learner's own. Choosing the other one writes it
 * into the address, and the stories remember it too, so the library and its
 * two companions open on the same Kurdish.
 */
export function useLoreDialect(): [GameDialect, (next: GameDialect) => void] {
  const fallback = useGameDialect();
  const [params, setParams] = useSearchParams();
  const asked = params.get('dialect');
  const dialect = isGameDialect(asked) ? asked : fallback;
  const choose = useCallback(
    (next: GameDialect) => {
      rememberVariety(storySpelling(next));
      setParams(
        (p) => {
          const out = new URLSearchParams(p);
          out.set('dialect', next);
          return out;
        },
        { replace: true },
      );
    },
    [setParams],
  );
  return [dialect, choose];
}

/**
 * Something in the reader's own language, from a row's translations: theirs,
 * else English. Nothing when the reader's language is the row's own (a
 * Kurmancî reader on a Kurmancî riddle reads the original), nor when neither
 * is there.
 */
export function inReaderLanguage<T>(
  translations: Partial<Record<AppLocale, T>> | undefined,
  locale: AppLocale,
  dialect: GameDialect,
): { locale: AppLocale; value: T } | null {
  if (locale === originalLocale(dialect)) return null;
  const own = translations?.[locale];
  if (own) return { locale, value: own };
  const en = translations?.en;
  return en ? { locale: 'en', value: en } : null;
}

/** The same, as a hook: memoised on what it reads. */
export function useReaderLanguage<T>(
  translations: Partial<Record<AppLocale, T>> | undefined,
  locale: AppLocale,
  dialect: GameDialect,
): { locale: AppLocale; value: T } | null {
  return useMemo(() => inReaderLanguage(translations, locale, dialect), [translations, locale, dialect]);
}

// ---------------------------------------------------------------------------
// what a visitor's tab keeps

/**
 * A visitor's riddles, for as long as the tab is open: the hints taken and
 * whether each was solved or its answer shown. The server keeps nothing for
 * somebody signed out, and progress is what an account is for, so this is
 * kept in the tab only — enough that a riddle's page, its answer and the
 * list agree with each other while somebody plays.
 */
export interface VisitorRiddle {
  hints: number;
  state: RiddleState;
}

const VISITOR_KEY = 'hevalo.riddles.visitor';

function readVisitor(): Record<string, VisitorRiddle> {
  try {
    const raw = JSON.parse(sessionStorage.getItem(VISITOR_KEY) ?? 'null') as unknown;
    return raw && typeof raw === 'object' ? (raw as Record<string, VisitorRiddle>) : {};
  } catch {
    return {};
  }
}

export function visitorRiddle(slug: string): VisitorRiddle | null {
  const v = readVisitor()[slug];
  return v && typeof v.hints === 'number' && typeof v.state === 'string' ? v : null;
}

/** A visitor's riddle moved on: a hint taken, solved, or its answer shown. A solved riddle stays solved. */
export function rememberVisitorRiddle(slug: string, next: Partial<VisitorRiddle>): void {
  const all = readVisitor();
  const was = all[slug] ?? { hints: 0, state: 'new' as RiddleState };
  const state = was.state === 'solved' || (was.state === 'revealed' && next.state !== 'solved') ? was.state : (next.state ?? was.state);
  all[slug] = { hints: Math.max(was.hints, next.hints ?? 0), state };
  try {
    sessionStorage.setItem(VISITOR_KEY, JSON.stringify(all));
  } catch {
    // a tab that will not remember still plays: the page holds what it needs
  }
}

/** For tests: forget the visitor's riddles. */
export function forgetVisitorRiddles(): void {
  try {
    sessionStorage.removeItem(VISITOR_KEY);
  } catch {
    // nothing kept, nothing to forget
  }
}

// ---------------------------------------------------------------------------
// translations on or off

const TRANSLATIONS_KEY = 'hevalo.lore.translations';

/** Whether the riddles' list shows each question's translation: off until the reader asks, then as they left it. */
export function rememberedTranslations(): boolean {
  try {
    return localStorage.getItem(TRANSLATIONS_KEY) === 'on';
  } catch {
    return false;
  }
}

export function rememberTranslations(on: boolean): void {
  try {
    localStorage.setItem(TRANSLATIONS_KEY, on ? 'on' : 'off');
  } catch {
    // the choice holds for this visit
  }
}

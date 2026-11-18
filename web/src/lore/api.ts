/**
 * Riddle and proverb paths, API helpers and a visitor's per-tab riddle progress. The shapes are @kurda/shared's. A
 * riddle never spoils itself: hints are fetched one at a time on request, and the answer only comes with a right guess
 * or a confirmed reveal.
 */
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { isGameDialect, originalLocale, storySpelling, type AppLocale, type GameDialect, type RiddleState } from '@kurda/shared';
import { useGameDialect } from '../games/soloRounds';
import { rememberVariety } from '../stories/prefs';

export const RIDDLES = '/app/learn/riddles';
export const riddlePath = (slug: string): string => `${RIDDLES}/${encodeURIComponent(slug)}`;
/** A riddle's answer has its own address, so seeing it is always a deliberate step. */
export const answerPath = (slug: string): string => `${riddlePath(slug)}/answer`;

export const PROVERBS = '/app/learn/proverbs';
export const proverbPath = (slug: string): string => `${PROVERBS}/${encodeURIComponent(slug)}`;
/** The proverb round; no proverb slug can collide, since every slug starts with its variety. */
export const PROVERB_ROUND = `${PROVERBS}/play`;

/** A list's address in one variety. */
export const inVariety = (path: string, dialect: GameDialect): string => `${path}?dialect=${dialect}`;

/**
 * The variety a list shows: the address's when it names one, else the learner's own. Choosing another writes it into
 * the address and the stories remember it too, so the library and its companions match.
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
 * A row's translation in the reader's language, else English; null when the reader's language is the row's own or
 * neither exists.
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

/** The same, as a memoised hook. */
export function useReaderLanguage<T>(
  translations: Partial<Record<AppLocale, T>> | undefined,
  locale: AppLocale,
  dialect: GameDialect,
): { locale: AppLocale; value: T } | null {
  return useMemo(() => inReaderLanguage(translations, locale, dialect), [translations, locale, dialect]);
}

// ---- What a visitor's tab keeps ----

/**
 * A visitor's riddle progress for the tab's lifetime: hints taken, and whether solved or revealed. The server keeps
 * nothing for visitors; this keeps the riddle, answer and list pages consistent.
 */
interface VisitorRiddle {
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

/** Records a visitor's progress on a riddle; a solved riddle stays solved. */
export function rememberVisitorRiddle(slug: string, next: Partial<VisitorRiddle>): void {
  const all = readVisitor();
  const was = all[slug] ?? { hints: 0, state: 'new' as RiddleState };
  const state = was.state === 'solved' || (was.state === 'revealed' && next.state !== 'solved') ? was.state : (next.state ?? was.state);
  all[slug] = { hints: Math.max(was.hints, next.hints ?? 0), state };
  try {
    sessionStorage.setItem(VISITOR_KEY, JSON.stringify(all));
  } catch {
    // Without storage the page still holds what it needs.
  }
}

/** For tests: forgets the visitor's riddles. */
export function forgetVisitorRiddles(): void {
  try {
    sessionStorage.removeItem(VISITOR_KEY);
  } catch {
    // Nothing kept, nothing to forget.
  }
}

// ---- Translations on or off ----

const TRANSLATIONS_KEY = 'hevalo.lore.translations';

/** Whether the riddle list shows translations: off until turned on, then as last left. */
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
    // The choice holds for this visit.
  }
}

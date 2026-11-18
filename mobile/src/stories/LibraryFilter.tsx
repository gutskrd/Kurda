import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { Pressable } from '../theme/Pressable';
import {
  DEFAULT_STORY_SORT,
  STORY_LENGTHS,
  STORY_LEVELS,
  lengthMinutes,
  storyQueryString,
  type StoryDialect,
  type StoryLength,
  type StoryLevel,
  type StoryLibrary,
  type StoryListItem,
  type StoryQuery,
  type StorySort,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { formatNumber } from '../i18n/format';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { FilterChip, FilterChips, FilterHeading, FilterOption, FilterOptions, FilterPill, FilterPills, FilterSheet, FilterToggle } from '../theme/FilterSheet';
import type { IconName } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { spacing, typography } from '../theme/tokens';
import { LENGTH_KEY, categoryLabel, categoryTitle, levelHint, levelName } from './labels';
import { heldDim } from '../theme/MotionParts';

/**
 * The stories library's sort and filter (Learn → Stories), built on the wall's sheet (theme/FilterSheet.tsx). The
 * search stays in view and searches as you type; a funnel opens one sheet with order, level, length, narration and
 * category. Sheet choices are a draft until "Show N stories", whose count is fetched as they change. While anything
 * is on, the funnel is filled and named, and a removable chip per part sits under the search, with "Clear all"
 * from two. The variety is not in the sheet: the library shows one at a time via its switch (StoriesView).
 */

/** What narrows or orders the library, apart from the words typed in the search. */
export interface LibraryFilter {
  level: StoryLevel | null;
  length: StoryLength | null;
  narrated: boolean;
  category: string | null;
  sort: StorySort;
  /** "All stories" from the Categories shelf: the paged list with nothing narrowing it. */
  all: boolean;
}

export const NO_FILTER: LibraryFilter = { level: null, length: null, narrated: false, category: null, sort: DEFAULT_STORY_SORT, all: false };

/** A page of 24, the server's default: eight or more rows at two or three to a row. */
const PAGE = 24;

/** Whether nothing in the sheet differs from the library's opening state. */
export function isPlainFilter(f: LibraryFilter): boolean {
  return f.level === null && f.length === null && !f.narrated && f.category === null && f.sort === DEFAULT_STORY_SORT;
}

/** Whether anything typed or chosen turns the shelves into one paged list. */
export function isFiltering(q: string, filter: LibraryFilter): boolean {
  return q.trim() !== '' || !isPlainFilter(filter) || filter.all;
}

/** The GET /stories query for the search and choices in the shown variety, from `offset`; the default order is omitted. */
export function libraryQuery(q: string, filter: LibraryFilter, dialect: StoryDialect, offset = 0): StoryQuery {
  return {
    q: q.trim() || undefined,
    category: filter.category ?? undefined,
    level: filter.level ?? undefined,
    dialect,
    length: filter.length ?? undefined,
    audio: filter.narrated || undefined,
    sort: filter.sort === DEFAULT_STORY_SORT ? undefined : filter.sort,
    limit: PAGE,
    offset: offset || undefined,
  };
}

const SORT_KEY: Record<StorySort, TranslationKey> = {
  level: 'stories.sort.easiest',
  newest: 'feed.sort.newest',
  title: 'stories.sort.title',
};

const SORT_ICON: Record<StorySort, IconName> = { level: 'sort', newest: 'clock', title: 'text' };

/** The count request's key: order does not change a count, and one story is enough back. */
function countKey(q: string, f: LibraryFilter, dialect: StoryDialect): string {
  return storyQueryString({ ...libraryQuery(q, f, dialect), sort: undefined, limit: 1, offset: undefined });
}

/** One active part, as its chip and the funnel's name show it. */
interface Part {
  key: string;
  label: string;
  icon?: IconName;
  clear: string;
  undo: Partial<LibraryFilter>;
}

/** Every active part, in the sheet's order. */
export function activeParts(f: LibraryFilter, t: (key: TranslationKey, vars?: Record<string, string | number>) => string, library: StoryLibrary | null, locale: string): Part[] {
  const parts: Part[] = [];
  const add = (key: string, label: string, undo: Partial<LibraryFilter>, icon?: IconName): void => {
    parts.push({ key, label, icon, clear: t('stories.filter.remove', { what: label }), undo });
  };
  if (f.sort !== DEFAULT_STORY_SORT) parts.push({ key: 'sort', label: t(SORT_KEY[f.sort]), icon: 'sort', clear: t('stories.sort.clear'), undo: { sort: DEFAULT_STORY_SORT } });
  if (f.level) add('level', levelName(f.level, t), { level: null });
  if (f.length) add('length', t(LENGTH_KEY[f.length]), { length: null });
  if (f.narrated) add('narrated', t('stories.filter.readAloud'), { narrated: false }, 'headphones');
  if (f.category) add('category', categoryLabel(f.category, library?.categories, locale, t) ?? f.category, { category: null }, 'tag');
  return parts;
}

/** The funnel's name: "Sort and filter", or "Sort and filter — Beginner, Long" while anything is on. */
export function filterButtonLabel(parts: readonly Part[], t: (key: TranslationKey, vars?: Record<string, string | number>) => string): string {
  return parts.length ? t('feed.sortFilter.buttonOn', { what: parts.map((p) => p.label).join(', ') }) : t('feed.sortFilter.button');
}

/** The chips under the search while anything is on: each opens the sheet, its ✕ removes that part; "Clear all" from two. */
export function LibraryFilterChips({
  parts,
  onOpen,
  onUndo,
  onClearAll,
}: {
  parts: readonly Part[];
  onOpen: () => void;
  onUndo: (undo: Partial<LibraryFilter>) => void;
  onClearAll: () => void;
}): React.JSX.Element | null {
  const { colors } = useTheme();
  const { t } = useI18n();
  if (parts.length === 0) return null;
  return (
    <FilterChips style={styles.chips}>
      {parts.map((p) => (
        <FilterChip key={p.key} icon={p.icon} label={p.label} clearLabel={p.clear} onOpen={onOpen} onClear={() => onUndo(p.undo)} />
      ))}
      {parts.length >= 2 ? (
        <Pressable onPress={onClearAll} accessibilityRole="button" hitSlop={8} style={({ pressed }) => [styles.clearAll, pressed && heldDim]}>
          <Text style={[styles.clearAllText, { color: colors.primary }]}>{t('stories.filter.clearAll')}</Text>
        </Pressable>
      ) : null}
    </FilterChips>
  );
}

/** How long a draft waits for the next choice before its count is fetched. */
const COUNT_DEBOUNCE_MS = 250;

/**
 * The sheet. It starts from the library's current state on each open and applies the draft only on "Show N
 * stories". The count comes from what is already known where possible (the variety's total, the shown list), else
 * `GET /stories?…&limit=1` shortly after the choices settle; the last number stays up meanwhile.
 */
export function LibraryFilterSheet({
  visible,
  value,
  q,
  dialect,
  library,
  shownTotal,
  onApply,
  onClose,
}: {
  visible: boolean;
  value: LibraryFilter;
  q: string;
  /** The variety on show; every count here is of its stories. */
  dialect: StoryDialect;
  /** That variety's front page, for its total and the levels and categories that hold something. */
  library: StoryLibrary | null;
  /** How many stories the shown list has in all, once known. */
  shownTotal: number | null;
  onApply: (next: LibraryFilter) => void;
  onClose: () => void;
}): React.JSX.Element {
  const { t, locale } = useI18n();
  const { client } = useAuth();
  const [draft, setDraft] = useState<LibraryFilter>(value);
  useEffect(() => {
    if (visible) setDraft(value);
  }, [visible, value]);
  const set = (next: Partial<LibraryFilter>) => setDraft((d) => ({ ...d, ...next, all: false }));

  // How many the draft would show, with counts already fetched kept by request key.
  const seen = useRef(new Map<string, number>());
  const [count, setCount] = useState<number | null>(null);
  const key = countKey(q, draft, dialect);
  const known = useMemo(() => {
    const out = new Map<string, number>();
    if (library) out.set(countKey('', NO_FILTER, dialect), library.total);
    if (shownTotal !== null) out.set(countKey(q, value, dialect), shownTotal);
    return out;
  }, [library, shownTotal, q, value, dialect]);
  const ready = known.get(key) ?? seen.current.get(key);
  useEffect(() => {
    if (!visible) {
      setCount(null);
      return;
    }
    if (ready !== undefined) {
      setCount(ready);
      return;
    }
    let live = true;
    const timer = setTimeout(() => {
      void client.get<{ stories: StoryListItem[]; total: number }>(`/stories${key}`).then((res) => {
        if (!live || !res.ok) return;
        seen.current.set(key, res.data.total);
        setCount(res.data.total);
      });
    }, COUNT_DEBOUNCE_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [visible, key, ready, client]); // The draft is read through its key, which names the count request.

  const applyLabel =
    count === null
      ? t('stories.filter.applyAll')
      : count === 0
        ? t('stories.filter.applyNone')
        : t(count === 1 ? 'stories.filter.applyOne' : 'stories.filter.apply', { count: formatNumber(count, locale) });

  // Only levels and categories with stories, plus the chosen one whatever it holds.
  const levels = library?.levels ? STORY_LEVELS.filter((l) => l === draft.level || library.levels!.some((h) => h.level === l && h.count > 0)) : [...STORY_LEVELS];
  const categories = (library?.categories ?? []).filter((c) => c.count > 0 || c.slug === draft.category);
  const minutes = (length: StoryLength): string => {
    const { min, max } = lengthMinutes(dialect, length);
    return min === max ? t('stories.minutes', { count: min }) : t('stories.minutesRange', { min, max });
  };

  return (
    <FilterSheet
      visible={visible}
      onClose={onClose}
      title={t('feed.sortFilter.title')}
      resetLabel={t('feed.sortFilter.reset')}
      resetDisabled={isPlainFilter(draft)}
      onReset={() => setDraft(NO_FILTER)}
      applyLabel={applyLabel}
      onApply={() => onApply(draft)}
      testID="stories-filter-sheet"
    >
      <FilterHeading>{t('feed.sort.title')}</FilterHeading>
      <FilterOptions label={t('feed.sort.title')}>
        {(['level', 'newest', 'title'] as const).map((s) => (
          <FilterOption key={s} label={t(SORT_KEY[s])} icon={SORT_ICON[s]} on={draft.sort === s} onPress={() => set({ sort: s })} />
        ))}
      </FilterOptions>

      <FilterHeading>{t('stories.filter.level')}</FilterHeading>
      <FilterOptions label={t('stories.filter.level')}>
        <FilterOption label={t('stories.filter.anyLevel')} on={draft.level === null} onPress={() => set({ level: null })} />
        {levels.map((l) => (
          <FilterOption key={l} label={levelName(l, t)} hint={levelHint(l, t)} on={draft.level === l} onPress={() => set({ level: l })} />
        ))}
      </FilterOptions>

      <FilterHeading>{t('stories.filter.length')}</FilterHeading>
      <FilterOptions label={t('stories.filter.length')}>
        <FilterOption label={t('stories.filter.anyLength')} on={draft.length === null} onPress={() => set({ length: null })} />
        {STORY_LENGTHS.map((l) => (
          <FilterOption key={l} label={t(LENGTH_KEY[l])} hint={minutes(l)} on={draft.length === l} onPress={() => set({ length: l })} />
        ))}
      </FilterOptions>

      <FilterToggle label={t('stories.filter.readAloud')} hint={t('stories.filter.readAloudHint')} on={draft.narrated} onChange={(narrated) => set({ narrated })} />

      {categories.length > 0 ? (
        <>
          <FilterHeading>{t('stories.filter.category')}</FilterHeading>
          <FilterPills label={t('stories.filter.category')}>
            <FilterPill label={t('stories.filter.anyCategory')} on={draft.category === null} onPress={() => set({ category: null })} />
            {categories.map((c) => (
              <FilterPill key={c.slug} label={categoryTitle(c, locale, t)} count={c.count} on={draft.category === c.slug} onPress={() => set({ category: c.slug })} />
            ))}
          </FilterPills>
        </>
      ) : null}
    </FilterSheet>
  );
}

const styles = StyleSheet.create({
  // The chips sit a little closer to the search than the sections below do.
  chips: { marginTop: -spacing.sm, alignItems: 'center' },
  clearAll: { minHeight: MIN_TOUCH_TARGET, justifyContent: 'center', paddingHorizontal: spacing.xs },
  clearAllText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
});

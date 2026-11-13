import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import {
  DEFAULT_STORY_SORT,
  STORY_DIALECTS,
  STORY_LENGTHS,
  STORY_LEVELS,
  categoryName,
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
import { DIALECT_NAME, LENGTH_KEY, categoryLabel, levelHint, levelName } from './labels';
import { heldDim } from '../theme/MotionParts';

/**
 * The stories library's sort and filter on the phone (Learn → Stories), built
 * from the same sheet as the wall's (theme/FilterSheet.tsx).
 *
 * The search stays in view and searches as you type. Beside it a funnel opens
 * one sheet: the order (easiest first, newest, A to Z), the level by its plain
 * name with a line on what it means, which Kurdish, the length with the
 * minutes it takes, read aloud or not, and the category with how many stories
 * it holds. Choices there are a draft until "Show N stories", whose number is
 * asked of the server as they change. While anything is on, the funnel is
 * filled, its name says what, and a chip for each part under the search says
 * so too, with a ✕ that lets just that part go — and "Clear all" once there
 * are two. The screen keeps what is chosen while it is open.
 */

/** What narrows or orders the library, apart from the words typed in the search. */
export interface LibraryFilter {
  level: StoryLevel | null;
  dialect: StoryDialect | null;
  length: StoryLength | null;
  narrated: boolean;
  category: string | null;
  sort: StorySort;
  /** "All stories" from the Categories shelf: the paged list with nothing narrowing it */
  all: boolean;
}

export const NO_FILTER: LibraryFilter = { level: null, dialect: null, length: null, narrated: false, category: null, sort: DEFAULT_STORY_SORT, all: false };

/** A page of 24, as the server's default; a phone shows two or three to a row, so a page is eight rows or more. */
export const PAGE = 24;

/** Whether nothing in the sheet differs from the library as it opens. */
export function isPlainFilter(f: LibraryFilter): boolean {
  return f.level === null && f.dialect === null && f.length === null && !f.narrated && f.category === null && f.sort === DEFAULT_STORY_SORT;
}

/** Whether anything typed or chosen turns the shelves into one paged list. */
export function isFiltering(q: string, filter: LibraryFilter): boolean {
  return q.trim() !== '' || !isPlainFilter(filter) || filter.all;
}

/** The query GET /stories is asked, for what was typed and chosen, from `offset` on; the default order is left out. */
export function libraryQuery(q: string, filter: LibraryFilter, offset = 0): StoryQuery {
  return {
    q: q.trim() || undefined,
    category: filter.category ?? undefined,
    level: filter.level ?? undefined,
    dialect: filter.dialect ?? undefined,
    length: filter.length ?? undefined,
    audio: filter.narrated || undefined,
    sort: filter.sort === DEFAULT_STORY_SORT ? undefined : filter.sort,
    limit: PAGE,
    offset: offset || undefined,
  };
}

export const SORT_KEY: Record<StorySort, TranslationKey> = {
  level: 'stories.sort.easiest',
  newest: 'feed.sort.newest',
  title: 'stories.sort.title',
};

const SORT_ICON: Record<StorySort, IconName> = { level: 'sort', newest: 'clock', title: 'text' };

/** The count's own question: the order changes no count, so it is left out, and one story is all it needs back. */
function countKey(q: string, f: LibraryFilter): string {
  return storyQueryString({ ...libraryQuery(q, f), sort: undefined, limit: 1, offset: undefined });
}

/** One thing that is on, as its chip says it and as the funnel's name lists it. */
interface Part {
  key: string;
  label: string;
  icon?: IconName;
  clear: string;
  undo: Partial<LibraryFilter>;
}

/** Everything that is on, in the order the sheet has it. */
export function activeParts(f: LibraryFilter, t: (key: TranslationKey, vars?: Record<string, string | number>) => string, library: StoryLibrary | null, locale: string): Part[] {
  const parts: Part[] = [];
  const add = (key: string, label: string, undo: Partial<LibraryFilter>, icon?: IconName): void => {
    parts.push({ key, label, icon, clear: t('stories.filter.remove', { what: label }), undo });
  };
  if (f.sort !== DEFAULT_STORY_SORT) parts.push({ key: 'sort', label: t(SORT_KEY[f.sort]), icon: 'sort', clear: t('stories.sort.clear'), undo: { sort: DEFAULT_STORY_SORT } });
  if (f.level) add('level', levelName(f.level, t), { level: null });
  if (f.dialect) add('dialect', DIALECT_NAME[f.dialect], { dialect: null });
  if (f.length) add('length', t(LENGTH_KEY[f.length]), { length: null });
  if (f.narrated) add('narrated', t('stories.filter.readAloud'), { narrated: false }, 'headphones');
  if (f.category) add('category', categoryLabel(f.category, library?.categories, locale) ?? f.category, { category: null }, 'tag');
  return parts;
}

/** The funnel's name: "Sort and filter", or "Sort and filter — Beginner, Kurmancî" while anything is on. */
export function filterButtonLabel(parts: readonly Part[], t: (key: TranslationKey, vars?: Record<string, string | number>) => string): string {
  return parts.length ? t('feed.sortFilter.buttonOn', { what: parts.map((p) => p.label).join(', ') }) : t('feed.sortFilter.button');
}

/** The chips under the search while anything is on: each opens the sheet, its ✕ lets that part go; "Clear all" once there are two. */
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

/** How long a draft waits for the next choice before its count is asked for. */
const COUNT_DEBOUNCE_MS = 250;

/**
 * The sheet itself. It starts from what the library shows each time it
 * opens, and hands the draft on only from "Show N stories". The number is
 * what is known already where it can be — the whole library's count, the list
 * on show — and otherwise `GET /stories?…&limit=1`, a moment after the
 * choices stop changing; the last number stays up while the next is asked.
 */
export function LibraryFilterSheet({
  visible,
  value,
  q,
  library,
  shownTotal,
  onApply,
  onClose,
}: {
  visible: boolean;
  value: LibraryFilter;
  q: string;
  library: StoryLibrary | null;
  /** how many stories the list on show has in all, once it is known */
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

  // how many the draft would show
  const seen = useRef(new Map<string, number>());
  const [count, setCount] = useState<number | null>(null);
  const key = countKey(q, draft);
  const known = useMemo(() => {
    const out = new Map<string, number>();
    if (library) out.set(countKey('', NO_FILTER), library.total);
    if (shownTotal !== null) out.set(countKey(q, value), shownTotal);
    return out;
  }, [library, shownTotal, q, value]);
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
  }, [visible, key, ready, client]); // the draft is read through its key, the question that names a count

  const applyLabel =
    count === null
      ? t('stories.filter.applyAll')
      : count === 0
        ? t('stories.filter.applyNone')
        : t(count === 1 ? 'stories.filter.applyOne' : 'stories.filter.apply', { count: formatNumber(count, locale) });

  // only levels and categories a reader would find something in, and the one chosen whatever it holds
  const levels = library?.levels ? STORY_LEVELS.filter((l) => l === draft.level || library.levels!.some((h) => h.level === l && h.count > 0)) : [...STORY_LEVELS];
  const categories = (library?.categories ?? []).filter((c) => c.count > 0 || c.slug === draft.category);
  const minutes = (length: StoryLength): string => {
    const { min, max } = lengthMinutes(draft.dialect ?? 'kurmanci', length);
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

      <FilterHeading>{t('stories.filter.kurdish')}</FilterHeading>
      <FilterOptions label={t('stories.filter.kurdish')}>
        <FilterOption label={t('stories.filter.eitherKurdish')} on={draft.dialect === null} onPress={() => set({ dialect: null })} />
        {STORY_DIALECTS.map((d) => (
          <FilterOption
            key={d}
            label={DIALECT_NAME[d]}
            hint={t(d === 'sorani' ? 'stories.filter.soraniHint' : 'stories.filter.kurmanciHint')}
            on={draft.dialect === d}
            onPress={() => set({ dialect: d })}
          />
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
              <FilterPill key={c.slug} label={categoryName(c, locale)} count={c.count} on={draft.category === c.slug} onPress={() => set({ category: c.slug })} />
            ))}
          </FilterPills>
        </>
      ) : null}
    </FilterSheet>
  );
}

const styles = StyleSheet.create({
  // the chips sit a little closer to the search than the sections below do
  chips: { marginTop: -spacing.sm, alignItems: 'center' },
  clearAll: { minHeight: MIN_TOUCH_TARGET, justifyContent: 'center', paddingHorizontal: spacing.xs },
  clearAllText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
});

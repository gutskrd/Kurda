/**
 * The library's search, sort and filter, built on the community wall's panel (components/FilterSheet.tsx). The search
 * field searches as you type; order, level, length, narration and category sit behind the funnel as a draft until
 * "Show N stories", whose count the server answers as choices change. Active parts show as chips. The variety is not a
 * filter: the library's switch chooses it. Everything lives in the address, so a filtered shelf can be linked to.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_STORY_SORT,
  STORY_LENGTHS,
  STORY_LEVELS,
  cefrOf,
  isStoryLength,
  isStoryLevel,
  isStorySort,
  levelOfCefr,
  storyQueryString,
  type StoryDialect,
  type StoryLength,
  type StoryLevel,
  type StoryLibrary,
  type StoryListItem,
  type StoryQuery,
  type StorySort,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { FilterChip, FilterOption, FilterPill, FilterRadios, FilterSection, FilterSheet, FilterToggle, useFilterSheet } from '../components/FilterSheet';
import { HeadphonesIcon, SortIcon, TagIcon } from '../components/icons';
import { SearchField } from '../components/SearchField';
import { useLocale, useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { categoryLabel, categoryTitle, levelHint, levelName } from './labels';
import { LENGTH_KEY, minutesLabel } from './SetupSheet';

/** What narrows or orders the library, apart from the search words. */
export interface LibraryFilters {
  level: StoryLevel | null;
  length: StoryLength | null;
  narrated: boolean;
  category: string | null;
  sort: StorySort;
}

/** The library as it opens: nothing narrowed. */
export const NO_FILTERS: LibraryFilters = { level: null, length: null, narrated: false, category: null, sort: DEFAULT_STORY_SORT };

export const SORT_KEY: Record<StorySort, MessageKey> = {
  level: 'stories.sort.easiest',
  newest: 'feed.sort.newest',
  title: 'stories.sort.title',
};

export function isPlain(f: LibraryFilters): boolean {
  return f.level === null && f.length === null && !f.narrated && f.category === null && f.sort === DEFAULT_STORY_SORT;
}

/**
 * The filters and search words from the address. A level is written as its CEFR letter, as existing links have it, and
 * read as a letter or number; anything unknown is skipped. `dialect` is not a filter; the library reads it itself.
 */
export function readFilters(params: URLSearchParams): LibraryFilters & { q: string } {
  const rawLevel = params.get('level');
  const level = rawLevel ? (levelOfCefr(rawLevel) ?? (isStoryLevel(Number(rawLevel)) ? (Number(rawLevel) as StoryLevel) : null)) : null;
  const length = params.get('length');
  const sort = params.get('sort');
  return {
    q: params.get('q') ?? '',
    level,
    length: isStoryLength(length) ? length : null,
    narrated: params.get('audio') === '1',
    category: params.get('category'),
    sort: isStorySort(sort) ? sort : DEFAULT_STORY_SORT,
  };
}

/** The address for the search and filters, leaving out the plain library's defaults. */
export function writeFilters(q: string, f: LibraryFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (q.trim()) p.set('q', q.trim());
  if (f.level) p.set('level', cefrOf(f.level));
  if (f.length) p.set('length', f.length);
  if (f.narrated) p.set('audio', '1');
  if (f.category) p.set('category', f.category);
  if (f.sort !== DEFAULT_STORY_SORT) p.set('sort', f.sort);
  return p;
}

/** The GET /stories query in the shown variety; the default order is omitted so its lists stay as they were. */
export function queryOf(q: string, f: LibraryFilters, dialect: StoryDialect): StoryQuery {
  return {
    q: q.trim() || undefined,
    level: f.level ?? undefined,
    dialect,
    length: f.length ?? undefined,
    audio: f.narrated || undefined,
    category: f.category ?? undefined,
    sort: f.sort === DEFAULT_STORY_SORT ? undefined : f.sort,
  };
}

/** How long a draft waits for the next choice before asking its count. */
const COUNT_DEBOUNCE_MS = 250;

/**
 * How many stories a draft would show, from `GET /stories?…&limit=1` a moment after the choices settle. Order is left
 * out of the count, and known totals (the whole library, the list shown, a draft seen before) are not asked again.
 * Null until known.
 */
function useDraftCount(open: boolean, q: string, draft: LibraryFilters, dialect: StoryDialect, known: { key: string; total: number }[]): number | null {
  const { client } = useAuth();
  const seen = useRef(new Map<string, number>());
  const key = storyQueryString({ ...queryOf(q, draft, dialect), sort: undefined, limit: 1 });
  const fromKnown = known.find((k) => k.key === key)?.total;
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    const ready = fromKnown ?? seen.current.get(key);
    if (ready !== undefined) {
      setCount(ready);
      return;
    }
    // The last number stays meanwhile, so the button's words change once.
    let live = true;
    const timer = setTimeout(() => {
      void client.get<{ stories: StoryListItem[]; total: number }>(`/stories${key}`).then((res) => {
        if (!live || !res.ok) return;
        const total = res.data.total ?? 0;
        seen.current.set(key, total);
        setCount(total);
      });
    }, COUNT_DEBOUNCE_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [open, key, fromKnown, client]);

  // A reopened panel starts from what it knows, not the last draft's number.
  useEffect(() => {
    if (!open) setCount(null);
  }, [open]);
  return open ? count : null;
}

/** The search field with the funnel beside it, and chips under them while anything is on. */
export function LibraryFilterBar({
  q,
  typed,
  onType,
  value,
  onChange,
  dialect,
  library,
  shownTotal,
}: {
  /** The search words from the address, which the shown list was asked with. */
  q: string;
  /** What is in the field now, a moment ahead of `q`. */
  typed: string;
  onType: (q: string) => void;
  value: LibraryFilters;
  onChange: (next: LibraryFilters) => void;
  /** The variety shown; every count here is of its stories. */
  dialect: StoryDialect;
  /** That variety's front page, for its total and the levels and categories that hold something. */
  library: StoryLibrary | null;
  /** The shown list's total, once known. */
  shownTotal: number | null;
}): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const sheet = useFilterSheet({ value, onChange });
  const { id, draft, setDraft } = sheet;
  const set = (next: Partial<LibraryFilters>): void => setDraft((d) => ({ ...d, ...next }));

  // Known without asking: the whole library and the shown list.
  const known = useMemo(() => {
    const out: { key: string; total: number }[] = [];
    const countKey = (f: LibraryFilters, words: string): string => storyQueryString({ ...queryOf(words, f, dialect), sort: undefined, limit: 1 });
    if (library) out.push({ key: countKey(NO_FILTERS, ''), total: library.total });
    if (shownTotal !== null) out.push({ key: countKey(value, q), total: shownTotal });
    return out;
  }, [library, shownTotal, value, q, dialect]);
  const count = useDraftCount(sheet.open, q, draft, dialect, known);
  const number = (n: number): string => n.toLocaleString(locale);
  const applyLabel =
    count === null
      ? t('stories.filter.applyAll')
      : count === 0
        ? t('stories.filter.applyNone')
        : t(count === 1 ? 'stories.filter.applyOne' : 'stories.filter.apply', { count: number(count) });

  // Only levels and categories with something in them, plus the chosen one whatever it holds.
  const levels = useMemo(() => {
    const have = library?.levels;
    if (!have) return [...STORY_LEVELS];
    return STORY_LEVELS.filter((l) => l === draft.level || have.some((h) => h.level === l && h.count > 0));
  }, [library?.levels, draft.level]);
  const categories = (library?.categories ?? []).filter((c) => c.count > 0 || c.slug === draft.category);
  const categoryOf = (slug: string): string => categoryLabel(slug, library?.categories, locale, t) ?? slug;
  const minutesFor = (length: StoryLength): string => minutesLabel(dialect, length, t);

  // What is on, in the panel's order: one chip each, and the funnel's name.
  const chips: Array<{ key: string; label: string; icon?: React.ReactNode; clear: string; undo: Partial<LibraryFilters> }> = [];
  if (value.sort !== DEFAULT_STORY_SORT) {
    chips.push({ key: 'sort', label: t(SORT_KEY[value.sort]), icon: <SortIcon size={15} />, clear: t('stories.sort.clear'), undo: { sort: DEFAULT_STORY_SORT } });
  }
  const chip = (key: string, label: string, undo: Partial<LibraryFilters>, icon?: React.ReactNode): void => {
    chips.push({ key, label, icon, clear: t('stories.filter.remove', { what: label }), undo });
  };
  if (value.level) chip('level', levelName(value.level, t), { level: null });
  if (value.length) chip('length', t(LENGTH_KEY[value.length]), { length: null });
  if (value.narrated) chip('narrated', t('stories.narrated'), { narrated: false }, <HeadphonesIcon size={15} />);
  if (value.category) chip('category', categoryOf(value.category), { category: null }, <TagIcon size={15} />);
  const filled = chips.length > 0;
  const buttonLabel = filled ? t('feed.sortFilter.buttonOn', { what: chips.map((c) => c.label).join(', ') }) : t('feed.sortFilter.button');

  return (
    <section className="story-filters" aria-label={t('stories.filter.label')}>
      <div className="story-filter-row">
        <SearchField
          icon
          className="story-search"
          value={typed}
          onValueChange={onType}
          aria-label={t('stories.library.searchLabel')}
          placeholder={t('stories.library.searchPlaceholder')}
          autoComplete="off"
        />
        <FilterSheet
          control={sheet}
          label={buttonLabel}
          filled={filled}
          title={t('feed.sortFilter.title')}
          resetLabel={t('feed.sortFilter.reset')}
          resetDisabled={isPlain(draft)}
          onReset={() => setDraft(NO_FILTERS)}
          applyLabel={applyLabel}
          className="story-filter-sheet"
        >
          <FilterSection title={t('feed.sort.title')} id={`${id}-sort`}>
            <FilterRadios label={`${id}-sort`} axis="horizontal" className="ffilter-periods">
              {(['level', 'newest', 'title'] as const).map((s) => (
                <FilterPill key={s} on={draft.sort === s} label={t(SORT_KEY[s])} onChoose={() => set({ sort: s })} />
              ))}
            </FilterRadios>
          </FilterSection>

          <FilterSection title={t('stories.level')} id={`${id}-level`}>
            <FilterRadios label={`${id}-level`} axis="vertical">
              <FilterOption on={draft.level === null} label={t('stories.filter.anyLevel')} onChoose={() => set({ level: null })} />
              {levels.map((l) => (
                <FilterOption key={l} on={draft.level === l} label={levelName(l, t)} hint={levelHint(l, t)} onChoose={() => set({ level: l })} />
              ))}
            </FilterRadios>
          </FilterSection>

          <FilterSection title={t('stories.length')} id={`${id}-length`}>
            <FilterRadios label={`${id}-length`} axis="vertical">
              <FilterOption on={draft.length === null} label={t('stories.filter.anyLength')} onChoose={() => set({ length: null })} />
              {STORY_LENGTHS.map((l) => (
                <FilterOption key={l} on={draft.length === l} label={t(LENGTH_KEY[l])} hint={minutesFor(l)} onChoose={() => set({ length: l })} />
              ))}
            </FilterRadios>
          </FilterSection>

          <FilterSection>
            <FilterToggle on={draft.narrated} label={t('stories.narrated')} hint={t('stories.filter.readAloudHint')} onChange={(narrated) => set({ narrated })} />
          </FilterSection>

          {categories.length > 0 && (
            <FilterSection title={t('stories.filter.category')} id={`${id}-category`}>
              <FilterRadios label={`${id}-category`} axis="horizontal" className="ffilter-periods">
                <FilterPill on={draft.category === null} label={t('stories.filter.anyCategory')} onChoose={() => set({ category: null })} />
                {categories.map((c) => (
                  <FilterPill
                    key={c.slug}
                    on={draft.category === c.slug}
                    label={categoryTitle(c, locale, t)}
                    count={number(c.count)}
                    countLabel={t('stories.library.categoryCount', { count: number(c.count) })}
                    onChoose={() => set({ category: c.slug })}
                  />
                ))}
              </FilterRadios>
            </FilterSection>
          )}
        </FilterSheet>
      </div>

      {filled && (
        <div className="ffilter-chips story-filter-chips">
          {chips.map((c) => (
            <FilterChip key={c.key} control={sheet} icon={c.icon} label={c.label} clearLabel={c.clear} onClear={() => sheet.undo({ ...value, ...c.undo })} />
          ))}
          {chips.length >= 2 && (
            <button type="button" className="link-btn story-filter-clear" onClick={() => sheet.undo(NO_FILTERS)}>
              {t('stories.filter.clearAll')}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

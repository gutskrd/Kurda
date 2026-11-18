import {
  DEFAULT_FEED_PERIOD,
  DEFAULT_FEED_SORT,
  FEED_PERIODS,
  FEED_SORTS,
  sortRanks,
  type FeedPeriod,
  type FeedSort,
} from '@kurda/shared';
import { FilterChip, FilterOption, FilterPill, FilterRadios, FilterSection, FilterSheet, useFilterSheet } from '../components/FilterSheet';
import { FunnelIcon, SortIcon } from '../components/icons';
import { useT, type Translate } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { SECTIONS, type FeedSection } from './postKinds';

/** How the wall is shown: in what order, from how far back, and which of it. */
export interface FeedFilterValue {
  section: FeedSection;
  kind: string | null;
  sort: FeedSort;
  period: FeedPeriod;
}

/** The wall as it opens: everything, newest first. */
export const DEFAULT_FILTER: FeedFilterValue = { section: 'all', kind: null, sort: DEFAULT_FEED_SORT, period: DEFAULT_FEED_PERIOD };

/** "All writing" or "All pictures": a whole section chosen. */
const ALL_OF: Partial<Record<FeedSection, MessageKey>> = { gotin: 'civak.filter.allWriting', dimen: 'civak.filter.allPictures' };

const SORT_LABEL: Record<FeedSort, MessageKey> = {
  newest: 'feed.sort.newest',
  oldest: 'feed.sort.oldest',
  popular: 'feed.sort.popular',
  discussed: 'feed.sort.discussed',
};
const SORT_HINT: Partial<Record<FeedSort, MessageKey>> = { popular: 'feed.sort.popularHint', discussed: 'feed.sort.discussedHint' };
const PERIOD_LABEL: Record<FeedPeriod, MessageKey> = {
  day: 'feed.period.day',
  week: 'feed.period.week',
  month: 'feed.period.month',
  year: 'feed.period.year',
  all: 'feed.period.all',
};

/** A range only belongs to the two ranked orders; newest and oldest always read everything. */
function normalised(value: FeedFilterValue): FeedFilterValue {
  return sortRanks(value.sort) ? value : { ...value, period: DEFAULT_FEED_PERIOD };
}

export function isDefaultFilter(value: FeedFilterValue): boolean {
  const v = normalised(value);
  return v.section === 'all' && v.kind === null && v.sort === DEFAULT_FEED_SORT && v.period === DEFAULT_FEED_PERIOD;
}

const same = (a: FeedFilterValue, b: FeedFilterValue): boolean => {
  const x = normalised(a);
  const y = normalised(b);
  return x.section === y.section && x.kind === y.kind && x.sort === y.sort && x.period === y.period;
};

/** What the wall is narrowed to, such as "Pictures · Meme", or null while it shows everything. */
function filterLabel(t: Translate, value: Pick<FeedFilterValue, 'section' | 'kind'>): string | null {
  if (value.section === 'all') return null;
  const section = SECTIONS.find((s) => s.key === value.section);
  if (!section) return null;
  const kind = value.kind ? section.kinds.find((k) => k.key === value.kind) : null;
  return kind ? `${t(section.labelKey)} · ${t(kind.labelKey)}` : t(section.labelKey);
}

/** The order and its range, such as "Most popular · This week", or null for newest first. */
function sortLabel(t: Translate, value: Pick<FeedFilterValue, 'sort' | 'period'>): string | null {
  if (value.sort === DEFAULT_FEED_SORT) return null;
  const ranged = sortRanks(value.sort) && value.period !== DEFAULT_FEED_PERIOD;
  return ranged ? `${t(SORT_LABEL[value.sort])} · ${t(PERIOD_LABEL[value.period])}` : t(SORT_LABEL[value.sort]);
}

/** Everything that differs from the plain wall, for the button's name, such as "Most popular, This week, Pictures · Meme". */
function activeParts(t: Translate, value: FeedFilterValue): string[] {
  const v = normalised(value);
  const parts: string[] = [];
  if (v.sort !== DEFAULT_FEED_SORT) parts.push(t(SORT_LABEL[v.sort]));
  if (sortRanks(v.sort) && v.period !== DEFAULT_FEED_PERIOD) parts.push(t(PERIOD_LABEL[v.period]));
  const kind = filterLabel(t, v);
  if (kind) parts.push(kind);
  return parts;
}

/**
 * The wall's sort and filter: a funnel beside the Post button opening one panel for the order, the range of the two
 * ranked orders, and the kinds of post. The panel holds a draft applied only by "Show posts"; "Reset" returns it to
 * the plain wall. While anything differs, the funnel is filled and chips under the heading name the order and kinds,
 * each reopening the panel or clearing its part. The panel itself is components/FilterSheet.tsx.
 */
export function FeedFilter({ value, onChange }: { value: FeedFilterValue; onChange: (next: FeedFilterValue) => void }): React.JSX.Element {
  const t = useT();
  const sheet = useFilterSheet({ value, onChange, normalise: normalised, same });
  const { id, draft, setDraft } = sheet;

  const kindText = filterLabel(t, value);
  const sortText = sortLabel(t, normalised(value));
  const parts = activeParts(t, value);
  const filled = parts.length > 0;
  const buttonLabel = filled ? t('feed.sortFilter.buttonOn', { what: parts.join(', ') }) : t('feed.sortFilter.button');

  const ranks = sortRanks(draft.sort);
  const isKind = (section: FeedSection, kind: string | null): boolean => draft.section === section && draft.kind === kind;
  const pick = (section: FeedSection, kind: string | null) => (): void => setDraft((d) => ({ ...d, section, kind }));

  return (
    <>
      {(sortText || kindText) && (
        <span className="ffilter-chips">
          {sortText && (
            <FilterChip
              control={sheet}
              icon={<SortIcon size={15} />}
              label={sortText}
              clearLabel={t('feed.sort.clear')}
              onClear={() => sheet.undo({ ...value, sort: DEFAULT_FEED_SORT, period: DEFAULT_FEED_PERIOD })}
            />
          )}
          {kindText && (
            <FilterChip
              control={sheet}
              icon={<FunnelIcon size={15} weight="fill" />}
              label={kindText}
              clearLabel={t('civak.filter.clear')}
              onClear={() => sheet.undo({ ...value, section: 'all', kind: null })}
            />
          )}
        </span>
      )}

      <FilterSheet
        control={sheet}
        label={buttonLabel}
        filled={filled}
        title={t('feed.sortFilter.title')}
        resetLabel={t('feed.sortFilter.reset')}
        resetDisabled={isDefaultFilter(draft)}
        onReset={() => setDraft(DEFAULT_FILTER)}
        applyLabel={t('feed.sortFilter.apply')}
      >
        <FilterSection title={t('feed.sort.title')} id={`${id}-sort`}>
          <FilterRadios label={`${id}-sort`} axis="vertical">
            {FEED_SORTS.map((s) => (
              <FilterOption
                key={s}
                on={draft.sort === s}
                label={t(SORT_LABEL[s])}
                hint={SORT_HINT[s] ? t(SORT_HINT[s]!) : undefined}
                onChoose={() => setDraft((d) => ({ ...d, sort: s }))}
              />
            ))}
          </FilterRadios>
        </FilterSection>

        {ranks && (
          <FilterSection title={t('feed.period.title')} id={`${id}-period`}>
            <FilterRadios label={`${id}-period`} axis="horizontal" className="ffilter-periods">
              {FEED_PERIODS.map((p) => (
                <FilterPill key={p} on={draft.period === p} label={t(PERIOD_LABEL[p])} onChoose={() => setDraft((d) => ({ ...d, period: p }))} />
              ))}
            </FilterRadios>
          </FilterSection>
        )}

        <FilterSection title={t('civak.filter.title')} id={`${id}-show`}>
          <FilterRadios label={`${id}-show`} axis="vertical">
            <FilterOption on={isKind('all', null)} label={t('civak.filter.everything')} onChoose={pick('all', null)} />
            {SECTIONS.filter((x) => x.key !== 'all').map((s) => (
              <div key={s.key} className="ffilter-group" role="group" aria-labelledby={`${id}-${s.key}`}>
                <span id={`${id}-${s.key}`} className="ffilter-heading">
                  {t(s.labelKey)}
                </span>
                <FilterOption on={isKind(s.key, null)} label={t(ALL_OF[s.key] ?? s.labelKey)} onChoose={pick(s.key, null)} />
                {s.kinds.map((k) => (
                  <FilterOption key={k.key} on={isKind(s.key, k.key)} label={t(k.labelKey)} onChoose={pick(s.key, k.key)} />
                ))}
              </div>
            ))}
          </FilterRadios>
        </FilterSection>
      </FilterSheet>
    </>
  );
}

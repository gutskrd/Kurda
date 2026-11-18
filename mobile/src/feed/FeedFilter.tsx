import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { DEFAULT_FEED_PERIOD, DEFAULT_FEED_SORT, FEED_PERIODS, FEED_SORTS, sortRanks, type FeedPeriod, type FeedSort } from '@kurda/shared';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { FilterHeading, FilterOption, FilterOptions, FilterPill, FilterPills, FilterSheet, FilterSubheading } from '../theme/FilterSheet';
import type { IconName } from '../theme/Icon';
import { spacing } from '../theme/tokens';
import { SECTIONS, kindWithin, type FeedSection } from './types';

/** How the wall is read: in what order, from how far back, and which posts. */
export interface FeedFilterValue {
  section: FeedSection;
  kind: string | null;
  sort: FeedSort;
  /** How far back a ranked order looks; newest and oldest read everything. */
  period: FeedPeriod;
}

/** The wall as it opens: everything, newest first. */
export const DEFAULT_FILTER: FeedFilterValue = { section: 'all', kind: null, sort: DEFAULT_FEED_SORT, period: DEFAULT_FEED_PERIOD };

/** The same choice normalised: a kind only within its half, and a range only for an order that ranks. */
export function normalise(v: FeedFilterValue): FeedFilterValue {
  return { section: v.section, kind: kindWithin(v.section, v.kind), sort: v.sort, period: sortRanks(v.sort) ? v.period : DEFAULT_FEED_PERIOD };
}

export function isDefaultFilter(v: FeedFilterValue): boolean {
  const n = normalise(v);
  return n.section === 'all' && !n.kind && n.sort === DEFAULT_FEED_SORT && n.period === DEFAULT_FEED_PERIOD;
}

const ALL_OF: Partial<Record<FeedSection, TranslationKey>> = { gotin: 'civak.filter.allWriting', dimen: 'civak.filter.allPictures' };

const SORT_WORD: Record<FeedSort, TranslationKey> = {
  newest: 'feed.sort.newest',
  oldest: 'feed.sort.oldest',
  popular: 'feed.sort.popular',
  discussed: 'feed.sort.discussed',
};
const SORT_HINT: Partial<Record<FeedSort, TranslationKey>> = { popular: 'feed.sort.popularHint', discussed: 'feed.sort.discussedHint' };
const PERIOD_WORD: Record<FeedPeriod, TranslationKey> = {
  day: 'feed.period.day',
  week: 'feed.period.week',
  month: 'feed.period.month',
  year: 'feed.period.year',
  all: 'feed.period.all',
};

/** Which posts the wall is narrowed to, in words ("Pictures · Meme"), or null when it shows every kind. */
export function filterLabel(t: (key: TranslationKey) => string, value: Pick<FeedFilterValue, 'section' | 'kind'>): string | null {
  if (value.section === 'all') return null;
  const section = SECTIONS.find((s) => s.key === value.section);
  if (!section) return null;
  const kind = value.kind ? section.kinds.find((k) => k.key === value.kind) : null;
  return kind ? `${t(section.labelKey)} · ${t(kind.labelKey)}` : t(section.labelKey);
}

/** The wall's order in words ("Most popular · This week"), or null while it is newest first. */
export function sortLabel(t: (key: TranslationKey) => string, value: Pick<FeedFilterValue, 'sort' | 'period'>): string | null {
  if (value.sort === DEFAULT_FEED_SORT) return null;
  const word = t(SORT_WORD[value.sort]);
  return sortRanks(value.sort) && value.period !== DEFAULT_FEED_PERIOD ? `${word} · ${t(PERIOD_WORD[value.period])}` : word;
}

/**
 * Sort and filter the wall in one sheet: the order (newest, oldest, most popular, most discussed), the time range
 * for the two that rank, and which posts. Nothing applies until "Show posts", so choosing three things does not
 * reload the wall three times, and closing any other way leaves it unchanged. "Reset" restores the defaults.
 * Built from theme/FilterSheet.tsx, as the stories library is; the chips under the faces are its FilterChip.
 */
export function FeedFilterSheet({
  visible,
  value,
  onApply,
  onClose,
}: {
  visible: boolean;
  value: FeedFilterValue;
  onApply: (next: FeedFilterValue) => void;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useI18n();
  const [draft, setDraft] = useState(value);
  // Each time it opens, it starts from what the wall shows.
  useEffect(() => {
    if (visible) setDraft(value);
  }, [visible, value]);

  const set = (next: Partial<FeedFilterValue>) => setDraft((d) => ({ ...d, ...next }));
  const is = (section: FeedSection, kind: string | null) => draft.section === section && draft.kind === kind;

  return (
    <FilterSheet
      visible={visible}
      onClose={onClose}
      title={t('feed.sortFilter.title')}
      resetLabel={t('feed.sortFilter.reset')}
      resetDisabled={isDefaultFilter(draft)}
      onReset={() => setDraft(DEFAULT_FILTER)}
      applyLabel={t('feed.sortFilter.apply')}
      onApply={() => onApply(normalise(draft))}
      testID="feed-filter-sheet"
    >
      <FilterHeading>{t('feed.sort.title')}</FilterHeading>
      <FilterOptions label={t('feed.sort.title')}>
        {FEED_SORTS.map((s) => (
          <FilterOption
            key={s}
            label={t(SORT_WORD[s])}
            hint={SORT_HINT[s] ? t(SORT_HINT[s]!) : undefined}
            icon={SORT_ICON[s]}
            on={draft.sort === s}
            onPress={() => set({ sort: s })}
          />
        ))}
      </FilterOptions>

      {sortRanks(draft.sort) ? (
        <>
          <FilterHeading>{t('feed.period.title')}</FilterHeading>
          <FilterPills label={t('feed.period.title')}>
            {FEED_PERIODS.map((p) => (
              <FilterPill key={p} label={t(PERIOD_WORD[p])} on={draft.period === p} onPress={() => set({ period: p })} />
            ))}
          </FilterPills>
        </>
      ) : null}

      <FilterHeading>{t('civak.filter.title')}</FilterHeading>
      <FilterOptions label={t('civak.filter.title')}>
        <FilterOption label={t('civak.filter.everything')} on={is('all', null)} onPress={() => set({ section: 'all', kind: null })} />
        {SECTIONS.filter((s) => s.key !== 'all').map((s) => (
          <View key={s.key} style={styles.group}>
            <FilterSubheading>{t(s.labelKey)}</FilterSubheading>
            <FilterOption label={t(ALL_OF[s.key] ?? s.labelKey)} on={is(s.key, null)} onPress={() => set({ section: s.key, kind: null })} />
            {s.kinds.map((k) => (
              <FilterOption key={k.key} label={t(k.labelKey)} on={is(s.key, k.key)} onPress={() => set({ section: s.key, kind: k.key })} />
            ))}
          </View>
        ))}
      </FilterOptions>
    </FilterSheet>
  );
}

/** A glyph for each order, so the four read apart at a glance. */
const SORT_ICON: Record<FeedSort, IconName> = { newest: 'clock', oldest: 'history', popular: 'heart', discussed: 'chat' };

const styles = StyleSheet.create({
  group: { marginTop: spacing.xs },
});

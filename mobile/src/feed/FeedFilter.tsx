import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { haptic } from '../feedback/haptics';
import { DEFAULT_FEED_PERIOD, DEFAULT_FEED_SORT, FEED_PERIODS, FEED_SORTS, sortRanks, type FeedPeriod, type FeedSort } from '@kurda/shared';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { useDirection } from '../reports/direction';
import { BottomSheet, SheetScrollView } from '../theme/BottomSheet';
import { ClayButton } from '../theme/glass';
import { Icon, type IconName } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { SECTIONS, kindWithin, type FeedSection } from './types';

/** How the wall is read: in what order, from how far back, and which posts. */
export interface FeedFilterValue {
  section: FeedSection;
  kind: string | null;
  sort: FeedSort;
  /** how far back a ranked order looks; newest and oldest read everything */
  period: FeedPeriod;
}

/** The wall as it opens: everything, newest first. */
export const DEFAULT_FILTER: FeedFilterValue = { section: 'all', kind: null, sort: DEFAULT_FEED_SORT, period: DEFAULT_FEED_PERIOD };

/** The same choice said once: a kind only within its half, and a range only for an order that ranks. */
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

/** Which posts the wall is narrowed to, in words — "Pictures · Meme" — or null when it shows every kind. */
export function filterLabel(t: (key: TranslationKey) => string, value: Pick<FeedFilterValue, 'section' | 'kind'>): string | null {
  if (value.section === 'all') return null;
  const section = SECTIONS.find((s) => s.key === value.section);
  if (!section) return null;
  const kind = value.kind ? section.kinds.find((k) => k.key === value.kind) : null;
  return kind ? `${t(section.labelKey)} · ${t(kind.labelKey)}` : t(section.labelKey);
}

/** The order the wall is in, in words — "Most popular · This week" — or null while it is newest first. */
export function sortLabel(t: (key: TranslationKey) => string, value: Pick<FeedFilterValue, 'sort' | 'period'>): string | null {
  if (value.sort === DEFAULT_FEED_SORT) return null;
  const word = t(SORT_WORD[value.sort]);
  return sortRanks(value.sort) && value.period !== DEFAULT_FEED_PERIOD ? `${word} · ${t(PERIOD_WORD[value.period])}` : word;
}

/** Everything that is not as the wall opens, for the button's name: "Most popular, This week, Pictures · Meme". */
export function filterSummary(t: (key: TranslationKey) => string, value: FeedFilterValue): string | null {
  const n = normalise(value);
  const parts = [
    n.sort === DEFAULT_FEED_SORT ? null : t(SORT_WORD[n.sort]),
    sortRanks(n.sort) && n.period !== DEFAULT_FEED_PERIOD ? t(PERIOD_WORD[n.period]) : null,
    filterLabel(t, n),
  ].filter((p): p is string => !!p);
  return parts.length ? parts.join(', ') : null;
}

/**
 * Sort and filter the wall, in one sheet: in what order (newest, oldest, most
 * popular, most discussed), from how far back for the two that rank, and which
 * posts. Nothing changes until "Show posts" — choosing three things should not
 * reload the wall three times behind the sheet — and closing it any other way
 * leaves the wall as it was. "Reset" puts the choices back to how the wall
 * opens.
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
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const [draft, setDraft] = useState(value);
  // each time it opens, it starts from what the wall shows
  useEffect(() => {
    if (visible) setDraft(value);
  }, [visible, value]);

  const set = (next: Partial<FeedFilterValue>) => setDraft((d) => ({ ...d, ...next }));
  const is = (section: FeedSection, kind: string | null) => draft.section === section && draft.kind === kind;
  const pristine = isDefaultFilter(draft);

  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('feed.sortFilter.title')} testID="feed-filter-sheet">
      <SheetScrollView style={styles.scroll} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Heading>{t('feed.sort.title')}</Heading>
        <View accessibilityRole="radiogroup" accessibilityLabel={t('feed.sort.title')}>
          {FEED_SORTS.map((s) => (
            <Option
              key={s}
              label={t(SORT_WORD[s])}
              hint={SORT_HINT[s] ? t(SORT_HINT[s]!) : undefined}
              icon={SORT_ICON[s]}
              on={draft.sort === s}
              onPress={() => set({ sort: s })}
            />
          ))}
        </View>

        {sortRanks(draft.sort) ? (
          <>
            <Heading>{t('feed.period.title')}</Heading>
            <View style={[styles.periods, { flexDirection: dir.row }]} accessibilityRole="radiogroup" accessibilityLabel={t('feed.period.title')}>
              {FEED_PERIODS.map((p) => {
                const on = draft.period === p;
                return (
                  <Pressable
                    key={p}
                    onPress={() => {
                      if (!on) haptic('select');
                      set({ period: p });
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={t(PERIOD_WORD[p])}
                    hitSlop={{ top: 4, bottom: 4 }}
                    style={({ pressed }) => [
                      styles.period,
                      { backgroundColor: on ? colors.textPrimary : colors.controlTrack },
                      pressed && !on && styles.pressed,
                    ]}
                  >
                    <Text style={[styles.periodText, { color: on ? colors.background : colors.textPrimary }]}>{t(PERIOD_WORD[p])}</Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : null}

        <Heading>{t('civak.filter.title')}</Heading>
        <View accessibilityRole="radiogroup" accessibilityLabel={t('civak.filter.title')}>
          <Option label={t('civak.filter.everything')} on={is('all', null)} onPress={() => set({ section: 'all', kind: null })} />
          {SECTIONS.filter((s) => s.key !== 'all').map((s) => (
            <View key={s.key} style={styles.group}>
              <Text style={[styles.subheading, dir.text, { color: colors.textSecondary }]}>{t(s.labelKey)}</Text>
              <Option label={t(ALL_OF[s.key] ?? s.labelKey)} on={is(s.key, null)} onPress={() => set({ section: s.key, kind: null })} />
              {s.kinds.map((k) => (
                <Option key={k.key} label={t(k.labelKey)} on={is(s.key, k.key)} onPress={() => set({ section: s.key, kind: k.key })} />
              ))}
            </View>
          ))}
        </View>
      </SheetScrollView>

      {/* the two ways to finish, always in reach under the choices */}
      <View style={[styles.footer, { flexDirection: dir.row, borderTopColor: colors.separator }]}>
        <Pressable
          onPress={() => setDraft(DEFAULT_FILTER)}
          disabled={pristine}
          accessibilityRole="button"
          accessibilityState={{ disabled: pristine }}
          hitSlop={8}
          style={styles.reset}
        >
          <Text style={[styles.resetText, { color: pristine ? colors.textSecondary : colors.textPrimary }]}>{t('feed.sortFilter.reset')}</Text>
        </Pressable>
        <ClayButton
          label={t('feed.sortFilter.apply')}
          tone="primary"
          onPress={() => {
            onApply(normalise(draft));
            onClose();
          }}
          style={styles.apply}
        />
      </View>
    </BottomSheet>
  );
}

/** a glyph for each order, so the four read apart at a glance */
const SORT_ICON: Record<FeedSort, IconName> = { newest: 'clock', oldest: 'history', popular: 'heart', discussed: 'chat' };

function Heading({ children }: { children: string }): React.JSX.Element {
  const { colors } = useTheme();
  const dir = useDirection();
  return (
    <Text style={[styles.heading, dir.text, { color: colors.textPrimary }]} accessibilityRole="header">
      {children}
    </Text>
  );
}

function Option({ label, hint, icon, on, onPress }: { label: string; hint?: string; icon?: IconName; on: boolean; onPress: () => void }): React.JSX.Element {
  const { colors } = useTheme();
  const dir = useDirection();
  return (
    <Pressable
      onPress={() => {
        if (!on) haptic('select');
        onPress();
      }}
      accessibilityRole="radio"
      accessibilityState={{ checked: on }}
      accessibilityLabel={hint ? `${label}, ${hint}` : label}
      style={({ pressed }) => [styles.option, { flexDirection: dir.row }, pressed && { backgroundColor: colors.controlTrack }]}
    >
      {icon ? <Icon name={icon} size={18} color={colors.textSecondary} /> : null}
      <View style={styles.optionWords}>
        <Text style={[styles.optionText, dir.text, { color: colors.textPrimary }, on && styles.optionOn]}>{label}</Text>
        {hint ? <Text style={[styles.optionHint, dir.text, { color: colors.textSecondary }]}>{hint}</Text> : null}
      </View>
      {on ? <Icon name="check" size={20} color={colors.textPrimary} /> : null}
    </Pressable>
  );
}

/**
 * One thing the wall is set to, while it is not as it opens: a chip under the
 * faces that says so, opens the sheet again when tapped, and has a ✕ that
 * undoes just that part.
 */
export function FeedFilterChip({
  icon,
  label,
  clearLabel,
  onOpen,
  onClear,
}: {
  icon: IconName;
  label: string;
  clearLabel: string;
  onOpen: () => void;
  onClear: () => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  return (
    <View style={[styles.chip, { flexDirection: dir.row, backgroundColor: colors.controlTrack }]}>
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={t('feed.sortFilter.button')}
        style={[styles.chipMain, { flexDirection: dir.row }]}
      >
        <Icon name={icon} size={16} color={colors.textPrimary} />
        <Text style={[styles.chipText, { color: colors.textPrimary }]} numberOfLines={1}>
          {label}
        </Text>
      </Pressable>
      <Pressable onPress={onClear} accessibilityRole="button" accessibilityLabel={clearLabel} hitSlop={8} style={styles.chipClear}>
        <Icon name="close" size={14} color={colors.textSecondary} />
      </Pressable>
    </View>
  );
}

/** The chips under the faces, side by side, wrapping when they will not fit. */
export function FeedFilterChips({ children }: { children: React.ReactNode }): React.JSX.Element {
  const dir = useDirection();
  return <View style={[styles.chipRow, { flexDirection: dir.row }]}>{children}</View>;
}

const styles = StyleSheet.create({
  scroll: { flexShrink: 1, marginHorizontal: -layout.gutter },
  body: { paddingHorizontal: layout.gutter, paddingBottom: spacing.md },
  heading: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold, marginTop: spacing.md, marginBottom: spacing.xs },
  subheading: { fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold, letterSpacing: 0.4, textTransform: 'uppercase', marginTop: spacing.sm, marginBottom: 2 },
  group: { marginTop: spacing.xs },
  option: { alignItems: 'center', gap: spacing.sm + 2, minHeight: MIN_TOUCH_TARGET + 4, paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radii.md },
  optionWords: { flex: 1, minWidth: 0 },
  optionText: { fontSize: typography.sizes.md },
  optionOn: { fontWeight: typography.weights.semibold },
  optionHint: { fontSize: typography.sizes.xs, marginTop: 1 },
  periods: { flexWrap: 'wrap', gap: spacing.sm },
  period: { minHeight: 36, paddingHorizontal: spacing.md - 2, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  periodText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  pressed: { opacity: 0.6 },
  footer: { alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, paddingTop: spacing.sm + 4, borderTopWidth: StyleSheet.hairlineWidth, marginHorizontal: -layout.gutter, paddingHorizontal: layout.gutter },
  reset: { minHeight: MIN_TOUCH_TARGET, justifyContent: 'center', paddingHorizontal: spacing.xs },
  resetText: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  apply: { flexGrow: 1, maxWidth: 260 },
  chipRow: { flexWrap: 'wrap', gap: spacing.sm, paddingHorizontal: layout.gutter, paddingBottom: spacing.sm },
  chip: { alignItems: 'center', borderRadius: radii.pill, paddingStart: spacing.md, paddingEnd: spacing.xs, minHeight: 36, maxWidth: '100%' },
  chipMain: { alignItems: 'center', gap: 6, minHeight: 36, flexShrink: 1 },
  chipText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, flexShrink: 1 },
  chipClear: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
});

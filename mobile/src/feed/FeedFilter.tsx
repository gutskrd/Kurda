import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { useDirection } from '../reports/direction';
import { BottomSheet } from '../theme/BottomSheet';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { SECTIONS, type FeedSection } from './types';

/** One way to narrow the wall: everything, a half of it, or one kind within a half. */
export interface FeedFilterValue {
  section: FeedSection;
  kind: string | null;
}

const ALL_OF: Partial<Record<FeedSection, TranslationKey>> = { gotin: 'civak.filter.allWriting', dimen: 'civak.filter.allPictures' };

/** What the wall is narrowed to, in words — "Pictures · Meme" — or null when it shows everything. */
export function filterLabel(t: (key: TranslationKey) => string, value: FeedFilterValue): string | null {
  if (value.section === 'all') return null;
  const section = SECTIONS.find((s) => s.key === value.section);
  if (!section) return null;
  const kind = value.kind ? section.kinds.find((k) => k.key === value.kind) : null;
  return kind ? `${t(section.labelKey)} · ${t(kind.labelKey)}` : t(section.labelKey);
}

/**
 * The wall's filter, as a short list in a sheet: Everything, then each half
 * with its kinds under it — the one shown now ticked. A choice closes the
 * sheet at once. Kept out of the way until it is wanted, so the wall opens on
 * the posts and not on a row of choices.
 */
export function FeedFilterSheet({
  visible,
  value,
  onChoose,
  onClose,
}: {
  visible: boolean;
  value: FeedFilterValue;
  onChoose: (next: FeedFilterValue) => void;
  onClose: () => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const choose = (next: FeedFilterValue) => {
    onChoose(next);
    onClose();
  };
  const is = (section: FeedSection, kind: string | null) => value.section === section && value.kind === kind;
  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('civak.filter.title')}>
      <View accessibilityRole="radiogroup" accessibilityLabel={t('civak.filter.title')}>
        <Option label={t('civak.filter.everything')} on={is('all', null)} onPress={() => choose({ section: 'all', kind: null })} />
        {SECTIONS.filter((s) => s.key !== 'all').map((s) => (
          <View key={s.key} style={styles.group}>
            <Text style={[styles.heading, { color: colors.textSecondary }]} accessibilityRole="header">
              {t(s.labelKey)}
            </Text>
            <Option label={t(ALL_OF[s.key] ?? s.labelKey)} on={is(s.key, null)} onPress={() => choose({ section: s.key, kind: null })} />
            {s.kinds.map((k) => (
              <Option key={k.key} label={t(k.labelKey)} on={is(s.key, k.key)} onPress={() => choose({ section: s.key, kind: k.key })} />
            ))}
          </View>
        ))}
      </View>
    </BottomSheet>
  );
}

function Option({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }): React.JSX.Element {
  const { colors } = useTheme();
  const dir = useDirection();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: on }}
      accessibilityLabel={label}
      style={({ pressed }) => [styles.option, { flexDirection: dir.row }, pressed && { backgroundColor: colors.controlTrack }]}
    >
      <Text style={[styles.optionText, dir.text, { color: colors.textPrimary }, on && styles.optionOn]}>{label}</Text>
      {on ? <Icon name="check" size={20} color={colors.textPrimary} /> : null}
    </Pressable>
  );
}

/**
 * What the wall is narrowed to, while it is: a chip under the faces that says
 * so, opens the filter again when tapped, and has a ✕ that shows everything.
 * Nothing at all while the wall shows everything.
 */
export function FeedFilterChip({ label, onOpen, onClear }: { label: string; onOpen: () => void; onClear: () => void }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  return (
    <View style={[styles.chipRow, { flexDirection: dir.row }]}>
      <View style={[styles.chip, { flexDirection: dir.row, backgroundColor: colors.controlTrack }]}>
        <Pressable
          onPress={onOpen}
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityHint={t('civak.filter.button')}
          style={[styles.chipMain, { flexDirection: dir.row }]}
        >
          <Icon name="filter-fill" size={16} color={colors.textPrimary} />
          <Text style={[styles.chipText, { color: colors.textPrimary }]} numberOfLines={1}>
            {label}
          </Text>
        </Pressable>
        <Pressable onPress={onClear} accessibilityRole="button" accessibilityLabel={t('civak.filter.clear')} hitSlop={8} style={styles.chipClear}>
          <Icon name="close" size={14} color={colors.textSecondary} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { marginTop: spacing.md },
  heading: { fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: spacing.xs },
  option: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: MIN_TOUCH_TARGET + 4, paddingHorizontal: spacing.sm, borderRadius: radii.md },
  optionText: { fontSize: typography.sizes.md },
  optionOn: { fontWeight: typography.weights.semibold },
  chipRow: { flexDirection: 'row', paddingHorizontal: layout.gutter, paddingBottom: spacing.sm },
  chip: { flexDirection: 'row', alignItems: 'center', borderRadius: radii.pill, paddingStart: spacing.md, paddingEnd: spacing.xs, minHeight: 36 },
  chipMain: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36 },
  chipText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  chipClear: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
});

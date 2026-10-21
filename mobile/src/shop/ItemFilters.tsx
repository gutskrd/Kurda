import { useRef, useState, type ReactNode } from 'react';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { ITEM_SORTS, itemCategory, type ItemCategory, type ItemSort } from '@kurda/shared';
import { assetUrl } from '../api/env';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { useI18n } from '../i18n/I18nContext';
import { useDirection } from '../reports/direction';
import { Icon, type IconName } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { sectionLabel } from '../theme/fonts';
import { radii, spacing, typography } from '../theme/tokens';
import { KIND_LABEL, SORT_LABEL, itemsText, kindWithCount } from './format';

/**
 * The pieces the shop, the inventory and the gift picker find their way with.
 *
 * Three screens sell, hold and give the same things, and each used to lay
 * them out its own way: the shop as a list under the server's own words
 * (BACKGROUND, ICON, TAG) with no pictures, the inventory as two unlabelled
 * shelves of squares, the gift picker as one long grid. They now share one
 * set of controls — a search field, a row of kinds with how many there are of
 * each, an order, a few switches — and one way of drawing an item, so a
 * background looks like a background and is found under Backgrounds wherever
 * it is. What is searched, sorted and counted is @kurda/shared's
 * (shop-items.ts), the same as the browser's.
 *
 * Chips rather than the segmented control: a kind is a word and a count, and
 * four of those do not fit across a phone in German or Dutch without being cut
 * short. A row of chips scrolls instead, starting from the reading side.
 */

/** A row of chips that scrolls sideways and starts on the reading side (right, in Soranî and Arabic). */
function ChipRow({ children, inset = 0, style }: { children: ReactNode; inset?: number; style?: StyleProp<ViewStyle> }): React.JSX.Element {
  const dir = useDirection();
  const scroller = useRef<ScrollView>(null);
  // the app mirrors these screens itself (reports/direction.ts): a row laid
  // out from the right is scrolled to its right end, where it starts — and
  // kept there as its counts change, unless somebody has scrolled it away
  const mirrored = dir.row === 'row-reverse';
  const geometry = useRef({ content: 0, view: 0, x: 0 });
  return (
    <ScrollView
      ref={scroller}
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      style={style}
      // the row runs to the screen's edges and scrolls under them; `inset` lines its first chip up with the text above
      contentContainerStyle={[styles.chipRow, { flexDirection: dir.row, paddingHorizontal: inset }]}
      onLayout={(e) => {
        geometry.current.view = e.nativeEvent.layout.width;
      }}
      scrollEventThrottle={32}
      onScroll={(e) => {
        geometry.current.x = e.nativeEvent.contentOffset.x;
      }}
      onContentSizeChange={(width) => {
        const g = geometry.current;
        const atStart = g.content === 0 || g.x >= g.content - g.view - 2;
        g.content = width;
        if (mirrored && atStart) scroller.current?.scrollToEnd({ animated: false });
      }}
    >
      {children}
    </ScrollView>
  );
}

export interface KindOption<K extends string> {
  key: K;
  label: string;
  /** how many there are; drawn beside the label */
  count?: number;
  /** what a screen reader says, when the label and the count say it badly together */
  a11y?: string;
}

/**
 * One kind at a time: "All 42 · Backgrounds 27 · Icons 14 · Tags 1".
 *
 * A filter is a choice of one (`radio`); where the kinds are separate panels
 * of different things — the inventory, where a background is put on one way
 * and a frame another — they are tabs (`tab`).
 */
export function KindChips<K extends string>({
  options,
  value,
  onChange,
  label,
  role = 'radio',
  inset,
  style,
}: {
  options: readonly KindOption<K>[];
  value: K;
  onChange: (key: K) => void;
  /** what the choice is, for a screen reader */
  label: string;
  role?: 'radio' | 'tab';
  /** the side padding of a row that runs edge to edge */
  inset?: number;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const { colors } = useTheme();
  const dir = useDirection();
  return (
    <View accessibilityRole={role === 'tab' ? 'tablist' : 'radiogroup'} accessibilityLabel={label} style={style}>
      <ChipRow inset={inset}>
        {options.map((o) => {
          const on = o.key === value;
          return (
            <Pressable
              key={o.key}
              onPress={() => onChange(o.key)}
              accessibilityRole={role}
              accessibilityState={role === 'tab' ? { selected: on } : { checked: on }}
              // react-native-web reads only the aria-* form
              aria-checked={role === 'radio' ? on : undefined}
              aria-selected={role === 'tab' ? on : undefined}
              accessibilityLabel={o.a11y ?? o.label}
              style={({ pressed }) => [
                styles.chip,
                { flexDirection: dir.row, backgroundColor: on ? colors.primary : colors.controlTrack, opacity: pressed ? 0.8 : 1 },
              ]}
            >
              <Text style={[styles.chipText, { color: on ? colors.textOnPrimary : colors.textPrimary }]} numberOfLines={1}>
                {o.label}
              </Text>
              {o.count !== undefined ? (
                <Text style={[styles.chipCount, on ? styles.chipCountOn : null, { color: on ? colors.textOnPrimary : colors.textSecondary }]}>
                  {o.count}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </ChipRow>
    </View>
  );
}

/** The options beside the kinds — the order and the switches — in one row that scrolls if it must. */
export function OptionRow({ children, inset }: { children: ReactNode; inset?: number }): React.JSX.Element {
  return <ChipRow inset={inset}>{children}</ChipRow>;
}

/** A switch that narrows the list ("Within my Zêr"), drawn as a chip with a box that fills with a tick. */
export function ToggleChip({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (next: boolean) => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const dir = useDirection();
  return (
    <Pressable
      onPress={() => onChange(!value)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: value }}
      aria-checked={value}
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.chip,
        { flexDirection: dir.row, backgroundColor: value ? colors.primary : colors.controlTrack, opacity: pressed ? 0.8 : 1 },
      ]}
    >
      {value ? (
        <Icon name="check" size={16} color={colors.textOnPrimary} />
      ) : (
        <View style={[styles.box, { borderColor: colors.textSecondary }]} />
      )}
      <Text style={[styles.chipText, { color: value ? colors.textOnPrimary : colors.textPrimary }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * The order the list is in, as a chip that says it ("Featured") and opens a
 * short menu of the four. A menu rather than four more chips: the order is
 * chosen once and then left, and the row it would need is better spent on
 * the list.
 */
export function SortChip({ value, onChange }: { value: ItemSort; onChange: (sort: ItemSort) => void }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const [open, setOpen] = useState(false);
  const current = t(SORT_LABEL[value]);
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={t('shop.sort.label', { sort: current })}
        style={({ pressed }) => [styles.chip, { flexDirection: dir.row, backgroundColor: colors.controlTrack, opacity: pressed ? 0.8 : 1 }]}
      >
        <Icon name="sort" size={16} color={colors.textPrimary} />
        <Text style={[styles.chipText, { color: colors.textPrimary }]} numberOfLines={1}>
          {current}
        </Text>
        <Icon name="chevron-down" size={12} color={colors.textSecondary} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.menuWrap}>
          {/* a sibling of the menu, not its parent: a pressable wrapping the options would read as one button */}
          <Pressable
            style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }]}
            onPress={() => setOpen(false)}
            accessibilityRole="button"
            accessibilityLabel={t('common.cancel')}
          />
          <View
            style={[styles.menu, { backgroundColor: colors.background }]}
            accessibilityViewIsModal
            onAccessibilityEscape={() => setOpen(false)}
          >
            <Text style={[styles.menuTitle, dir.text, { color: colors.textSecondary }]} accessibilityRole="header">
              {t('shop.sort.title')}
            </Text>
            <View accessibilityRole="radiogroup" accessibilityLabel={t('shop.sort.title')}>
              {ITEM_SORTS.map((s) => {
                const on = s === value;
                return (
                  <Pressable
                    key={s}
                    onPress={() => {
                      onChange(s);
                      setOpen(false);
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    aria-checked={on}
                    accessibilityLabel={t(SORT_LABEL[s])}
                    style={({ pressed }) => [styles.menuOption, { flexDirection: dir.row, opacity: pressed ? 0.6 : 1 }]}
                  >
                    <Text
                      style={[
                        styles.menuText,
                        dir.text,
                        { color: on ? colors.primary : colors.textPrimary, fontWeight: on ? typography.weights.semibold : typography.weights.regular },
                      ]}
                    >
                      {t(SORT_LABEL[s])}
                    </Text>
                    {on ? <Icon name="check" size={18} color={colors.primary} /> : null}
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

/** A search field: the glass, a magnifier, and a ✕ to empty it once there is something in it. */
export function SearchField({
  value,
  onChange,
  label,
  style,
}: {
  value: string;
  onChange: (next: string) => void;
  /** the placeholder, and what a screen reader calls the field */
  label: string;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const input = useRef<TextInput>(null);
  return (
    <View style={[styles.field, { flexDirection: dir.row, backgroundColor: colors.controlTrack }, style]}>
      <Icon name="search" size={18} color={colors.textSecondary} />
      <TextInput
        ref={input}
        value={value}
        onChangeText={onChange}
        placeholder={label}
        placeholderTextColor={colors.textSecondary}
        accessibilityLabel={label}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        maxLength={80}
        style={[styles.input, dir.text, { color: colors.textPrimary }]}
      />
      {value ? (
        <Pressable
          onPress={() => {
            // emptied, with the cursor left in it for the next search
            onChange('');
            input.current?.focus();
          }}
          accessibilityRole="button"
          accessibilityLabel={t('shop.search.clear')}
          style={({ pressed }) => [styles.clearSearch, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Icon name="clear-fill" size={18} color={colors.textSecondary} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** "27 items", said again when it changes, and "Clear filters" beside it while anything is narrowed. */
export function ResultsLine({ count, onClear }: { count: number; onClear?: () => void }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  return (
    <View style={[styles.results, { flexDirection: dir.row }]}>
      <Text style={[styles.resultsText, dir.text, { color: colors.textSecondary }]} accessibilityLiveRegion="polite">
        {itemsText(t, count)}
      </Text>
      {onClear ? (
        <Pressable
          onPress={onClear}
          accessibilityRole="button"
          accessibilityLabel={t('shop.filter.clear')}
          style={({ pressed }) => [styles.clearFilters, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Text style={[styles.clearText, { color: colors.primary }]}>{t('shop.filter.clear')}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** A section's heading: the kind, and how many there are of it. */
export function KindHeading({ kind, count, style }: { kind: ItemCategory; count: number; style?: StyleProp<ViewStyle> }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  return (
    <View
      style={[styles.heading, { flexDirection: dir.row }, style]}
      accessible
      accessibilityRole="header"
      accessibilityLabel={kindWithCount(t, kind, count)}
    >
      <Text style={[sectionLabel, { color: colors.textSecondary }]}>{t(KIND_LABEL[kind])}</Text>
      <Text style={[styles.headingCount, { color: colors.textSecondary }]}>{count}</Text>
    </View>
  );
}

/** The glyph an item without a picture of its own is drawn with. */
export const KIND_GLYPH: Record<ItemCategory, IconName> = {
  background: 'image',
  icon: 'star',
  frame: 'crown',
  tag: 'tag',
  other: 'star',
};

/**
 * An item's picture, shaped by its kind: a background as the 16:9 picture it
 * is, cropped to fill; an icon whole on a soft square (they are cut-outs, and
 * a circle would clip them); anything without art — the Kurdish tag — as its
 * kind's glyph on the same square, so a row never has a hole in it.
 */
export function ItemArt({
  category,
  path,
  width,
  style,
}: {
  category: string;
  /** the site path the API sends (`/cosmetics/…`); null when the item has no art */
  path: string | null | undefined;
  /** in points; left out, the art fills the width it is given (16:9 or square) */
  width?: number;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const { colors } = useTheme();
  const kind = itemCategory(category);
  const uri = assetUrl(path);
  const wide = kind === 'background';
  const box: ViewStyle =
    width === undefined
      ? { alignSelf: 'stretch', aspectRatio: wide ? 16 / 9 : 1 }
      : { width, height: wide ? Math.round((width * 9) / 16) : width };
  const glyph = width === undefined ? 28 : Math.round(Math.min(width, wide ? (width * 9) / 16 : width) * 0.45);
  return (
    <View
      style={[styles.art, wide ? styles.artWide : styles.artSquare, box, { backgroundColor: colors.controlTrack }, style]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={wide ? styles.fill : styles.inset}
          resizeMode={wide ? 'cover' : 'contain'}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <Icon name={KIND_GLYPH[kind]} size={glyph} color={colors.textSecondary} />
      )}
    </View>
  );
}

/** "Premium", on an item that is worn free while Premium is active. */
export function PremiumPill({ style }: { style?: StyleProp<ViewStyle> }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  return (
    <View style={[styles.pill, { flexDirection: dir.row, backgroundColor: colors.controlTrack }, style]}>
      <Icon name="crown" size={12} color={colors.gold} />
      <Text style={[styles.pillText, { color: colors.textSecondary }]} numberOfLines={1}>
        {t('profile.premium')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chipRow: { gap: spacing.sm, flexGrow: 1 },
  chip: {
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  chipText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  chipCount: { fontSize: typography.sizes.xs, fontWeight: typography.weights.medium, fontVariant: ['tabular-nums'] },
  chipCountOn: { opacity: 0.8 },
  box: { width: 16, height: 16, borderRadius: radii.xs, borderWidth: 1.5 },
  menuWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  menu: { width: '100%', maxWidth: 360, borderRadius: radii.lg, paddingVertical: spacing.sm, paddingHorizontal: spacing.lg },
  menuTitle: { ...sectionLabel, paddingTop: spacing.sm, paddingBottom: spacing.xs },
  menuOption: { alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, minHeight: 48 },
  menuText: { flex: 1, fontSize: typography.ios.row },
  field: { alignItems: 'center', gap: spacing.sm, minHeight: MIN_TOUCH_TARGET, borderRadius: radii.md, paddingHorizontal: spacing.md },
  input: { flex: 1, fontSize: typography.sizes.md, minHeight: MIN_TOUCH_TARGET, paddingVertical: 0 },
  clearSearch: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center', marginHorizontal: -spacing.sm },
  results: { alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, minHeight: MIN_TOUCH_TARGET },
  resultsText: { flexShrink: 1, fontSize: typography.sizes.sm, fontVariant: ['tabular-nums'] },
  clearFilters: { minHeight: MIN_TOUCH_TARGET, justifyContent: 'center', paddingHorizontal: spacing.xs },
  clearText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  heading: { alignItems: 'baseline', gap: spacing.sm },
  headingCount: { fontSize: typography.sizes.xs, fontWeight: typography.weights.medium, fontVariant: ['tabular-nums'] },
  art: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  artWide: { borderRadius: radii.sm },
  artSquare: { borderRadius: radii.md },
  fill: { width: '100%', height: '100%' },
  inset: { width: '86%', height: '86%' },
  pill: { alignItems: 'center', gap: 4, borderRadius: radii.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  pillText: { fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold },
});

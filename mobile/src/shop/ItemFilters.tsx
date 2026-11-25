import { useRef, useState, type ReactNode } from 'react';
import {
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Pressable, ReachReset } from '../theme/Pressable';
import { haptic } from '../feedback/haptics';
import { ITEM_SORTS, itemCategory, type ItemCategory, type ItemSort } from '@kurda/shared';
import { assetUrl } from '../api/env';
import { MIN_REACH, MIN_TOUCH_TARGET, reachRoom } from '../a11y/a11y';
import { useI18n } from '../i18n/I18nContext';
import { useDirection } from '../reports/direction';
import { Icon, type IconName } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { sectionLabel } from '../theme/fonts';
import { radii, spacing, typography } from '../theme/tokens';
import { KIND_LABEL, SORT_LABEL, itemsText, kindWithCount } from './format';
import { pressedDim } from '../theme/motion';

/**
 * The pieces the shop, the inventory and the gift picker share to find things: the search field (the app's
 * `theme/SearchField`), a row of kinds with counts, an order, a few switches, and one way of drawing an item. What is
 * searched, sorted and counted is @kurda/shared's (shop-items.ts), as in the browser.
 *
 * Chips rather than the segmented control: four kinds with counts do not fit across a phone in German or Dutch, so the
 * row scrolls, starting from the reading side.
 */

/** The most that can be typed into a search of items: longer than any item's name, short enough that a slip of the thumb is not searched for. */
export const SEARCH_MAX = 80;

/**
 * The room a row of chips leaves above and below itself inside the scroller: a chip answers a finger this far past its
 * edges, which the scroller would otherwise cut off.
 */
const CHIP_ROOM = reachRoom((MIN_REACH - MIN_TOUCH_TARGET) / 2);

/** A row of chips that scrolls sideways and starts on the reading side (right, in Soranî and Arabic). */
function ChipRow({ children, inset = 0 }: { children: ReactNode; inset?: number }): React.JSX.Element {
  const dir = useDirection();
  const scroller = useRef<ScrollView>(null);
  // The app mirrors these screens itself (reports/direction.ts): a row laid out from the right is scrolled to its right
  // end, where it starts, and kept there as counts change unless somebody scrolled it away.
  const mirrored = dir.row === 'row-reverse';
  const geometry = useRef({ content: 0, view: 0, x: 0 });
  return (
    <ScrollView
      ref={scroller}
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      style={CHIP_ROOM.scroller}
      // The row runs to the screen's edges and scrolls under them; `inset` lines its first chip up with the text above.
      contentContainerStyle={[styles.chipRow, CHIP_ROOM.content, { flexDirection: dir.row, paddingHorizontal: inset }]}
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
  /** How many there are; drawn beside the label. */
  count?: number;
  /** What a screen reader says, when the label and the count say it badly together. */
  a11y?: string;
}

/**
 * One kind at a time: "All 42 · Backgrounds 27 · Icons 14 · Tags 1". A filter is a choice of one (`radio`); where the
 * kinds are separate panels of different things (the inventory) they are tabs (`tab`).
 */
export function KindChips<K extends string>({
  options,
  value,
  onChange,
  label,
  role = 'radio',
  inset,
}: {
  options: readonly KindOption<K>[];
  value: K;
  onChange: (key: K) => void;
  /** What the choice is, for a screen reader. */
  label: string;
  role?: 'radio' | 'tab';
  /** The side padding of a row that runs edge to edge. */
  inset?: number;
}): React.JSX.Element {
  const { colors } = useTheme();
  const dir = useDirection();
  return (
    <View accessibilityRole={role === 'tab' ? 'tablist' : 'radiogroup'} accessibilityLabel={label}>
      <ChipRow inset={inset}>
        {options.map((o) => {
          const on = o.key === value;
          return (
            <Pressable
              key={o.key}
              onPress={() => onChange(o.key)}
              accessibilityRole={role}
              accessibilityState={role === 'tab' ? { selected: on } : { checked: on }}
              // React-native-web reads only the aria-* form.
              aria-checked={role === 'radio' ? on : undefined}
              aria-selected={role === 'tab' ? on : undefined}
              accessibilityLabel={o.a11y ?? o.label}
              style={({ pressed }) => [
                styles.chip,
                { flexDirection: dir.row, backgroundColor: on ? colors.primary : colors.controlTrack, opacity: pressed ? pressedDim : 1 },
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
        { flexDirection: dir.row, backgroundColor: value ? colors.primary : colors.controlTrack, opacity: pressed ? pressedDim : 1 },
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
 * The list's order as a chip that says it ("Featured") and opens a short menu of the four: chosen once and left, so not
 * worth a row of chips.
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
        style={({ pressed }) => [styles.chip, { flexDirection: dir.row, backgroundColor: colors.controlTrack, opacity: pressed ? pressedDim : 1 }]}
      >
        <Icon name="sort" size={16} color={colors.textPrimary} />
        <Text style={[styles.chipText, { color: colors.textPrimary }]} numberOfLines={1}>
          {current}
        </Text>
        <Icon name="chevron-down" size={12} color={colors.textSecondary} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        {/* The menu is drawn over the screen, not beside the chips, so their row's caps stay behind. */}
        <ReachReset>
          <View style={styles.menuWrap}>
            {/* A sibling of the menu, not its parent: a pressable wrapping the options would read as one button. */}
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
                        if (!on) haptic('select');
                        onChange(s);
                        setOpen(false);
                      }}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: on }}
                      aria-checked={on}
                      accessibilityLabel={t(SORT_LABEL[s])}
                      style={({ pressed }) => [styles.menuOption, { flexDirection: dir.row, opacity: pressed ? pressedDim : 1 }]}
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
        </ReachReset>
      </Modal>
    </>
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
          style={({ pressed }) => [styles.clearFilters, { opacity: pressed ? pressedDim : 1 }]}
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
const KIND_GLYPH: Record<ItemCategory, IconName> = {
  background: 'image',
  icon: 'star',
  frame: 'crown',
  tag: 'tag',
  sticker: 'gift',
  other: 'star',
};

/**
 * An item's picture, shaped by its kind: a background as its 16:9 picture, cropped; an icon whole on a soft square
 * (they are cut-outs a circle would clip); anything without art as its kind's glyph on the square, so a row never has a
 * hole. Any kind can have an admin-given picture, drawn whole on the square; one that fails to load falls back to the
 * glyph.
 */
export function ItemArt({
  category,
  path,
  width,
  style,
}: {
  category: string;
  /** The site path the API sends (`/cosmetics/…`); null when the item has no art. */
  path: string | null | undefined;
  /** In points; left out, the art fills the width it is given (16:9 or square). */
  width?: number;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const { colors } = useTheme();
  const kind = itemCategory(category);
  const [broken, setBroken] = useState<string | null>(null);
  const resolved = assetUrl(path);
  const uri = resolved !== broken ? resolved : null;
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
          onError={() => setBroken(uri)}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <Icon name={KIND_GLYPH[kind]} size={glyph} color={colors.textSecondary} />
      )}
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
  chipText: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  chipCount: { fontSize: typography.sizes.text, fontWeight: typography.weights.medium, fontVariant: ['tabular-nums'] },
  chipCountOn: { opacity: 0.8 },
  box: { width: 16, height: 16, borderRadius: radii.xs, borderWidth: 1.5 },
  menuWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  menu: { width: '100%', maxWidth: 360, borderRadius: radii.lg, paddingVertical: spacing.sm, paddingHorizontal: spacing.lg },
  menuTitle: { ...sectionLabel, paddingTop: spacing.sm, paddingBottom: spacing.xs },
  menuOption: { alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, minHeight: 48 },
  menuText: { flex: 1, fontSize: typography.sizes.text },
  results: { alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, minHeight: MIN_TOUCH_TARGET },
  resultsText: { flexShrink: 1, fontSize: typography.sizes.text, fontVariant: ['tabular-nums'] },
  clearFilters: { minHeight: MIN_TOUCH_TARGET, justifyContent: 'center', paddingHorizontal: spacing.xs },
  clearText: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  heading: { alignItems: 'baseline', gap: spacing.sm },
  headingCount: { fontSize: typography.sizes.text, fontWeight: typography.weights.medium, fontVariant: ['tabular-nums'] },
  art: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  artWide: { borderRadius: radii.sm },
  artSquare: { borderRadius: radii.md },
  fill: { width: '100%', height: '100%' },
  inset: { width: '86%', height: '86%' },
});

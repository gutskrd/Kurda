import { useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Pressable } from '../theme/Pressable';
import { LinearGradient } from 'expo-linear-gradient';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { haptic } from '../feedback/haptics';
import { GlassCard } from '../theme/glass';
import { Icon, type IconName } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { TABLE, TABLE_CLOTH } from './table';
import { pressedDim } from '../theme/motion';

/**
 * The parts Impostor's screens are built from, also used by Who Am I? and the invite sheet: the table's cloth, a glass
 * card, the one gold button, a numbered step's title, and choices drawn as pictures. A choice among pictures is a radio
 * group, as the segmented control is, and the chosen one is marked by a tick as well as by colour.
 */

// ───────────────────────────────────────────────────────────── the table

/** The table's cloth: night blue, lighter under the lamp. What is on it is laid out by `style`. */
export function Cloth({ style, children }: { style?: StyleProp<ViewStyle>; children: ReactNode }): React.JSX.Element {
  return (
    <LinearGradient colors={[...TABLE_CLOTH]} locations={[0, 0.55, 1]} style={[styles.cloth, style]}>
      {children}
    </LinearGradient>
  );
}

/** A glass card whose contents are laid out by `style`: the glass card's own style places the frame, not what is inside. */
export function Card({ style, children }: { style: StyleProp<ViewStyle>; children: ReactNode }): React.JSX.Element {
  return (
    <GlassCard>
      <View style={style}>{children}</View>
    </GlassCard>
  );
}

/** Names joined as a list the way the reader's language joins them, or with commas where the engine has no list format. */
export function listed(names: readonly string[], locale: string): string {
  try {
    const formats = Intl as unknown as { ListFormat?: new (locale: string, options: { type: 'conjunction' }) => { format(items: readonly string[]): string } };
    if (formats.ListFormat) return new formats.ListFormat(locale, { type: 'conjunction' }).format(names);
  } catch {
    // An older engine has no list format; the commas below are enough.
  }
  return names.join(', ');
}

/**
 * The one thing to press: gold, standing off the screen on its own edge and pressing down under the thumb. Nothing else
 * on a screen has this colour and weight.
 */
export function GoldButton({
  label,
  icon,
  onPress,
  busy = false,
  disabled = false,
  style,
  testID,
}: {
  label: string;
  icon?: IconName;
  onPress: () => void;
  testID?: string;
  /** Working on it: the press is disabled, and a screen reader is told. */
  busy?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const off = busy || disabled;
  return (
    <Pressable
      onPress={() => {
        haptic('tap');
        onPress();
      }}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: off, busy }}
      aria-disabled={off}
      testID={testID}
      style={[styles.goldEdge, { opacity: off ? 0.6 : 1 }, style]}
    >
      {({ pressed }) => (
        <View style={[styles.goldFace, pressed ? styles.goldDown : null]}>
          {icon ? <Icon name={icon} size={20} color={TABLE.goldInk} /> : null}
          <Text style={styles.goldText}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

/**
 * A step of a setup: its number on a disc of the page's ink, and what it asks. The setup is on the app's own cards, off
 * the table, where gold is kept for what is earned.
 */
export function StepTitle({ n, children }: { n: number; children: string }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={styles.step}>
      <View style={[styles.stepN, { backgroundColor: colors.textPrimary }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Text style={[styles.stepNText, { color: colors.background }]}>{n}</Text>
      </View>
      <Text accessibilityRole="header" style={[styles.stepText, { color: colors.textPrimary }]}>
        {children}
      </Text>
    </View>
  );
}

// ─────────────────────────────────────────────────── choices drawn as pictures

export interface PictureOption<T extends string> {
  value: T;
  label: string;
  /** A second, quieter line: what a way to play does, what a category's name means. */
  hint?: string;
  /** The picture, already drawn. */
  art: ReactNode;
  /** The picture's own colour, which tints the choice. */
  tone: string;
}

/** A colour at a part of its strength, for a tile's tint: `#rrggbb` with its alpha written after it. */
const wash = (hex: string, alpha: number): string => `${hex}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`;

function Tick({ on, small = false }: { on: boolean; small?: boolean }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={[small ? styles.tickSmall : styles.tick, { borderColor: on ? colors.textPrimary : colors.clayBorder, backgroundColor: on ? colors.textPrimary : 'transparent' }]}>
      {on ? <Icon name="check" size={small ? 11 : 14} color={colors.background} /> : null}
    </View>
  );
}

/** A few choices that each need a sentence (the ways to play): wide cards, one under another. */
export function PictureCards<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: ReadonlyArray<PictureOption<T>>;
  value: T;
  onChange: (next: T) => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.cards}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => {
              if (!on) haptic('select');
              onChange(o.value);
            }}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            aria-checked={on}
            accessibilityLabel={o.hint ? `${o.label}. ${o.hint}` : o.label}
            style={({ pressed }) => [styles.card, { backgroundColor: wash(o.tone, on ? 0.3 : 0.14), borderColor: on ? o.tone : 'transparent', opacity: pressed ? pressedDim : 1 }]}
          >
            <View style={[styles.cardArt, { backgroundColor: wash(o.tone, 0.22) }]}>{o.art}</View>
            <View style={styles.cardText}>
              <Text style={[styles.cardLabel, { color: colors.textPrimary }]}>{o.label}</Text>
              {o.hint ? <Text style={[styles.cardHint, { color: colors.textSecondary }]}>{o.hint}</Text> : null}
            </View>
            <Tick on={on} />
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Many choices known at a glance (the categories): small squares, three to a row. A long list shows its `first` choices
 * and a button for the rest, and never folds away the chosen one. `strip` lays them on one sideways-scrolling row,
 * where a sheet has no room for a grid.
 */
export function PictureTiles<T extends string>({
  label,
  options,
  value,
  onChange,
  first,
  moreLabel,
  strip = false,
}: {
  label: string;
  options: ReadonlyArray<PictureOption<T>>;
  value: T;
  onChange: (next: T) => void;
  first?: number;
  moreLabel?: (count: number) => string;
  strip?: boolean;
}): React.JSX.Element {
  const { colors } = useTheme();
  const [all, setAll] = useState(false);
  const folded = !strip && !all && first !== undefined && moreLabel !== undefined && options.length > first;
  const shown = folded ? options.filter((o, i) => i < first || o.value === value) : options;
  const tiles = shown.map((o) => {
    const on = o.value === value;
    return (
      <View key={o.value} style={strip ? styles.stripCell : styles.gridCell}>
        <Pressable
          onPress={() => {
            if (!on) haptic('select');
            onChange(o.value);
          }}
          accessibilityRole="radio"
          accessibilityState={{ checked: on }}
          aria-checked={on}
          accessibilityLabel={o.hint ? `${o.label} · ${o.hint}` : o.label}
          style={({ pressed }) => [styles.tile, { backgroundColor: wash(o.tone, on ? 0.32 : 0.14), borderColor: on ? o.tone : 'transparent', opacity: pressed ? pressedDim : 1 }]}
        >
          <View style={styles.tileTick}>{on ? <Tick on small /> : null}</View>
          {o.art}
          <Text style={[o.label.length > LONG ? styles.tileLabelLong : styles.tileLabel, { color: colors.textPrimary }]} numberOfLines={2}>
            {o.label}
          </Text>
          {o.hint ? (
            <Text style={[styles.tileHint, { color: colors.textSecondary }]} numberOfLines={1}>
              {o.hint}
            </Text>
          ) : null}
        </Pressable>
      </View>
    );
  });
  if (strip) {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.strip} contentContainerStyle={styles.stripRow}>
        {tiles}
      </ScrollView>
    );
  }
  return (
    <View>
      <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.grid}>
        {tiles}
      </View>
      {folded ? (
        <Pressable onPress={() => setAll(true)} accessibilityRole="button" style={({ pressed }) => [styles.more, { opacity: pressed ? pressedDim : 1 }]}>
          <Text style={[styles.moreText, { color: colors.textPrimary }]}>{moreLabel(options.length - shown.length)}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** A name longer than this is set a size smaller on a tile. */
const LONG = 9;

const styles = StyleSheet.create({
  cloth: { borderRadius: radii.xl, overflow: 'hidden' },
  goldEdge: { borderRadius: radii.pill, backgroundColor: TABLE.goldEdge, paddingBottom: 5 },
  goldFace: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    backgroundColor: TABLE.gold,
  },
  goldDown: { transform: [{ translateY: 3 }] },
  goldText: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold, color: TABLE.goldInk },
  step: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stepN: { width: 28, height: 28, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  stepNText: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold },
  stepText: { flex: 1, fontSize: typography.sizes.text, fontWeight: typography.weights.bold },
  tick: { width: 24, height: 24, borderRadius: radii.pill, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  tickSmall: { width: 18, height: 18, borderRadius: radii.pill, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  cards: { gap: spacing.sm },
  card: { minHeight: 84, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderWidth: 2, borderRadius: radii.lg },
  cardArt: { width: 64, height: 64, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
  cardText: { flex: 1, gap: 2 },
  cardLabel: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold },
  cardHint: { fontSize: typography.sizes.text, lineHeight: 20 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', margin: -4 },
  gridCell: { width: '33.333%', padding: 4 },
  strip: { flexGrow: 0, marginHorizontal: -layout.gutter },
  stripRow: { gap: spacing.sm, paddingHorizontal: layout.gutter },
  stripCell: { width: 104 },
  tile: { minHeight: 116, alignItems: 'center', gap: 4, paddingTop: 12, paddingBottom: spacing.sm, paddingHorizontal: 4, borderWidth: 2, borderRadius: radii.lg },
  tileTick: { position: 'absolute', top: 6, right: 6 },
  tileLabel: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold, textAlign: 'center' },
  tileLabelLong: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold, textAlign: 'center' },
  tileHint: { fontSize: typography.sizes.text, textAlign: 'center' },
  more: { alignSelf: 'center', minHeight: MIN_TOUCH_TARGET, justifyContent: 'center', paddingHorizontal: spacing.md, marginTop: spacing.xs },
  moreText: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
});

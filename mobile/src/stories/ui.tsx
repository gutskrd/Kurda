import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import {
  AccessibilityInfo,
  findNodeHandle,
  Platform,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Pressable, ReachGroup } from '../theme/Pressable';
import { haptic } from '../feedback/haptics';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { sectionLabel } from '../theme/fonts';
import { Icon, type IconName } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { BottomSheet, SheetScrollView } from '../theme/BottomSheet';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { GlassCard } from '../theme/glass';
import { useDirection } from '../reports/direction';
import type { StoryDialect } from '@kurda/shared';
import { storyTextProps, storyTextStyle } from './storyText';
import { pressedDim } from '../theme/motion';

/**
 * Small pieces the Stories and play screens share: a bottom sheet, a section label, a pill, and the two
 * accessibility helpers every game screen needs, announcing without moving focus and moving it to a new question.
 */

/** A story screen's maximum content width: about 65 characters a line on a tablet or the web, centred. */
export const COLUMN: ViewStyle = { width: '100%', maxWidth: 680, alignSelf: 'center' };

/**
 * A sheet from the bottom: the app's BottomSheet, with a body that scrolls when taller than the phone and a fixed
 * footer. A Modal rather than a positioned View, which would render under the tab bar and let taps through.
 */
export function Sheet({
  title,
  onClose,
  children,
  footer,
  dialect,
}: {
  /** Omitted when the content has its own heading (a badge's, under its picture). */
  title?: string;
  /** The title is a story's, read and set in the story's language. */
  dialect?: StoryDialect;
  onClose: () => void;
  children: ReactNode;
  /** Stays at the bottom while the content scrolls: the sheet's main action. */
  footer?: ReactNode;
}): React.JSX.Element {
  return (
    <BottomSheet
      visible
      onClose={onClose}
      title={title}
      titleLanguage={dialect ? { ...storyTextProps(dialect), style: storyTextStyle(dialect) } : undefined}
      contentStyle={styles.sheetContent}
    >
      <SheetScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {children}
      </SheetScrollView>
      {footer ? <View style={styles.sheetFooter}>{footer}</View> : null}
    </BottomSheet>
  );
}

/**
 * A GlassCard whose children are laid out by `style` (a gap, an alignment). GlassCard puts its style on the outer
 * frame, so a gap given to it never reaches the children; this adds the inner box.
 */
export function Card({
  children,
  style,
  padding,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  padding?: 'regular' | 'tight';
}): React.JSX.Element {
  return (
    <GlassCard padding={padding}>
      <View style={[styles.cardBody, style]}>{children}</View>
    </GlassCard>
  );
}

export function SectionLabel({ children }: { children: string }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <Text style={[sectionLabel, { color: colors.textSecondary }]} accessibilityRole="header">
      {children}
    </Text>
  );
}

/**
 * A short fact in a pill ("Short", "~3 min", "Done · 4/5"), its icon before the label in reading order. No gold: a
 * fact is not a prize.
 */
export function Pill({
  label,
  icon,
  tone = 'plain',
  accessibilityLabel,
}: {
  label: string;
  icon?: IconName;
  tone?: 'plain' | 'primary' | 'success';
  accessibilityLabel?: string;
}): React.JSX.Element {
  const { colors } = useTheme();
  const dir = useDirection();
  const fg = tone === 'primary' ? colors.primary : tone === 'success' ? colors.success : colors.textSecondary;
  const bg = tone === 'success' ? colors.successFill : colors.controlTrack;
  return (
    <View style={[styles.pill, { backgroundColor: bg, flexDirection: dir.row }]} accessible accessibilityLabel={accessibilityLabel ?? label}>
      {icon ? <Icon name={icon} size={13} color={fg} /> : null}
      <Text style={[styles.pillText, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/**
 * Choices that wrap onto more lines than a segmented control fits (the length filter): a labelled radio group of
 * fingertip-tall chips. The chosen one is solid ink, like the segmented control.
 */
export function ChoiceChips<T extends string>({
  label,
  options,
  value,
  onChange,
  labelOf,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  labelOf: (v: T) => string;
}): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {/* Chips wrap with the same gap between rows as between chips; each reaches half the gap every way. */}
      <ReachGroup gap={CHOICE_GAP} rowGap={CHOICE_GAP}>
        {options.map((opt) => {
          const on = opt === value;
          return (
            <Pressable
              key={opt}
              onPress={() => {
                if (!on) haptic('select');
                onChange(opt);
              }}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={labelOf(opt)}
              // Its width is unknown before layout, so `open` reaches past every edge and the group caps it to the gap.
              reach="open"
              style={({ pressed }) => [
                styles.chip,
                { backgroundColor: on ? colors.primary : colors.controlTrack, opacity: pressed ? pressedDim : 1 },
              ]}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn, { color: on ? colors.textOnPrimary : colors.textPrimary }]} numberOfLines={1}>
                {labelOf(opt)}
              </Text>
            </Pressable>
          );
        })}
      </ReachGroup>
    </View>
  );
}

/** A note in a soft box: a warning before reading from memory, an error. */
export function Note({
  children,
  tone = 'plain',
  icon,
  live = false,
  style,
}: {
  children: ReactNode;
  tone?: 'plain' | 'danger';
  icon?: IconName;
  /** Said to a screen reader as it appears, as for a change that was just put back. */
  live?: boolean;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const { colors } = useTheme();
  const fg = tone === 'danger' ? colors.danger : colors.textSecondary;
  return (
    <View
      style={[styles.note, { backgroundColor: tone === 'danger' ? colors.dangerFill : colors.controlTrack }, style]}
      {...(live ? { accessibilityRole: 'alert' as const, accessibilityLiveRegion: 'polite' as const } : null)}
    >
      {icon ? <Icon name={icon} size={16} color={fg} /> : null}
      <Text style={[styles.noteText, { color: tone === 'danger' ? colors.danger : colors.textPrimary }]}>{children}</Text>
    </View>
  );
}

/**
 * Announces to screen readers without moving focus (contract §A1: the verdict, "Answer locked", a new question).
 * iOS has an announcement call; Android and the web read a live region on change, so both are used. The region is
 * one transparent pixel.
 */
export function useAnnouncer(): { announce: (message: string) => void; region: React.JSX.Element } {
  const [message, setMessage] = useState('');
  const announce = useCallback((next: string) => {
    if (!next) return;
    if (Platform.OS === 'ios') {
      AccessibilityInfo.announceForAccessibility(next);
      return;
    }
    // The same sentence twice in a row must still be read twice.
    setMessage((prev) => (prev === next ? `${next} ` : next));
  }, []);
  const region = (
    <Text accessibilityLiveRegion="polite" style={styles.liveRegion} importantForAccessibility="yes">
      {message}
    </Text>
  );
  return { announce, region };
}

/**
 * Moves screen-reader focus to `ref` whenever `key` changes (the new question's title), so a blind player is not
 * left on the last question's options. Nothing else in a game moves focus.
 */
export function useFocusOn(ref: RefObject<View | Text | null>, key: string | number | null): void {
  const last = useRef<string | number | null>(null);
  useEffect(() => {
    if (key === null || key === last.current) return;
    last.current = key;
    const id = setTimeout(() => {
      const node = ref.current;
      if (!node) return;
      if (Platform.OS === 'web') {
        (node as unknown as { focus?: () => void }).focus?.();
        return;
      }
      const handle = findNodeHandle(node);
      if (handle) AccessibilityInfo.setAccessibilityFocus(handle);
    }, 150);
    return () => clearTimeout(id);
  }, [ref, key]);
}

/** The gap between choice chips, across and between rows. */
const CHOICE_GAP = spacing.sm;

const styles = StyleSheet.create({
  cardBody: { gap: spacing.sm },
  // The body and footer keep their own gutters, so the body scrolls edge to edge.
  sheetContent: { paddingHorizontal: 0, gap: 0 },
  sheetBody: { paddingHorizontal: layout.gutter, paddingBottom: spacing.md, gap: spacing.md },
  sheetFooter: { paddingHorizontal: layout.gutter, paddingTop: spacing.sm, gap: spacing.sm },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  pillText: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: CHOICE_GAP },
  chip: {
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  chipTextOn: { fontWeight: typography.weights.bold },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, borderRadius: radii.md, padding: spacing.md },
  noteText: { flex: 1, fontSize: typography.sizes.text, lineHeight: 20 },
  liveRegion: { position: 'absolute', width: 1, height: 1, overflow: 'hidden', opacity: 0.01 },
});

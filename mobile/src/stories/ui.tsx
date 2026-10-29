import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import {
  AccessibilityInfo,
  findNodeHandle,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { haptic } from '../feedback/haptics';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { sectionLabel } from '../theme/fonts';
import { Icon, type IconName } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { BottomSheet, SheetScrollView } from '../theme/BottomSheet';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { GlassCard } from '../theme/glass';
import type { StoryDialect } from '@kurda/shared';
import { storyTextProps, storyTextStyle } from './storyText';

/**
 * Small pieces the Stories and play screens share: a bottom sheet, a section
 * label, a pill, and the two accessibility helpers every game screen needs —
 * saying something to a screen reader without moving it, and moving it on
 * purpose to a new question.
 */

/**
 * How wide a story screen's content may grow. On a phone that is the screen;
 * on a tablet held sideways, or the app in a browser, a story set across the
 * whole width runs to lines of 150 letters, which nobody reads comfortably —
 * so the column stops at about 65 of them and sits in the middle.
 */
export const COLUMN: ViewStyle = { width: '100%', maxWidth: 680, alignSelf: 'center' };

/**
 * A sheet over the screen, from the bottom: the app's BottomSheet, with a
 * body that scrolls when it is taller than the phone and a footer that does
 * not.
 *
 * A Modal, not a positioned View: anything else inside the navigator renders
 * under the tab bar and lets taps through (ReportUserSheet says the same).
 */
export function Sheet({
  title,
  onClose,
  children,
  footer,
  dialect,
}: {
  title: string;
  /** the title is a story's (read and set in the story's language) */
  dialect?: StoryDialect;
  onClose: () => void;
  children: ReactNode;
  /** stays at the bottom while the content scrolls (the sheet's main action) */
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
 * A GlassCard whose children are laid out by `style` (a gap, an alignment).
 * GlassCard puts its own style on the outer frame, around the padding, so a
 * gap given to it never reaches the children; this adds the inner box.
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

/** A short fact in a pill: "Short", "~3 min", "Done · 4/5". */
export function Pill({
  label,
  icon,
  tone = 'plain',
  accessibilityLabel,
}: {
  label: string;
  icon?: IconName;
  tone?: 'plain' | 'primary' | 'gold' | 'success';
  accessibilityLabel?: string;
}): React.JSX.Element {
  const { colors } = useTheme();
  const fg = tone === 'primary' ? colors.primary : tone === 'gold' ? colors.gold : tone === 'success' ? colors.success : colors.textSecondary;
  const bg = tone === 'success' ? colors.successFill : colors.controlTrack;
  return (
    <View style={[styles.pill, { backgroundColor: bg }]} accessible accessibilityLabel={accessibilityLabel ?? label}>
      {icon ? <Icon name={icon} size={13} color={fg} /> : null}
      <Text style={[styles.pillText, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/**
 * One of a few choices that wrap onto more lines than a segmented control
 * fits: the length filter, with minutes on each. A radio group under its
 * label, each chip a fingertip tall.
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
            style={({ pressed }) => [
              styles.chip,
              { backgroundColor: on ? colors.primary : colors.controlTrack, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <Text style={[styles.chipText, { color: on ? colors.textOnPrimary : colors.textPrimary }]} numberOfLines={1}>
              {labelOf(opt)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A note in a soft box: a warning before reading from memory, an error. */
export function Note({
  children,
  tone = 'plain',
  icon,
  style,
}: {
  children: ReactNode;
  tone?: 'plain' | 'danger';
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const { colors } = useTheme();
  const fg = tone === 'danger' ? colors.danger : colors.textSecondary;
  return (
    <View style={[styles.note, { backgroundColor: tone === 'danger' ? colors.dangerFill : colors.controlTrack }, style]}>
      {icon ? <Icon name={icon} size={16} color={fg} /> : null}
      <Text style={[styles.noteText, { color: tone === 'danger' ? colors.danger : colors.textPrimary }]}>{children}</Text>
    </View>
  );
}

/**
 * Say something to a screen reader without moving it (contract §A1: the
 * verdict, "Answer locked", a new question). iOS has an announcement call;
 * Android and the web read a live region when its text changes, so both are
 * done — the region is one pixel and transparent, a screen reader's alone.
 */
export function useAnnouncer(): { announce: (message: string) => void; region: React.JSX.Element } {
  const [message, setMessage] = useState('');
  const announce = useCallback((next: string) => {
    if (!next) return;
    if (Platform.OS === 'ios') {
      AccessibilityInfo.announceForAccessibility(next);
      return;
    }
    // the same sentence twice in a row still has to be read twice
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
 * Move the screen reader to `ref` whenever `key` changes — the new question's
 * title, so a blind player is not left on the last question's options. Only
 * on purpose and only then: nothing else in a game moves focus.
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

const styles = StyleSheet.create({
  cardBody: { gap: spacing.sm },
  // the body and the footer keep their own gutters, so the body scrolls edge to edge
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
  pillText: { fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, borderRadius: radii.md, padding: spacing.md },
  noteText: { flex: 1, fontSize: typography.sizes.sm, lineHeight: 20 },
  liveRegion: { position: 'absolute', width: 1, height: 1, overflow: 'hidden', opacity: 0.01 },
});

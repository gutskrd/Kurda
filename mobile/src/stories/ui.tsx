import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import {
  AccessibilityInfo,
  findNodeHandle,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { display, sectionLabel } from '../theme/fonts';
import { Icon, type IconName } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { useI18n } from '../i18n/I18nContext';
import { GlassCard } from '../theme/glass';

/**
 * Small pieces the Stories and play screens share: a bottom sheet, a section
 * label, a pill, and the two accessibility helpers every game screen needs —
 * saying something to a screen reader without moving it, and moving it on
 * purpose to a new question.
 */

/**
 * A sheet over the screen, from the bottom.
 *
 * A Modal, not a positioned View: anything else inside the navigator renders
 * under the tab bar and lets taps through (ReportUserSheet says the same).
 * The backdrop closes it, and so does the ✕, which is the first thing a
 * screen reader finds; the content scrolls when it is taller than the phone.
 */
export function Sheet({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** stays at the bottom while the content scrolls (the sheet's main action) */
  footer?: ReactNode;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdropWrap}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('stories.close')}
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
        >
          <View style={[StyleSheet.absoluteFill, styles.backdrop]} />
        </Pressable>
        <View
          style={[styles.sheet, { backgroundColor: colors.background, paddingBottom: spacing.lg + insets.bottom }]}
          accessibilityViewIsModal
        >
          <View style={styles.sheetHead}>
            <Text style={[styles.sheetTitle, { color: colors.textPrimary }]} accessibilityRole="header" numberOfLines={2}>
              {title}
            </Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={t('stories.close')}
              style={[styles.close, { backgroundColor: colors.controlTrack }]}
            >
              <Icon name="close" size={18} color={colors.textSecondary} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
          {footer ? <View style={styles.sheetFooter}>{footer}</View> : null}
        </View>
      </View>
    </Modal>
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
            onPress={() => onChange(opt)}
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
  backdropWrap: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    maxHeight: '90%',
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    paddingTop: spacing.md,
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  sheetTitle: { ...display(typography.sizes.lg), flex: 1 },
  close: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetBody: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: spacing.md },
  sheetFooter: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.sm },
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

import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { Avatar } from '../profile/Avatar';
import { useDirection } from '../reports/direction';
import { springTo, timing } from '../theme/animate';
import { display } from '../theme/fonts';
import { Icon, type IconName } from '../theme/Icon';
import { duration } from '../theme/motion';
import { DrawnCheck } from '../theme/MotionParts';
import { Pressable } from '../theme/Pressable';
import { useTheme } from '../theme/ThemeProvider';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { nameOf, type PersonRef } from './api';

/** The pieces the parental pages share: a person's row, the page's opening, and the moment two accounts connect. */

/**
 * A parent or teen in a list: their face, their name and a line under it; a button when there is somewhere to go, or
 * one action of its own (`action`) under the line, never both, so the line is never cut short to make room for it.
 */
export function PersonRow({
  person,
  detail,
  onPress,
  action,
  testID,
}: {
  person: PersonRef;
  detail?: string;
  onPress?: () => void;
  action?: ReactNode;
  testID?: string;
}): React.JSX.Element {
  const { colors } = useTheme();
  const dir = useDirection();
  const name = nameOf(person);
  const body = (
    <View style={[styles.person, { flexDirection: dir.row }]}>
      <Avatar name={name} photoUrl={person.avatarUrl} size={44} />
      <View style={styles.words}>
        <Text style={[styles.name, dir.text, { color: colors.textPrimary }]} numberOfLines={1}>
          {name}
        </Text>
        {detail ? (
          <Text style={[styles.detail, dir.text, { color: colors.textSecondary }]} numberOfLines={2}>
            {detail}
          </Text>
        ) : null}
        {!onPress && action ? <View style={[styles.action, { alignSelf: dir.row === 'row-reverse' ? 'flex-end' : 'flex-start' }]}>{action}</View> : null}
      </View>
      {onPress ? <Icon name="chevron-right" size={18} color={colors.textSecondary} style={dir.flip ?? undefined} /> : null}
    </View>
  );
  if (!onPress) return testID ? <View testID={testID}>{body}</View> : body;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[name, detail].filter(Boolean).join(', ')}
      testID={testID}
      style={({ pressed }) => pressed && { backgroundColor: colors.controlTrack }}
    >
      {body}
    </Pressable>
  );
}

/** A page's opening when there is nothing yet to list: the glyph in a soft circle, a title, a paragraph and the way on. */
export function Hero({ icon = 'parental', title, body, children }: { icon?: IconName; title: string; body: string; children?: ReactNode }): React.JSX.Element {
  const { colors } = useTheme();
  const dir = useDirection();
  return (
    <View style={styles.hero}>
      <View style={[styles.glyph, { backgroundColor: colors.controlTrack }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Icon name={icon} size={40} color={colors.textPrimary} />
      </View>
      <Text style={[styles.heroTitle, styles.center, { color: colors.textPrimary }]} accessibilityRole="header">
        {title}
      </Text>
      <Text style={[styles.heroBody, dir.text, styles.center, { color: colors.textSecondary }]}>{body}</Text>
      {children ? <View style={styles.heroActions}>{children}</View> : null}
    </View>
  );
}

/** How long the connected moment stays before the page moves on. */
export const SUCCESS_MS = 1500;
const SUCCESS_REDUCED_MS = 900;

/**
 * Two accounts just connected: a check drawing itself in a soft circle that grows in, and a line saying who, over the
 * page, then `onDone`. Under Reduce Motion it only fades, and moves on sooner.
 */
export function SuccessMoment({ text, onDone }: { text: string; onDone: () => void }): React.JSX.Element {
  const { colors } = useTheme();
  const reduce = useReducedMotion();
  const p = useRef(new Animated.Value(0)).current;
  const latest = useRef(onDone);
  latest.current = onDone;
  useEffect(() => {
    const run = reduce ? timing(p, 1, duration.base) : springTo(p, 1, 'release');
    run.start();
    const done = setTimeout(() => latest.current(), reduce ? SUCCESS_REDUCED_MS : SUCCESS_MS);
    return () => {
      run.stop();
      clearTimeout(done);
    };
  }, [p, reduce]);
  const scale = reduce ? 1 : p.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] });
  const opacity = p.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 1, 1], extrapolate: 'clamp' });
  return (
    <Animated.View style={[styles.moment, { backgroundColor: colors.background, opacity }]} accessibilityLiveRegion="assertive" testID="parental-success">
      <Animated.View style={[styles.momentCircle, { backgroundColor: colors.successFill, transform: [{ scale }] }]}>
        <DrawnCheck size={44} color={colors.success} delayMs={120} />
      </Animated.View>
      <Text style={[styles.momentText, styles.center, { color: colors.textPrimary }]} accessibilityRole="alert">
        {text}
      </Text>
    </Animated.View>
  );
}

/** A thin bar of how much of something is used, in the ink, on the quiet track. */
export function ThinBar({ share }: { share: number }): React.JSX.Element {
  const { colors } = useTheme();
  const dir = useDirection();
  const reduce = useReducedMotion();
  const p = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  useEffect(() => {
    if (!reduce) timing(p, 1, duration.progress).start();
  }, [p, reduce]);
  const clamped = Math.max(0, Math.min(1, share));
  return (
    <View
      style={[styles.track, { backgroundColor: colors.controlTrack, flexDirection: dir.row }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {/* Grows from the side reading starts on. */}
      <Animated.View
        style={[
          styles.fill,
          {
            width: `${clamped * 100}%`,
            backgroundColor: colors.primary,
            transform: [{ scaleX: p }],
            transformOrigin: dir.row === 'row-reverse' ? 'right center' : 'left center',
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  person: { alignItems: 'center', gap: spacing.sm + 4, minHeight: 64, paddingHorizontal: spacing.sm + 4, paddingVertical: spacing.sm },
  words: { flex: 1, gap: 2 },
  name: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  detail: { fontSize: typography.sizes.text, lineHeight: 20 },
  action: { marginTop: spacing.sm },
  hero: { alignItems: 'center', gap: spacing.md, paddingHorizontal: layout.gutter + spacing.sm, paddingTop: spacing.lg, paddingBottom: spacing.sm },
  glyph: { width: 88, height: 88, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  heroTitle: { ...display(typography.sizes.title) },
  heroBody: { fontSize: typography.sizes.text, lineHeight: 23 },
  heroActions: { alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.sm },
  center: { textAlign: 'center' },
  moment: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', gap: spacing.lg, padding: layout.gutter },
  momentCircle: { width: 104, height: 104, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  momentText: { ...display(typography.sizes.title) },
  track: { height: 6, borderRadius: radii.pill, overflow: 'hidden' },
  fill: { height: 6, borderRadius: radii.pill },
});

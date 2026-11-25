import { useEffect, useRef, useState, type Ref } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, Text, View, findNodeHandle, type LayoutChangeEvent } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Pressable } from '../theme/Pressable';
import { TOPIC_STARS, lessonStates, lessonXpRange, starPath, type PathStop, type PathUnit } from '@kurda/shared';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { useMotionAlive } from '../a11y/useMotionAlive';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { formatNumber } from '../i18n/format';
import { useI18n } from '../i18n/I18nContext';
import type { Locale } from '../i18n/translations';
import { useDirection } from '../reports/direction';
import { useEnter } from '../theme/animate';
import { display } from '../theme/fonts';
import { ClayButton } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { duration, pressedDim } from '../theme/motion';
import { heldRow } from '../theme/MotionParts';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { RING, STAR, type ToneColors } from './path';
import type { SkillNode } from './types';

type Stop = PathStop<SkillNode>;
type Unit = PathUnit<SkillNode>;

/**
 * The card a tapped stop opens, under it with an arrow up to it, as on the website. A topic to play now is the road's
 * main button: the card in its main colour, its name, which lesson is next, and one light button that says what the lesson
 * pays, which a glint crosses now and then. Any other stop's card is a plain panel: what it is, its progress and one
 * action, or what opens it; a skill there lists its lessons.
 *
 * A chapter's story says what opens it while shut; once open, it opens the reader and offers the chapter's review
 * (`onPractise`), as a unit's chest does where there is no story.
 */
export interface StopActions {
  onLesson: (lessonId: string) => void;
  onReview: () => void;
  /** A review is waiting part-way through, so the review stop's button carries it on. */
  reviewOpen?: boolean;
  /** Opens the chapter's review in practice. */
  onPractise: (unitId: string) => void;
  onTips: (skill: SkillNode) => void;
  onStory: (slug: string) => void;
}

/** The card's widest, as on the website; the arrow's size, and how close it may come to the card's corners. */
const CARD_MAX = 340;
const ARROW = 16;
const ARROW_INSET = 22;

export function StopCard({
  stop,
  unit,
  tone,
  top,
  left,
  width,
  pointAt,
  onSize,
  actions,
}: {
  stop: Stop;
  unit: Unit;
  tone: ToneColors;
  /** Where the card's top edge sits, and the left and width of the row it is centred in. */
  top: number;
  left: number;
  width: number;
  /** The stop's centre across that row, where the arrow points. */
  pointAt: number;
  /** Its height once laid out, so the page can scroll it into view. */
  onSize?: (height: number) => void;
  actions: StopActions;
}): React.JSX.Element {
  const { colors } = useTheme();
  const reduce = useReducedMotion();
  // It drops in from its stop, as the website's does; under Reduce Motion it is simply there.
  const enter = useEnter(!reduce, 0, duration.base);
  const title = useRef<Text>(null);
  useFocusOnOpen(title);
  const cardWidth = Math.min(CARD_MAX, width);
  const cardLeft = left + (width - cardWidth) / 2;
  const arrowLeft = Math.max(ARROW_INSET, Math.min(cardWidth - ARROW_INSET - ARROW, pointAt - (cardLeft - left) - ARROW / 2));
  const go = goesNow(stop);
  const face = go ? colors.accent : colors.surfaceRaised;
  const edge = go ? 'transparent' : colors.separator;
  return (
    <Animated.View
      style={[
        styles.place,
        { top, left: cardLeft, width: cardWidth },
        { opacity: enter, transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [-4, 0] }) }] },
      ]}
      onLayout={(e: LayoutChangeEvent) => onSize?.(e.nativeEvent.layout.height)}
      testID={go ? 'lp-card-go' : 'lp-card'}
    >
      <View style={[styles.card, { backgroundColor: face, borderColor: edge, shadowColor: colors.softShadow }]}>
        {go ? (
          <GoCard stop={go} titleRef={title} actions={actions} />
        ) : (
          <PanelCard stop={stop} unit={unit} tone={tone} titleRef={title} actions={actions} />
        )}
      </View>
      {/* After the card, so it lies over the card's top edge. */}
      <View style={[styles.arrow, { left: arrowLeft, backgroundColor: face, borderColor: edge }]} />
    </Animated.View>
  );
}

/** A skill whose card offers a lesson to play now, and so is the road's main button, in its main colour; else null. */
function goesNow(stop: Stop): Extract<Stop, { kind: 'skill' }> | null {
  return stop.kind === 'skill' && stop.state !== 'locked' && stop.launch ? stop : null;
}

/** Moves a screen reader to the card's title as it opens, so the card is read without hunting for it. */
function useFocusOnOpen(ref: React.RefObject<Text | null>): void {
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const id = setTimeout(() => {
      const handle = ref.current ? findNodeHandle(ref.current) : null;
      if (handle) AccessibilityInfo.setAccessibilityFocus(handle);
    }, 150);
    return () => clearTimeout(id);
  }, [ref]);
}

/** The one thing a skill's card offers, or null for a locked skill or one with nothing to play yet. */
function actionOf(stop: Extract<Stop, { kind: 'skill' }>, t: ReturnType<typeof useI18n>['t'], actions: StopActions): { label: string; go: () => void } | null {
  const launch = stop.launch;
  if (stop.state === 'locked' || !launch) return null;
  if (stop.finish === 'refresh') return { label: t('coursemap.path.refreshGo'), go: actions.onReview };
  return {
    label: stop.state === 'done' ? t('coursemap.path.again') : stop.lessonsDone > 0 ? t('learn.continue.button') : t('coursemap.path.start'),
    go: () => actions.onLesson(launch),
  };
}

/** What the lesson pays, from the server's own numbers (shared xp.ts); a finished skill reopens its first lesson, which pays the replay share. */
function xpOf(stop: Extract<Stop, { kind: 'skill' }>, t: ReturnType<typeof useI18n>['t'], locale: Locale): string | null {
  if (stop.state === 'locked' || !stop.launch || stop.finish === 'refresh') return null;
  const again = stop.state === 'done';
  const xp = lessonXpRange(again);
  return t(again ? 'coursemap.xp.again' : 'coursemap.xp.first', { min: formatNumber(xp.min, locale), max: formatNumber(xp.max, locale) });
}

/** A topic to play now: its name, which lesson or round is next, its stars, and the one button. */
function GoCard({ stop, titleRef, actions }: { stop: Extract<Stop, { kind: 'skill' }>; titleRef: Ref<Text>; actions: StopActions }): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const { skill } = stop;
  const lessons = skill.lessons ?? [];
  const at = lessons.findIndex((l) => l.lessonId === stop.launch);
  const action = actionOf(stop, t, actions);
  const ink = colors.textOnPrimary;
  // A finished topic is played again in rounds, so it says which round; any other says which lesson is next.
  const where =
    stop.state === 'done' && stop.rounds > 0
      ? stop.rounds >= TOPIC_STARS
        ? t('coursemap.path.roundsDone', { last: TOPIC_STARS })
        : t('coursemap.path.round', { round: stop.rounds + 1, last: TOPIC_STARS, done: stop.pieces, total: stop.lessonsTotal })
      : at >= 0
        ? t('coursemap.path.lessonOf', { n: formatNumber(at + 1, locale), total: formatNumber(lessons.length, locale) })
        : null;
  return (
    <>
      <Text ref={titleRef} style={[styles.goTitle, dir.text, { color: ink }]} accessibilityRole="header">
        {skill.title}
      </Text>
      {where ? <Text style={[styles.goLine, dir.text, { color: ink }]}>{where}</Text> : null}
      {stop.rounds > 0 ? <Stars rounds={stop.rounds} /> : null}
      {action ? <StartButton label={action.label} xp={xpOf(stop, t, locale)} onPress={action.go} /> : null}
      {skill.hasGrammar ? <Tips skill={skill} colour={ink} onTips={actions.onTips} /> : null}
    </>
  );
}

/**
 * The card's one light button: the lesson's word and what it pays, raised on a lip it sinks into when pressed. A glint
 * crosses it now and then while the road is alive; under Reduce Motion it holds still.
 */
function StartButton({ label, xp, onPress }: { label: string; xp: string | null; onPress: () => void }): React.JSX.Element {
  const { colors, scheme } = useTheme();
  const live = useMotionAlive();
  // The main colour by day; by night it is pale, so the night's dark ink is written on it instead.
  const words = scheme === 'dark' ? colors.textOnPrimary : colors.accent;
  const [width, setWidth] = useState(0);
  const glint = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!live || width === 0) return;
    const run = Animated.loop(
      Animated.sequence([
        Animated.delay(GLINT.restMs),
        Animated.timing(glint, { toValue: 1, duration: GLINT.crossMs, easing: Easing.inOut(Easing.quad), useNativeDriver: true, isInteraction: false }),
        Animated.timing(glint, { toValue: 0, duration: 0, useNativeDriver: true, isInteraction: false }),
      ]),
    );
    run.start();
    return () => {
      run.stop();
      glint.setValue(0);
    };
  }, [live, width, glint]);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={xp ? `${label}, ${xp}` : label}
      testID="lp-card-start"
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      // The label and what the lesson pays stack, so the longest pair fits a narrow phone.
      style={({ pressed }) => [styles.start, pressed ? styles.startPressed : null, xp ? styles.startStacked : { flexDirection: 'row' }]}
    >
      {live && width > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.glint,
            { width: width * 0.22, backgroundColor: `${colors.accent}38` },
            // Seen only while it crosses, so it never rests at the button's edge.
            { opacity: glint.interpolate({ inputRange: [0, 0.04, 0.96, 1], outputRange: [0, 1, 1, 0] }) },
            { transform: [{ translateX: glint.interpolate({ inputRange: [0, 1], outputRange: [-width * 0.3, width * 1.1] }) }, { skewX: '-20deg' }] },
          ]}
        />
      ) : null}
      <Text style={[styles.startText, { color: words }]}>{label}</Text>
      {xp ? <Text style={[styles.startText, styles.startXp, { color: words }]}>{xp}</Text> : null}
    </Pressable>
  );
}

/** The glint's pause between crossings and its crossing, close to the website's 2.8 s round. */
const GLINT = { restMs: 1500, crossMs: 1300 } as const;

function Tips({ skill, colour, onTips }: { skill: SkillNode; colour: string; onTips: (skill: SkillNode) => void }): React.JSX.Element {
  const { t } = useI18n();
  const dir = useDirection();
  return (
    <Pressable
      onPress={() => onTips(skill)}
      accessibilityRole="button"
      accessibilityLabel={t('coursemap.path.tipsFor', { skill: skill.title })}
      style={({ pressed }) => [styles.tips, { flexDirection: dir.row, opacity: pressed ? pressedDim : 1 }]}
    >
      <Icon name="book" size={18} color={colour} />
      <Text style={[styles.tipsText, { color: colour }]}>{t('grammar.title')}</Text>
    </Pressable>
  );
}

/** Any other stop: what it is, its progress, and one action, or what opens it. */
function PanelCard({
  stop,
  unit,
  tone,
  titleRef,
  actions,
}: {
  stop: Stop;
  unit: Unit;
  tone: ToneColors;
  titleRef: Ref<Text>;
  actions: StopActions;
}): React.JSX.Element | null {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const { onLesson, onReview, onPractise, onTips, onStory } = actions;
  const eyebrow = (words: string) => <Text style={[styles.eyebrow, dir.text, { color: tone.text }]}>{words}</Text>;
  const title = (words: string) => (
    <Text ref={titleRef} style={[styles.title, dir.text, { color: colors.textPrimary }]} accessibilityRole="header">
      {words}
    </Text>
  );
  const line = (words: string) => <Text style={[styles.line, dir.text, { color: colors.textSecondary }]}>{words}</Text>;
  const unitName = `${t('coursemap.path.unit', { n: unit.number })} · ${unit.title}`;

  if (stop.kind === 'review') {
    return (
      <>
        {eyebrow(t('learn.tools.review'))}
        {title(t('coursemap.path.reviewDue', { count: stop.due }))}
        {line(t('coursemap.path.reviewWhy'))}
        <ClayButton
          label={actions.reviewOpen ? t('practice.open.continue') : t('coursemap.path.reviewGo')}
          tone="primary"
          size="large"
          onPress={onReview}
          style={styles.action}
        />
      </>
    );
  }

  // "Chapter complete", in gold as something won.
  const complete = (
    <View style={[styles.won, { flexDirection: dir.row, alignSelf: dir.rtl ? 'flex-end' : 'flex-start', backgroundColor: colors.gold }]} testID="lp-chapter-complete">
      <Icon name="check" size={14} color={colors.textOnGold} />
      <Text style={[styles.wonText, { color: colors.textOnGold }]}>{t('coursemap.path.trophyDone')}</Text>
    </View>
  );
  const practise = (
    <ClayButton label={t('coursemap.path.practiseChapter')} variant="outline" size="large" onPress={() => onPractise(unit.unitId)} style={styles.action} />
  );

  if (stop.kind === 'trophy') {
    return (
      <>
        {eyebrow(t('coursemap.path.unit', { n: unit.number }))}
        {title(stop.earned ? t('coursemap.path.trophyDone') : t('coursemap.path.trophyTitle'))}
        {line(stop.earned ? t('coursemap.path.trophyDoneWhy', { unit: unit.title }) : t('coursemap.path.trophyHow', { unit: unit.title }))}
        {stop.earned ? practise : null}
      </>
    );
  }

  if (stop.kind === 'story') {
    return (
      <>
        {eyebrow(t('coursemap.path.unit', { n: unit.number }))}
        {stop.open ? complete : null}
        {title(t('coursemap.path.storyTitle'))}
        <Text style={[styles.tale, dir.text, { color: colors.textPrimary }]}>{stop.title}</Text>
        {line(stop.open ? t('coursemap.path.storyOpen') : t('coursemap.path.storyShut'))}
        {stop.open ? null : (
          <Text style={[styles.small, dir.text, { color: colors.textSecondary }]}>{t('coursemap.path.unitDone', { done: unit.done, total: unit.total })}</Text>
        )}
        {stop.open ? <ClayButton label={t('coursemap.path.storyRead')} tone="primary" size="large" onPress={() => onStory(stop.slug)} style={styles.action} /> : null}
        {stop.open ? practise : null}
      </>
    );
  }

  const { skill } = stop;
  const lessons = skill.lessons ?? [];
  const states = lessonStates(skill);
  // Progress through the current round, or through all lessons before the first star.
  const share = stop.lessonsTotal > 0 ? (stop.rounds > 0 ? stop.pieces / stop.lessonsTotal : stop.lessonsDone / stop.lessonsTotal) : 0;
  const action = actionOf(stop, t, actions);
  const xp = xpOf(stop, t, locale);

  return (
    <>
      {eyebrow(unitName)}
      {title(skill.title)}
      {lessons.length > 0 ? (
        <View style={styles.lessons}>
          {lessons.map((lesson, i) => {
            const state = states[i]!;
            const word = t(state === 'done' ? 'coursemap.path.lesson.done' : state === 'next' ? 'coursemap.path.lesson.next' : 'coursemap.path.lesson.locked');
            const mark =
              state === 'done' ? (
                <View style={[styles.mark, { backgroundColor: tone.fill }]}>
                  <Icon name="check" size={14} color={tone.ink} />
                </View>
              ) : state === 'next' ? (
                <View style={[styles.mark, styles.markNext, { borderColor: tone.fill }]}>
                  <Text style={[styles.markText, { color: tone.text }]}>{i + 1}</Text>
                </View>
              ) : (
                <View style={[styles.mark, { backgroundColor: colors.controlTrack }]}>
                  <Icon name="lock" size={13} color={colors.textSecondary} />
                </View>
              );
            const row = (
              <>
                {mark}
                <Text style={[styles.lessonTitle, dir.text, { color: state === 'locked' ? colors.textSecondary : colors.textPrimary }]} numberOfLines={2}>
                  {lesson.title}
                </Text>
              </>
            );
            return state === 'locked' ? (
              <View key={lesson.lessonId} style={[styles.lessonRow, { flexDirection: dir.row }]} accessible accessibilityLabel={`${lesson.title}, ${word}`}>
                {row}
              </View>
            ) : (
              <Pressable
                key={lesson.lessonId}
                onPress={() => onLesson(lesson.lessonId)}
                accessibilityRole="button"
                accessibilityLabel={`${lesson.title}, ${word}`}
                style={({ pressed }) => [styles.lessonRow, { flexDirection: dir.row }, pressed && heldRow(colors.controlTrack)]}
              >
                {row}
              </Pressable>
            );
          })}
        </View>
      ) : null}
      {stop.lessonsTotal > 0 && stop.state !== 'locked' ? (
        <View style={styles.progress}>
          {stop.rounds > 0 ? <Stars rounds={stop.rounds} /> : null}
          {stop.rounds < TOPIC_STARS ? (
            // Progress, not a reward, so the ink like the ring's pieces.
            <View style={[styles.bar, { backgroundColor: colors.controlTrack }]}>
              <View style={[styles.barFill, { width: `${Math.round(share * 100)}%`, backgroundColor: colors.primary }, dir.rtl && styles.barEnd]} />
            </View>
          ) : null}
          <Text style={[styles.small, dir.text, { color: colors.textSecondary }]}>
            {stop.rounds >= TOPIC_STARS
              ? t('coursemap.path.roundsDone', { last: TOPIC_STARS })
              : stop.rounds > 0
                ? t('coursemap.path.round', { round: stop.rounds + 1, last: TOPIC_STARS, done: stop.pieces, total: stop.lessonsTotal })
                : t('coursemap.path.lessonsDone', { done: stop.lessonsDone, total: stop.lessonsTotal })}
          </Text>
        </View>
      ) : null}
      {stop.state === 'done' && stop.rounds > 0 ? line(t(stop.rounds < TOPIC_STARS ? 'coursemap.path.roundsWhy' : 'coursemap.path.roundsAll')) : null}
      {stop.state === 'done' ? line(stop.finish === 'refresh' ? t('coursemap.path.refreshWhy') : t('coursemap.strength', { percent: skill.strength })) : null}
      {stop.state === 'locked' ? line(stop.after ? t('coursemap.path.lockedAfter', { title: stop.after.title }) : t('coursemap.lockedBadge')) : null}
      {stop.state !== 'locked' && !stop.launch ? line(t('coursemap.path.notYet')) : null}
      {xp ? (
        <View style={[styles.xp, { flexDirection: dir.row, alignSelf: dir.rtl ? 'flex-end' : 'flex-start', backgroundColor: colors.controlTrack }]} testID="lp-stop-xp">
          <Icon name="bolt" size={14} color={colors.goldText} />
          <Text style={[styles.xpText, { color: colors.textPrimary }]}>{xp}</Text>
        </View>
      ) : null}
      {action ? <ClayButton label={action.label} tone="primary" size="large" onPress={action.go} style={styles.action} /> : null}
      {skill.hasGrammar ? <Tips skill={skill} colour={colors.textPrimary} onTips={onTips} /> : null}
    </>
  );
}

/** A topic's three stars: gold for each round played, the rest the ring's track. Hidden from screen readers, as the line below says it. */
function Stars({ rounds }: { rounds: number }): React.JSX.Element {
  const { colors, scheme } = useTheme();
  const dir = useDirection();
  return (
    <View style={[styles.stars, { flexDirection: dir.row }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID={`lp-card-stars-${rounds}`}>
      {Array.from({ length: TOPIC_STARS }, (_, i) => (
        <Svg key={i} width={STAR_SIZE} height={STAR_SIZE} viewBox="0 0 24 24">
          <Path
            d={starPath(12, 12.6, 10.6)}
            fill={i < rounds ? colors.gold : RING[scheme].track}
            stroke={i < rounds ? STAR.edge : RING[scheme].edge}
            strokeWidth={1.4}
            strokeLinejoin="round"
          />
        </Svg>
      ))}
    </View>
  );
}

const STAR_SIZE = 26;

const styles = StyleSheet.create({
  // Over the road and the closing layer under it; Android orders raised views by elevation, so both carry it.
  place: { position: 'absolute', zIndex: 11, elevation: 8 },
  card: {
    gap: spacing.sm + 4,
    padding: spacing.lg,
    borderWidth: 1,
    borderRadius: radii.xl,
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  arrow: {
    position: 'absolute',
    top: -ARROW / 2,
    width: ARROW,
    height: ARROW,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    transform: [{ rotate: '45deg' }],
    elevation: 8,
  },
  goTitle: { ...display(typography.sizes.text) },
  goLine: { fontSize: typography.sizes.text, opacity: 0.85 },
  // White on a lip, as the website's; the lip is the shadow it sinks into.
  start: {
    position: 'relative',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 50,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderBottomWidth: 4,
    borderBottomColor: 'rgba(0,0,0,0.18)',
    backgroundColor: '#FFFFFF',
  },
  startPressed: { marginTop: spacing.xs + 3, borderBottomWidth: 1 },
  startText: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold, textTransform: 'uppercase', letterSpacing: 0.6 },
  startStacked: { flexDirection: 'column', gap: 0, paddingVertical: spacing.sm },
  startXp: { fontVariant: ['tabular-nums'], fontWeight: typography.weights.semibold, textTransform: 'none', letterSpacing: 0, opacity: 0.8, textAlign: 'center' },
  glint: { position: 'absolute', top: -8, bottom: -8, left: 0 },
  eyebrow: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  title: { ...display(typography.sizes.text) },
  line: { fontSize: typography.sizes.text, lineHeight: 21 },
  // The tale's Kurdish title, under "Hamo's story".
  tale: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold, fontStyle: 'italic' },
  small: { fontSize: typography.sizes.text },
  lessons: { gap: 2 },
  lessonRow: { alignItems: 'center', gap: spacing.sm + 4, minHeight: MIN_TOUCH_TARGET },
  lessonTitle: { flex: 1, fontSize: typography.sizes.text },
  mark: { width: 26, height: 26, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  markNext: { borderWidth: 2 },
  markText: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold },
  progress: { gap: 6 },
  bar: { height: 8, borderRadius: radii.pill, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: radii.pill },
  barEnd: { alignSelf: 'flex-end' },
  action: { marginTop: spacing.xs },
  stars: { gap: 4 },
  won: { alignItems: 'center', gap: 4, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radii.pill },
  wonText: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold },
  xp: { alignItems: 'center', gap: 4, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radii.pill },
  xpText: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold, fontVariant: ['tabular-nums'] },
  tips: { alignSelf: 'center', alignItems: 'center', gap: spacing.xs + 2, minHeight: MIN_TOUCH_TARGET, paddingHorizontal: spacing.md },
  tipsText: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
});

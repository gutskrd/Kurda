import { useEffect, useMemo, useRef, useState, type Ref } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, Text, View, findNodeHandle, type LayoutChangeEvent } from 'react-native';
import { Pressable } from '../theme/Pressable';
import { SvgXml } from 'react-native-svg';
import { TOPIC_STARS, lessonStates, lessonXpRange, pathWaxSvg, type PathStop, type PathUnit } from '@kurda/shared';
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
import { type ToneColors } from './path';
import { AppleRow } from './TopicBar';
import type { SkillNode } from './types';

type Stop = PathStop<SkillNode>;
type Unit = PathUnit<SkillNode>;

/**
 * The card a tapped stop opens, under it with an arrow up to it, as on the website. A topic to play now is the road's
 * main button: the card in its unit's colour on its lip, its name, which lesson is next, and one button on the page's
 * own ground that says what the lesson pays, which a glint crosses now and then. Any other stop's card is a plain panel: what it is, its progress and one
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
  // Every card on the page's own panel; one that offers a lesson to play has its edge touched with its chapter's colour.
  const face = colors.surfaceRaised;
  const edge = go ? `${tone.fill}59` : colors.separator;
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
          <GoCard stop={go} unit={unit} tone={tone} titleRef={title} actions={actions} />
        ) : (
          <PanelCard stop={stop} unit={unit} tone={tone} titleRef={title} actions={actions} />
        )}
      </View>
      {/* After the card, so it lies over the card's top edge. */}
      <View style={[styles.arrow, { left: arrowLeft, backgroundColor: face, borderColor: edge }]} />
    </Animated.View>
  );
}

/** A skill whose card offers a lesson to play now, its one button in its unit's colour; else null. */
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

/** A topic to play now: its chapter, its name, which lesson or round is next, its apples, and the one button. */
function GoCard({
  stop,
  unit,
  tone,
  titleRef,
  actions,
}: {
  stop: Extract<Stop, { kind: 'skill' }>;
  unit: Unit;
  tone: ToneColors;
  titleRef: Ref<Text>;
  actions: StopActions;
}): React.JSX.Element {
  const { t, locale } = useI18n();
  const dir = useDirection();
  const { skill } = stop;
  const lessons = skill.lessons ?? [];
  const at = lessons.findIndex((l) => l.lessonId === stop.launch);
  const { colors } = useTheme();
  const action = actionOf(stop, t, actions);
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
      <Text style={[styles.eyebrow, dir.text, { color: tone.text }]}>{`${t('coursemap.path.unit', { n: unit.number })} · ${unit.title}`}</Text>
      <Text ref={titleRef} style={[styles.goTitle, dir.text, { color: colors.textPrimary }]} accessibilityRole="header">
        {skill.title}
      </Text>
      {where ? <Text style={[styles.goLine, dir.text, { color: colors.textSecondary }]}>{where}</Text> : null}
      {stop.rounds > 0 ? <Apples rounds={stop.rounds} /> : null}
      {stop.state === 'done' ? <WaxLegend /> : null}
      {action ? <StartButton label={action.label} xp={xpOf(stop, t, locale)} tone={tone} onPress={action.go} /> : null}
      {skill.hasGrammar ? <Tips skill={skill} colour={colors.textPrimary} onTips={actions.onTips} /> : null}
    </>
  );
}

/**
 * The card's one button: the lesson's word and what it pays, in the unit's ink on its colour, raised on a lip of the
 * unit's colour it sinks into when pressed. A glint crosses it now and then while the road is alive; under
 * Reduce Motion it holds still.
 */
function StartButton({ label, xp, tone, onPress }: { label: string; xp: string | null; tone: ToneColors; onPress: () => void }): React.JSX.Element {
  const live = useMotionAlive();
  const words = tone.ink;
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
      style={({ pressed }) => [
        styles.start,
        { backgroundColor: tone.fill, borderBottomColor: tone.lip },
        pressed ? styles.startPressed : null,
        xp ? styles.startStacked : { flexDirection: 'row' },
      ]}
    >
      {live && width > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.glint,
            { width: width * 0.22, backgroundColor: 'rgba(255, 255, 255, 0.3)' },
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

/** What a topic's seal becomes: an apple pressed in for each full round, and gold with all three. Decorative. */
function WaxLegend(): React.JSX.Element {
  const { scheme } = useTheme();
  const dir = useDirection();
  const tiles = useMemo(() => [1, 2, 3].map((apples) => pathWaxSvg({ seed: 'legend', apples, gold: apples === 3, dark: scheme === 'dark', size: WAX_KEY })), [scheme]);
  return (
    <View style={[styles.waxLegend, { flexDirection: dir.row }]} aria-hidden testID="lp-wax-legend">
      {tiles.map((svg, i) => (
        <View key={i} style={styles.waxIcon}>
          <View style={styles.waxDrawing}>
            <SvgXml xml={svg} width={WAX_KEY} height={WAX_KEY} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** A seal's drawing in the legend: its 112-point canvas at this size, the seal itself about 26 points across. */
const WAX_KEY = 40;

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
  // Progress through the current round, or through all lessons before the first apple.
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
          {stop.rounds > 0 ? <Apples rounds={stop.rounds} /> : null}
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
      {stop.state === 'done' ? <WaxLegend /> : null}
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

/** A topic's three apples, gold for each round played. Hidden from screen readers, as the line below says it. */
function Apples({ rounds }: { rounds: number }): React.JSX.Element {
  return (
    <View style={styles.apples} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <AppleRow rounds={rounds} />
    </View>
  );
}

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
  goLine: { fontSize: typography.sizes.text },
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
    borderRadius: radii.md + 2,
    borderBottomWidth: 4,
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
  waxLegend: { gap: spacing.sm },
  // Only the seal and its shadow show, from the middle of its drawing.
  waxIcon: { width: 30, height: 31, overflow: 'hidden' },
  waxDrawing: { position: 'absolute', left: -6, top: -8 },
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
  apples: { gap: 4 },
  won: { alignItems: 'center', gap: 4, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radii.pill },
  wonText: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold },
  xp: { alignItems: 'center', gap: 4, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radii.pill },
  xpText: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold, fontVariant: ['tabular-nums'] },
  tips: { alignSelf: 'center', alignItems: 'center', gap: spacing.xs + 2, minHeight: MIN_TOUCH_TARGET, paddingHorizontal: spacing.md },
  tipsText: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
});

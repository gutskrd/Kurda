import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Pressable } from '../theme/Pressable';
import { TOPIC_STARS, lessonStates, lessonXpRange, starPath, type PathStop, type PathUnit } from '@kurda/shared';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { useI18n } from '../i18n/I18nContext';
import { useDirection } from '../reports/direction';
import { BottomSheet, SheetScrollView } from '../theme/BottomSheet';
import { display } from '../theme/fonts';
import { ClayButton } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { RING, STAR, type ToneColors } from './path';
import type { SkillNode } from './types';
import { pressedDim } from '../theme/motion';
import { heldRow } from '../theme/MotionParts';

type Stop = PathStop<SkillNode>;
type Unit = PathUnit<SkillNode>;

/**
 * The sheet a path stop opens: what the stop is, its progress, and one action ("Start", "Continue", "Practise
 * again"), or for a locked stop what opens it. A skill lists its lessons, each replayable once open, its stars and
 * current round, and the XP its next lesson pays (shared `lessonXpRange`).
 *
 * A chapter's story says what opens it while shut; once open, it opens the reader and offers the chapter's review
 * (`onPractise`), as a unit's chest does where there is no story.
 */
export function StopSheet({
  open,
  tone,
  onClose,
  onLesson,
  onReview,
  onPractise,
  onTips,
  onStory,
}: {
  open: { stop: Stop; unit: Unit } | null;
  tone: ToneColors | null;
  onClose: () => void;
  onLesson: (lessonId: string) => void;
  onReview: () => void;
  /** Opens the chapter's review in practice. */
  onPractise: (unitId: string) => void;
  onTips: (skill: SkillNode) => void;
  onStory: (slug: string) => void;
}): React.JSX.Element {
  return (
    // No header title: the stop's own name heads the card.
    <BottomSheet visible={open !== null} onClose={onClose} contentStyle={styles.scroller}>
      {open && tone ? (
        <SheetScrollView contentContainerStyle={styles.body}>
          <Card stop={open.stop} unit={open.unit} tone={tone} onLesson={onLesson} onReview={onReview} onPractise={onPractise} onTips={onTips} onStory={onStory} />
        </SheetScrollView>
      ) : null}
    </BottomSheet>
  );
}

function Card({
  stop,
  unit,
  tone,
  onLesson,
  onReview,
  onPractise,
  onTips,
  onStory,
}: {
  stop: Stop;
  unit: Unit;
  tone: ToneColors;
  onLesson: (lessonId: string) => void;
  onReview: () => void;
  onPractise: (unitId: string) => void;
  onTips: (skill: SkillNode) => void;
  onStory: (slug: string) => void;
}): React.JSX.Element | null {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const eyebrow = (words: string) => <Text style={[styles.eyebrow, dir.text, { color: tone.text }]}>{words}</Text>;
  const title = (words: string) => (
    <Text style={[styles.title, dir.text, { color: colors.textPrimary }]} accessibilityRole="header">
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
        <ClayButton label={t('coursemap.path.reviewGo')} tone="primary" size="large" onPress={onReview} style={styles.action} />
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
  const launch = stop.launch;
  const action =
    stop.state === 'locked' || !launch
      ? null
      : stop.finish === 'refresh'
        ? { label: t('coursemap.path.refreshGo'), go: onReview }
        : {
            label: stop.state === 'done' ? t('coursemap.path.again') : stop.lessonsDone > 0 ? t('learn.continue.button') : t('coursemap.path.start'),
            go: () => onLesson(launch),
          };
  // A finished skill reopens its first lesson, which pays the replay share.
  const xp = action && stop.finish !== 'refresh' ? lessonXpRange(stop.state === 'done') : null;

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
            // Progress, not a reward, so the app's violet like the ring's pieces.
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
      {stop.state !== 'locked' && !launch ? line(t('coursemap.path.notYet')) : null}
      {xp ? (
        <View style={[styles.xp, { flexDirection: dir.row, alignSelf: dir.rtl ? 'flex-end' : 'flex-start', backgroundColor: colors.controlTrack }]} testID="lp-stop-xp">
          <Icon name="bolt" size={14} color={colors.goldText} />
          <Text style={[styles.xpText, { color: colors.textPrimary }]}>
            {t(stop.state === 'done' ? 'coursemap.xp.again' : 'coursemap.xp.first', { min: xp.min, max: xp.max })}
          </Text>
        </View>
      ) : null}
      {action ? <ClayButton label={action.label} tone="primary" size="large" onPress={action.go} style={styles.action} /> : null}
      {skill.hasGrammar ? (
        <Pressable
          onPress={() => onTips(skill)}
          accessibilityRole="button"
          accessibilityLabel={t('coursemap.path.tipsFor', { skill: skill.title })}
          style={({ pressed }) => [styles.tips, { flexDirection: dir.row, opacity: pressed ? pressedDim : 1 }]}
        >
          <Icon name="book" size={18} color={colors.textPrimary} />
          <Text style={[styles.tipsText, { color: colors.textPrimary }]}>{t('grammar.title')}</Text>
        </Pressable>
      ) : null}
    </>
  );
}

/** A topic's three stars: gold for each round played, the rest the ring's track. Hidden from screen readers, as the line below says it. */
function Stars({ rounds }: { rounds: number }): React.JSX.Element {
  const { colors, scheme } = useTheme();
  const dir = useDirection();
  return (
    <View style={[styles.stars, { flexDirection: dir.row }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID={`lp-sheet-stars-${rounds}`}>
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
  // The scroll view keeps no gutter so the card scrolls edge to edge.
  scroller: { paddingHorizontal: 0 },
  body: { paddingHorizontal: layout.gutter, paddingBottom: spacing.sm, gap: spacing.sm + 4 },
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

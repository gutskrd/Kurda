import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { lessonStates, type PathStop, type PathUnit } from '@kurda/shared';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { useI18n } from '../i18n/I18nContext';
import { useDirection } from '../reports/direction';
import { SHEET_MAX_WIDTH } from '../reports/sheet';
import { display } from '../theme/fonts';
import { ClayButton } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import type { ToneColors } from './path';
import type { SkillNode } from './types';

type Stop = PathStop<SkillNode>;
type Unit = PathUnit<SkillNode>;

/**
 * What a stop on the path opens: a sheet from the foot of the screen with what
 * the stop is, how far along it is, and one thing to do — "Start",
 * "Continue", "Practise again", or for one still closed a kind line saying
 * what opens it.
 *
 * A skill's lessons are listed too, each one a way in once it is open, so a
 * finished lesson can be played again on its own.
 */
export function StopSheet({
  open,
  tone,
  onClose,
  onLesson,
  onReview,
  onTips,
}: {
  open: { stop: Stop; unit: Unit } | null;
  tone: ToneColors | null;
  onClose: () => void;
  onLesson: (lessonId: string) => void;
  onReview: () => void;
  onTips: (skill: SkillNode) => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  return (
    <Modal visible={open !== null} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.flex}>
        <Pressable
          style={[styles.backdrop, { backgroundColor: colors.scrim }]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
        />
        <View style={[styles.sheet, { backgroundColor: colors.surfaceRaised }]} accessibilityViewIsModal>
          <View style={[styles.grabber, { backgroundColor: colors.separator }]} />
          {open && tone ? (
            <ScrollView contentContainerStyle={styles.body} bounces={false}>
              <Card stop={open.stop} unit={open.unit} tone={tone} onLesson={onLesson} onReview={onReview} onTips={onTips} />
            </ScrollView>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function Card({
  stop,
  unit,
  tone,
  onLesson,
  onReview,
  onTips,
}: {
  stop: Stop;
  unit: Unit;
  tone: ToneColors;
  onLesson: (lessonId: string) => void;
  onReview: () => void;
  onTips: (skill: SkillNode) => void;
}): React.JSX.Element {
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

  if (stop.kind === 'trophy') {
    return (
      <>
        {eyebrow(t('coursemap.path.unit', { n: unit.number }))}
        {title(stop.earned ? t('coursemap.path.trophyDone') : t('coursemap.path.trophyTitle'))}
        {line(stop.earned ? t('coursemap.path.trophyDoneWhy', { unit: unit.title }) : t('coursemap.path.trophyHow', { unit: unit.title }))}
        {stop.earned ? <ClayButton label={t('coursemap.path.practise')} variant="outline" size="large" onPress={onReview} style={styles.action} /> : null}
      </>
    );
  }

  const { skill } = stop;
  const lessons = skill.lessons ?? [];
  const states = lessonStates(skill);
  const share = stop.lessonsTotal > 0 ? stop.lessonsDone / stop.lessonsTotal : 0;
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
                style={({ pressed }) => [styles.lessonRow, { flexDirection: dir.row, opacity: pressed ? 0.7 : 1 }]}
              >
                {row}
              </Pressable>
            );
          })}
        </View>
      ) : null}
      {stop.lessonsTotal > 0 && stop.state !== 'locked' ? (
        <View style={styles.progress}>
          <View style={[styles.bar, { backgroundColor: colors.controlTrack }]}>
            <View style={[styles.barFill, { width: `${Math.round(share * 100)}%`, backgroundColor: tone.fill }, dir.rtl && styles.barEnd]} />
          </View>
          <Text style={[styles.small, dir.text, { color: colors.textSecondary }]}>
            {t('coursemap.path.lessonsDone', { done: stop.lessonsDone, total: stop.lessonsTotal })}
          </Text>
        </View>
      ) : null}
      {stop.state === 'done' ? line(stop.finish === 'refresh' ? t('coursemap.path.refreshWhy') : t('coursemap.strength', { percent: skill.strength })) : null}
      {stop.state === 'locked' ? line(stop.after ? t('coursemap.path.lockedAfter', { title: stop.after.title }) : t('coursemap.lockedBadge')) : null}
      {stop.state !== 'locked' && !launch ? line(t('coursemap.path.notYet')) : null}
      {action ? <ClayButton label={action.label} tone="primary" size="large" onPress={action.go} style={styles.action} /> : null}
      {skill.hasGrammar ? (
        <Pressable
          onPress={() => onTips(skill)}
          accessibilityRole="button"
          accessibilityLabel={t('coursemap.path.tipsFor', { skill: skill.title })}
          style={({ pressed }) => [styles.tips, { flexDirection: dir.row, opacity: pressed ? 0.7 : 1 }]}
        >
          <Icon name="book" size={18} color={colors.textPrimary} />
          <Text style={[styles.tipsText, { color: colors.textPrimary }]}>{t('grammar.title')}</Text>
        </Pressable>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  sheet: {
    width: '100%',
    maxWidth: SHEET_MAX_WIDTH,
    alignSelf: 'center',
    maxHeight: '86%',
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
  },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: radii.pill, marginBottom: spacing.sm },
  body: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.sm + 4 },
  eyebrow: { fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold },
  title: { ...display(typography.sizes.lg) },
  line: { fontSize: typography.sizes.sm, lineHeight: 21 },
  small: { fontSize: typography.sizes.xs },
  lessons: { gap: 2 },
  lessonRow: { alignItems: 'center', gap: spacing.sm + 4, minHeight: MIN_TOUCH_TARGET },
  lessonTitle: { flex: 1, fontSize: typography.sizes.md },
  mark: { width: 26, height: 26, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  markNext: { borderWidth: 2 },
  markText: { fontSize: typography.sizes.xs, fontWeight: typography.weights.bold },
  progress: { gap: 6 },
  bar: { height: 8, borderRadius: radii.pill, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: radii.pill },
  barEnd: { alignSelf: 'flex-end' },
  action: { marginTop: spacing.xs },
  tips: { alignSelf: 'center', alignItems: 'center', gap: spacing.xs + 2, minHeight: MIN_TOUCH_TARGET, paddingHorizontal: spacing.md },
  tipsText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
});

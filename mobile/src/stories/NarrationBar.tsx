import { useRef } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';
import { PressableScale } from '../theme/MotionParts';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { haptic } from '../feedback/haptics';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { useI18n } from '../i18n/I18nContext';
import { clockText, trackAt, trackLength, type NarrationItem, type NarrationState, type Narrator } from './narration';
import { nextRate, type NarrationRate } from './prefs';
import { useNarrationPosition } from './useNarration';

/** How far a screen reader's step along the line moves the sound. */
export const SEEK_STEP_MS = 10_000;

/**
 * The point on the track a tap on the line names: how far along the line the
 * finger is, as a share of the whole story, kept within it. Read from where
 * the tap is on the screen and where the line is, never from the touched
 * view's own coordinates: a tap on the knob would measure from the knob, and
 * the browser build has lost the line by the time the press ends.
 */
export function lineTime(pageX: number, lineLeft: number, lineWidth: number, total: number): number | null {
  if (!Number.isFinite(pageX) || lineWidth <= 0 || total <= 0) return null;
  const share = Math.max(0, Math.min(1, (pageX - lineLeft) / lineWidth));
  return share * total;
}

/** What the speed chip says: the number as spoken of a speed, with the times sign. */
export function rateLabel(rate: NarrationRate): string {
  return `${rate}×`;
}

/**
 * The player (design notes §4): one bar in ink at the foot of the reader, for
 * a story with recordings. A seek line over the whole story as one stitched
 * track, with the time elapsed and the total; the sentence before and after;
 * play and pause, which carries on from inside the sentence it paused in
 * (or stopped in, when a paragraph's Listen or leaving the text cut it
 * short), with a quiet spinner while the sound is awaited; a speed chip that cycles
 * 0.75× → 1× → 1.25×; the name of the character reading the sentence, when
 * the recording has one; "n of m sentences recorded" when not every sentence
 * is; and, when a recording would not play, one line that says so while the
 * text stays readable. The sentence being read is lit up in the text, and a
 * tap on it says it again.
 */
export function NarrationBar({
  narrator,
  state,
  items,
  rate,
  onRate,
  speaker = null,
  recorded = null,
}: {
  narrator: Narrator;
  state: NarrationState;
  /** the whole story's queue, in reading order, with each sentence's place on the track */
  items: readonly NarrationItem[];
  rate: NarrationRate;
  onRate: (rate: NarrationRate) => void;
  /** who reads the sentence being read, when the recording has a character */
  speaker?: string | null;
  /** how many of the story's sentences have a recording, when not all of them do */
  recorded?: { recorded: number; total: number } | null;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const mine = state.scope === 'story';
  const playing = mine && state.playing;
  const total = trackLength(items);
  const position = useNarrationPosition(narrator, state);
  // stopped part-way, the line stays where the story will go on from
  const resumeAt = mine ? null : narrator.resumeMs;
  const elapsed = Math.min(mine ? position : (resumeAt ?? 0), total);
  // where the line is on the screen, measured when it is laid out and again as a finger lands on it
  const line = useRef<View>(null);
  const lineBox = useRef({ left: 0, width: 0 });
  const measureLine = (): void => {
    line.current?.measureInWindow((left, _top, width) => {
      lineBox.current = { left, width };
    });
  };
  // In the light the bar is the app's ink. In the dark that ink is white, and a white panel at
  // the foot of a dark page pulls the eye off the text, so there it is the raised surface with
  // its edge drawn, and the controls are drawn in the text's colour.
  const dark = colors.scheme === 'dark';
  const ink = dark ? colors.surfaceRaised : colors.primary;
  const onInk = dark ? colors.textPrimary : colors.textOnPrimary;

  /** Pause or carry on; a story stopped part-way goes on from inside the sentence it stopped in. */
  const toggle = (): void => {
    if (mine) narrator.toggle();
    else if (resumeAt !== null && resumeAt > 0 && resumeAt < total) seekTo(resumeAt);
    else narrator.play(items, 'story');
  };

  /** To a point on the track: into the story that is playing, or the start of one that is not yet. */
  const seekTo = (ms: number): void => {
    const target = Math.max(0, Math.min(total, ms));
    if (!mine) narrator.play(items, 'story', Math.max(0, trackAt(items, target).index));
    narrator.seek(target);
  };

  const onLinePress = (e: GestureResponderEvent): void => {
    const at = lineTime(e.nativeEvent.pageX, lineBox.current.left, lineBox.current.width, total);
    if (at !== null) seekTo(at);
  };

  const step = (icon: 'skip-back' | 'skip-forward', label: string, onPress: () => void, disabled: boolean) => (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={[styles.round, { opacity: disabled ? 0.35 : 1 }]}
    >
      <Icon name={icon} size={20} color={onInk} />
    </Pressable>
  );

  const times = t('stories.player.elapsed', { elapsed: clockText(elapsed), total: clockText(total) });

  return (
    <View style={[styles.bar, { backgroundColor: ink }, dark && { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder }]}>
      <Pressable
        ref={line}
        onPress={onLinePress}
        onPressIn={measureLine}
        onLayout={measureLine}
        accessibilityRole="adjustable"
        accessibilityLabel={t('stories.player.seek')}
        // the aria form, which both the phone's screen readers and the browser build read (as the age ruler's)
        aria-valuemin={0}
        aria-valuemax={Math.round(total)}
        aria-valuenow={Math.round(elapsed)}
        aria-valuetext={times}
        accessibilityActions={[
          { name: 'increment', label: t('stories.player.forward') },
          { name: 'decrement', label: t('stories.player.back') },
        ]}
        onAccessibilityAction={(e) => seekTo(elapsed + (e.nativeEvent.actionName === 'increment' ? SEEK_STEP_MS : -SEEK_STEP_MS))}
        style={styles.line}
      >
        <View pointerEvents="none" style={[styles.track, { backgroundColor: onInk }]} />
        <View pointerEvents="none" style={[styles.fill, { backgroundColor: colors.gold, width: total > 0 ? `${(elapsed / total) * 100}%` : '0%' }]} />
        <View pointerEvents="none" style={[styles.knob, { backgroundColor: colors.gold, left: total > 0 ? `${(elapsed / total) * 100}%` : '0%' }]} />
      </Pressable>
      <View style={styles.times}>
        <Text style={[styles.time, { color: onInk }]}>{clockText(elapsed)}</Text>
        <Text style={[styles.position, { color: onInk }]} numberOfLines={1}>
          {mine ? t('stories.reader.sentenceOf', { index: state.index + 1, total: state.total }) : t('stories.reader.wholeStory')}
        </Text>
        <Text style={[styles.time, { color: onInk }]}>{clockText(total)}</Text>
      </View>
      <View style={styles.controls}>
        {step('skip-back', t('stories.reader.previousSentence'), () => narrator.previous(), !mine || state.index === 0)}
        <PressableScale
          onPress={toggle}
          accessibilityRole="button"
          accessibilityLabel={playing ? t('stories.reader.pause') : t('stories.reader.listenWhole')}
          accessibilityState={{ busy: mine && state.buffering }}
          style={[styles.play, { backgroundColor: onInk }]}
        >
          {mine && state.buffering && playing ? (
            <ActivityIndicator color={ink} accessibilityLabel={t('stories.player.buffering')} />
          ) : (
            <Icon name={playing ? 'audio-pause' : 'audio-play'} size={22} color={ink} />
          )}
        </PressableScale>
        {step('skip-forward', t('stories.reader.nextSentence'), () => narrator.next(), !mine || state.index >= state.total - 1)}
        <View style={styles.side}>
          {speaker ? (
            <Text style={[styles.speaker, { color: onInk }]} numberOfLines={1}>
              {t('stories.player.narrator', { name: speaker })}
            </Text>
          ) : null}
        </View>
        <PressableScale
          onPress={() => {
            haptic('select');
            onRate(nextRate(rate));
          }}
          accessibilityRole="button"
          accessibilityLabel={t('stories.player.speed', { rate })}
          style={[styles.rate, { borderColor: onInk }]}
        >
          <Text style={[styles.rateText, { color: onInk }]}>{rateLabel(rate)}</Text>
        </PressableScale>
      </View>
      {mine && state.error ? (
        <Text style={[styles.note, { color: onInk }]} accessibilityLiveRegion="polite">
          {t('stories.player.error')}
        </Text>
      ) : recorded && recorded.recorded < recorded.total ? (
        <Text style={[styles.note, { color: onInk }]}>{t('stories.player.recorded', { recorded: recorded.recorded, total: recorded.total })}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { borderRadius: radii.lg, paddingHorizontal: spacing.md, paddingTop: spacing.xs, paddingBottom: spacing.sm, gap: 2 },
  // the line is four points tall and a fingertip's height to touch
  line: { height: MIN_TOUCH_TARGET - 12, justifyContent: 'center', position: 'relative' },
  track: { height: 4, borderRadius: radii.pill, opacity: 0.3 },
  fill: { position: 'absolute', left: 0, height: 4, borderRadius: radii.pill },
  knob: { position: 'absolute', width: 12, height: 12, borderRadius: radii.pill, marginLeft: -6 },
  times: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  time: { fontSize: typography.sizes.xs, fontVariant: ['tabular-nums'], opacity: 0.85 },
  position: { flex: 1, fontSize: typography.sizes.xs, textAlign: 'center', opacity: 0.85 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  round: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  play: { width: 48, height: 48, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  side: { flex: 1, minHeight: MIN_TOUCH_TARGET, justifyContent: 'center', paddingHorizontal: spacing.xs },
  speaker: { fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold },
  rate: { minWidth: MIN_TOUCH_TARGET, minHeight: 32, borderRadius: radii.pill, borderWidth: 1, paddingHorizontal: spacing.sm, alignItems: 'center', justifyContent: 'center' },
  rateText: { fontSize: typography.sizes.xs, fontWeight: typography.weights.bold, fontVariant: ['tabular-nums'] },
  note: { fontSize: typography.sizes.xs, opacity: 0.85, paddingTop: spacing.xs },
});

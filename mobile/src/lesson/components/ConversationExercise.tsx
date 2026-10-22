import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { isSoraniDialect, type ConversationLine, type ConversationSpeaker, type RecordingVoice } from '@kurda/shared';
import { hitSlopFor } from '../../a11y/a11y';
import { AAA_NORMAL } from '../../a11y/contrast';
import { ensureContrast } from '../../a11y/ensureContrast';
import { SpeakingCharacter, knownVoice } from '../../characters/SpeakingCharacter';
import type { PlaybackClock } from '../../characters/voice';
import { useI18n } from '../../i18n/I18nContext';
import { AVATAR_COLORS, AVATAR_TEXT_COLOR, deriveInitials } from '../../profile/initials';
import { useDirection } from '../../reports/direction';
import { ClayButton } from '../../theme/glass';
import { Icon } from '../../theme/Icon';
import { useTheme } from '../../theme/ThemeProvider';
import { radii, spacing, typography } from '../../theme/tokens';
import type { Feedback } from '../player';
import type { Exercise } from '../types';
import { canPlayAudio, useAudio } from '../useAudio';
import { MultipleChoiceExercise } from './MultipleChoiceExercise';

interface Props {
  exercise: Exercise;
  choice: number | null;
  onSelect: (index: number) => void;
  disabled: boolean;
  /** the verdict, once the answer is graded; null while choosing */
  feedback?: Feedback | null;
  /** the course's variety of Kurdish, so a Soranî conversation reads right to left */
  dialect?: string | null;
}

/**
 * Each part's colour, by its place in the conversation: four of the monogram
 * colours (profile/initials.ts), which are drawn under white letters in both
 * themes. Not their green or their red, which a lesson keeps for right and wrong.
 */
const PART_COLOURS = [AVATAR_COLORS[1], AVATAR_COLORS[4], AVATAR_COLORS[2], AVATAR_COLORS[7]] as const;

/** How much of a part's colour washes its bubbles, as a hex alpha: more on the dark page, where the colours are darker than it. */
const WASH = { light: '1F', dark: '3D' } as const;

/** The face beside each line: the part's initial, or its character while it says the line. */
const FACE = 40;

/** The round play button in a bubble, drawn smaller than a fingertip and reaching one (`hitSlopFor`). */
const PLAY = 36;

const NONE: readonly never[] = [];

/**
 * A conversation, and then a question about it.
 *
 * The lines read as a chat: the first part's at the start of the line and
 * everybody else's at the end, each part's bubbles in its own colour with its
 * initial beside them, so who is talking is told by the name, the side and the
 * colour together. A recorded line has its own play button, and "Play
 * conversation" plays every recorded line in order, lighting each bubble as it
 * is heard. When a line's recording names its character, the initial gives way
 * to that character saying it, lip-synced to the sound, and comes back after.
 *
 * The question is asked, and answers back once graded, exactly as a
 * multiple-choice item's is: it is one (`MultipleChoiceExercise`).
 */
export function ConversationExercise({ exercise, choice, onSelect, disabled, feedback = null, dialect }: Props) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const mirrored = dir.row === 'row-reverse';
  const speakers: readonly ConversationSpeaker[] = exercise.speakers ?? NONE;
  const lines: readonly ConversationLine[] = exercise.lines ?? NONE;
  const lineAudio: ReadonlyArray<string | null> = exercise.lineAudio ?? NONE;
  const voices: ReadonlyArray<RecordingVoice | null> = exercise.lineVoices ?? NONE;
  const audio = useConversationAudio(lineAudio);
  const [translated, setTranslated] = useState(false);

  const listenable = canPlayAudio() && lineAudio.some((url) => !!url);
  const meanings = lines.some((line) => !!line.en);
  const playingAll = !!audio.turn?.all;
  // Kurdish in its own direction, whatever language the app is read in
  const kurdish = isSoraniDialect(dialect ?? exercise.dialect) ? styles.rtl : styles.ltr;
  const wash = colors.scheme === 'dark' ? WASH.dark : WASH.light;

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>
        {listenable ? t('lesson.conversation.prompt') : t('lesson.conversation.promptRead')}
      </Text>
      {exercise.title ? (
        <Text style={[styles.title, kurdish, { color: colors.textPrimary }]} accessibilityRole="header">
          {exercise.title}
        </Text>
      ) : null}

      {listenable || meanings ? (
        <View style={[styles.controls, { flexDirection: dir.row }]}>
          {listenable ? (
            <ClayButton
              label={playingAll ? t('lesson.conversation.stop') : t('lesson.conversation.playAll')}
              icon={playingAll ? 'stop' : 'play'}
              tone="primary"
              variant="outline"
              onPress={playingAll ? audio.stop : audio.playAll}
            />
          ) : null}
          {meanings ? (
            <ClayButton
              label={translated ? t('lesson.conversation.hideTranslation') : t('lesson.conversation.showTranslation')}
              icon="translate"
              variant="outline"
              onPress={() => setTranslated((shown) => !shown)}
            />
          ) : null}
        </View>
      ) : null}

      <View style={styles.lines}>
        {lines.map((line, i) => {
          const name = speakers[line.speaker]?.name ?? '';
          // four parts at most, each in its own colour; anything out of range reads as the first, as in the browser
          const part = line.speaker > 0 && line.speaker < PART_COLOURS.length ? line.speaker : 0;
          const first = part === 0;
          const tint = PART_COLOURS[part] ?? PART_COLOURS[0];
          const url = listenable ? lineAudio[i] : null;
          const heard = audio.turn?.line === i;
          const sounding = heard && audio.playing;
          const voice = heard ? knownVoice(voices[i]) : null;
          // the first part's face at the start of the line and everybody else's at the end, whichever side that is
          const row = first ? dir.row : mirrored ? 'row' : 'row-reverse';
          return (
            <View key={i} style={[styles.row, { flexDirection: row }, first !== mirrored ? styles.rowStart : styles.rowEnd]}>
              <View style={styles.face}>
                {voice ? (
                  // facing its own bubble, saying the line with the sound
                  <SpeakingCharacter
                    speaker={voice.speaker}
                    voice={voice}
                    text={line.text}
                    player={audio.clock}
                    playing={audio.playing}
                    source={audio.source}
                    size={FACE}
                    flip={first === mirrored}
                  />
                ) : (
                  <View
                    style={[styles.initial, { backgroundColor: ensureContrast(tint, AVATAR_TEXT_COLOR, AAA_NORMAL) }]}
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                  >
                    <Text style={[styles.initialText, { color: AVATAR_TEXT_COLOR }]}>{Array.from(deriveInitials(name))[0]}</Text>
                  </View>
                )}
              </View>
              <View
                testID={heard ? 'conversation-heard' : undefined}
                style={[styles.bubble, { flexDirection: dir.row, backgroundColor: `${tint}${wash}`, borderColor: heard ? colors.gold : 'transparent' }]}
              >
                {/* who says it, what they say and what it means, read out as one */}
                <View accessible style={styles.said}>
                  <Text style={[styles.name, kurdish, { color: colors.textSecondary }]}>{name}</Text>
                  <Text style={[styles.text, kurdish, { color: colors.textPrimary }]}>{line.text}</Text>
                  {translated && line.en ? <Text style={[styles.meaning, styles.ltr, { color: colors.textSecondary }]}>{line.en}</Text> : null}
                </View>
                {url ? (
                  <Pressable
                    onPress={() => audio.playLine(i)}
                    accessibilityRole="button"
                    accessibilityLabel={t('lesson.conversation.playLine', { n: i + 1, name })}
                    hitSlop={hitSlopFor(PLAY, PLAY)}
                    style={({ pressed }) => [
                      styles.play,
                      { backgroundColor: colors.controlTrack, borderColor: sounding ? colors.gold : 'transparent', opacity: pressed ? 0.7 : 1 },
                    ]}
                  >
                    {/* the speaker points the same way in every language */}
                    <Icon name="speaker" size={18} color={sounding ? colors.goldText : colors.primary} />
                  </Pressable>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>

      <MultipleChoiceExercise exercise={exercise} choice={choice} onSelect={onSelect} disabled={disabled} feedback={feedback} />
    </View>
  );
}

/** One line asked for, and whether the rest of the conversation follows it. */
interface Turn {
  line: number;
  all: boolean;
  /** which asking it is: the same line asked for twice is two turns */
  n: number;
}

/** The first line from `from` on that has a recording, or null. */
function nextRecorded(lineAudio: ReadonlyArray<string | null>, from: number): number | null {
  for (let i = from; i < lineAudio.length; i++) if (lineAudio[i]) return i;
  return null;
}

/**
 * The conversation's recordings through the lesson's one player (useAudio), so
 * only one sounds at a time and the sound stops when the exercise goes: a line
 * on its own, or every recorded line from the first, in order.
 *
 * A line plays as soon as its recording has loaded, and its turn is over when
 * the player stops after playing it — or cannot play it at all, which passes
 * on to the next rather than holding the conversation up.
 */
function useConversationAudio(lineAudio: ReadonlyArray<string | null>): {
  turn: Turn | null;
  /** the line's recording is sounding now */
  playing: boolean;
  clock: PlaybackClock | null;
  source: string | null;
  playLine: (line: number) => void;
  playAll: () => void;
  stop: () => void;
} {
  const [turn, setTurn] = useState<Turn | null>(null);
  const url = turn ? (lineAudio[turn.line] ?? undefined) : undefined;
  const { source, playing, error, clock, play } = useAudio(url);
  const asked = useRef(0);
  // the turn its recording was set playing for, and whether it has been heard playing since
  const started = useRef(0);
  const heard = useRef(false);
  // the recording the player had when this last looked: a failure is the old one's until the player has moved on
  const loaded = useRef<string | undefined>(undefined);

  const ask = useCallback((line: number | null, all: boolean) => {
    setTurn(line === null ? null : { line, all, n: ++asked.current });
  }, []);

  useEffect(() => {
    if (!turn || !url || source !== url || started.current === turn.n) return;
    started.current = turn.n;
    heard.current = false;
    play(1);
  }, [turn, url, source, play]);

  useEffect(() => {
    const failed = error && loaded.current === url;
    loaded.current = url;
    if (!turn) return;
    if (!failed) {
      if (started.current !== turn.n) return;
      if (playing) {
        heard.current = true;
        return;
      }
      if (!heard.current) return;
    }
    heard.current = false;
    // the next recorded line follows when the whole conversation is playing
    const next = turn.all ? nextRecorded(lineAudio, turn.line + 1) : null;
    setTurn(next === null ? null : { line: next, all: true, n: ++asked.current });
  }, [turn, url, playing, error, lineAudio]);

  return {
    turn,
    playing: playing && !!url && source === url,
    clock: url && source === url ? clock : null,
    source,
    playLine: (line) => (lineAudio[line] ? ask(line, false) : undefined),
    playAll: () => ask(nextRecorded(lineAudio, 0), true),
    stop: () => ask(null, false),
  };
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  label: { fontSize: typography.sizes.sm, textTransform: 'uppercase' },
  title: { fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold },
  controls: { flexWrap: 'wrap', gap: spacing.sm },
  lines: { gap: spacing.sm },
  row: { alignItems: 'flex-end', gap: spacing.sm, maxWidth: '92%' },
  rowStart: { alignSelf: 'flex-start' },
  rowEnd: { alignSelf: 'flex-end' },
  face: { width: FACE, height: FACE },
  // the same corner as a character's own tile, so one stands in for the other without a jump
  initial: { width: FACE, height: FACE, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
  initialText: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  bubble: {
    flexShrink: 1,
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 2,
  },
  said: { flexShrink: 1, gap: 2 },
  name: { fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold },
  text: { fontSize: typography.sizes.md },
  meaning: { fontSize: typography.sizes.sm, fontStyle: 'italic' },
  play: { width: PLAY, height: PLAY, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  ltr: { writingDirection: 'ltr' },
  rtl: { writingDirection: 'rtl', textAlign: 'right' },
});

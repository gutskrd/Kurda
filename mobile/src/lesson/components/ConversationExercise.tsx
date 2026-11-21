import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../../theme/Pressable';
import { isSoraniDialect, type ConversationLine, type ConversationSpeaker, type RecordingVoice } from '@kurda/shared';
import { AAA_NORMAL } from '../../a11y/contrast';
import { ensureContrast } from '../../a11y/ensureContrast';
import { ConversationStage, conversationCast } from '../../characters/ConversationStage';
import type { PlaybackClock } from '../../characters/voice';
import { useI18n } from '../../i18n/I18nContext';
import { formatNumber } from '../../i18n/format';
import { AVATAR_COLORS, AVATAR_TEXT_COLOR, deriveInitials } from '../../profile/initials';
import { useDirection } from '../../reports/direction';
import { ClayButton } from '../../theme/glass';
import { Icon } from '../../theme/Icon';
import { useTheme } from '../../theme/ThemeProvider';
import { radii, spacing, typography } from '../../theme/tokens';
import { display } from '../../theme/fonts';
import type { Feedback } from '../player';
import type { Exercise } from '../types';
import { canPlayAudio, useAudio } from '../useAudio';
import { ExerciseHeadline } from './ExerciseHeadline';
import { MultipleChoiceExercise } from './MultipleChoiceExercise';
import { pressedDim } from '../../theme/motion';

interface Props {
  exercise: Exercise;
  choice: number | null;
  onSelect: (index: number) => void;
  disabled: boolean;
  /** The verdict once graded; null while choosing. */
  feedback?: Feedback | null;
  /** The course's variety of Kurdish, so a Soranî conversation reads right to left. */
  dialect?: string | null;
}

/**
 * Each part's colour by its place: four monogram colours (profile/initials.ts) that carry white letters in both
 * themes, skipping green and red, which a lesson keeps for right and wrong.
 */
const PART_COLOURS = [AVATAR_COLORS[1], AVATAR_COLORS[4], AVATAR_COLORS[2], AVATAR_COLORS[7]] as const;

/** How strongly a part's colour washes its bubbles, as hex alpha; more on the dark page. */
const WASH = { light: '1F', dark: '3D' } as const;

/** The initial beside each line. */
const FACE = 40;

/** A bubble's play button, drawn smaller than a fingertip; the Pressable computes its reach from this size. */
const PLAY = 36;

const NONE: readonly never[] = [];

/**
 * A conversation, then a question about it. Lines read as a chat: the first part's at the line start and others' at
 * the end, each in its own colour with an initial, so name, side and colour all tell who is talking. Recorded lines
 * have play buttons, and "Play conversation" plays them in order, highlighting each.
 *
 * When every part has a character, they stand together on one stage (`ConversationStage`), the speaker lip-synced
 * and the others looking at them; a line is always said by its own part's character. The question is a
 * `MultipleChoiceExercise`.
 */
export function ConversationExercise({ exercise, choice, onSelect, disabled, feedback = null, dialect }: Props) {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
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
  // Kurdish in its own direction, whatever the app's language.
  const sorani = isSoraniDialect(dialect ?? exercise.dialect);
  const kurdish = sorani ? styles.rtl : styles.ltr;
  const wash = colors.scheme === 'dark' ? WASH.dark : WASH.light;
  // The characters playing the parts, when every part has one.
  const staged = conversationCast(speakers) !== null;

  return (
    <View style={styles.container}>
      <ExerciseHeadline>{listenable ? t('lesson.conversation.prompt') : t('lesson.conversation.promptRead')}</ExerciseHeadline>
      {exercise.title ? (
        <Text style={[styles.title, kurdish, { color: colors.textPrimary }]} accessibilityRole="header">
          {exercise.title}
        </Text>
      ) : null}

      {staged ? (
        // Ordered like the bubbles: the first part stands on its lines' starting side.
        <ConversationStage
          speakers={speakers}
          lines={lines}
          voices={voices}
          at={audio.at}
          source={audio.at !== null ? (lineAudio[audio.at] ?? null) : null}
          playing={audio.playing}
          player={audio.clock}
          rtl={mirrored}
          // All are pleased with a right answer, and think a wrong one over with you.
          reaction={feedback ? (feedback.accepted ? 'cheer' : 'hmm') : null}
        />
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
          const yours = speakers[line.speaker]?.learner === true;
          // The learner's own part is named in their language, a character in Kurdish.
          const name = yours ? t('lesson.conversation.you') : (speakers[line.speaker]?.name ?? '');
          // At most four parts, each in its colour; anything out of range reads as the first, as on the website.
          const part = line.speaker > 0 && line.speaker < PART_COLOURS.length ? line.speaker : 0;
          // The learner's lines sit across from the first part, in the colour of a sent message.
          const first = part === 0 && !yours;
          const tint = yours ? colors.bubbleMine : (PART_COLOURS[part] ?? PART_COLOURS[0]);
          const url = listenable ? lineAudio[i] : null;
          const heard = audio.turn?.line === i;
          const sounding = heard && audio.playing;
          // The first part's initial at the line start and everyone else's at the end.
          const row = first ? dir.row : mirrored ? 'row' : 'row-reverse';
          return (
            <View key={i} style={[styles.row, { flexDirection: row }, first !== mirrored ? styles.rowStart : styles.rowEnd]}>
              <View
                style={[styles.initial, { backgroundColor: ensureContrast(tint, AVATAR_TEXT_COLOR, AAA_NORMAL) }]}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                <Text style={[styles.initialText, { color: AVATAR_TEXT_COLOR }]}>{Array.from(deriveInitials(name))[0]}</Text>
              </View>
              <View
                testID={heard ? 'conversation-heard' : undefined}
                style={[styles.bubble, { flexDirection: dir.row, backgroundColor: `${tint}${wash}`, borderColor: heard ? colors.gold : 'transparent' }]}
              >
                {/* Speaker, words and meaning, read as one. */}
                <View accessible style={styles.said}>
                  <Text style={[styles.name, yours ? null : kurdish, { color: colors.textSecondary }]}>{name}</Text>
                  <Text style={[styles.text, kurdish, { color: colors.textPrimary }]}>{line.text}</Text>
                  {translated && line.en ? <Text style={[styles.meaning, styles.ltr, { color: colors.textSecondary }]}>{line.en}</Text> : null}
                </View>
                {url ? (
                  <Pressable
                    onPress={() => audio.playLine(i)}
                    accessibilityRole="button"
                    accessibilityLabel={t('lesson.conversation.playLine', { n: formatNumber(i + 1, locale), name })}
                    style={({ pressed }) => [
                      styles.play,
                      { backgroundColor: colors.controlTrack, borderColor: sounding ? colors.gold : 'transparent', opacity: pressed ? pressedDim : 1 },
                    ]}
                  >
                    {/* The speaker icon points the same way in every language. */}
                    <Icon name="speaker" size={18} color={sounding ? colors.goldText : colors.primary} />
                  </Pressable>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>

      <MultipleChoiceExercise exercise={exercise} choice={choice} onSelect={onSelect} disabled={disabled} feedback={feedback} standalone={false} />
    </View>
  );
}

/** A requested line, and whether the rest of the conversation follows it. */
interface Turn {
  line: number;
  all: boolean;
  /** Counts requests, so the same line asked for twice is two turns. */
  n: number;
}

/** The first line from `from` on with a recording, or null. */
function nextRecorded(lineAudio: ReadonlyArray<string | null>, from: number): number | null {
  for (let i = from; i < lineAudio.length; i++) if (lineAudio[i]) return i;
  return null;
}

/**
 * The conversation's recordings through the lesson's one player (useAudio), so one sounds at a time and sound stops
 * when the exercise goes: a single line, or every recorded line in order. A line plays once loaded, and its turn
 * ends when the player stops, or when it cannot play, which moves on rather than stalling.
 */
function useConversationAudio(lineAudio: ReadonlyArray<string | null>): {
  turn: Turn | null;
  /** The line playing now, or the one heard last; null before any was requested. */
  at: number | null;
  /** The line's recording is sounding now. */
  playing: boolean;
  clock: PlaybackClock | null;
  source: string | null;
  playLine: (line: number) => void;
  playAll: () => void;
  stop: () => void;
} {
  const [turn, setTurn] = useState<Turn | null>(null);
  // The last line heard, kept after its turn so the stage still shows who said it.
  const [last, setLast] = useState<number | null>(null);
  const url = turn ? (lineAudio[turn.line] ?? undefined) : undefined;
  const { source, playing, error, clock, play } = useAudio(url);
  const asked = useRef(0);
  // The turn its recording was started for, and whether it has been heard playing since.
  const started = useRef(0);
  const heard = useRef(false);
  // The recording the player had last time: a failure belongs to the old one until the player moves on.
  const loaded = useRef<string | undefined>(undefined);

  const ask = useCallback((line: number | null, all: boolean) => {
    setTurn(line === null ? null : { line, all, n: ++asked.current });
  }, []);

  useEffect(() => {
    if (turn) setLast(turn.line);
  }, [turn]);

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
    // The next recorded line follows when the whole conversation is playing.
    const next = turn.all ? nextRecorded(lineAudio, turn.line + 1) : null;
    setTurn(next === null ? null : { line: next, all: true, n: ++asked.current });
  }, [turn, url, playing, error, lineAudio]);

  return {
    turn,
    at: turn ? turn.line : last,
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
  title: { ...display(typography.sizes.text) },
  controls: { flexWrap: 'wrap', gap: spacing.sm },
  lines: { gap: spacing.sm },
  row: { alignItems: 'flex-end', gap: spacing.sm, maxWidth: '92%' },
  rowStart: { alignSelf: 'flex-start' },
  rowEnd: { alignSelf: 'flex-end' },
  initial: { width: FACE, height: FACE, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
  initialText: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold },
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
  name: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  // What is said, in the lesson's Kurdish display face.
  text: { ...display(typography.sizes.text) },
  meaning: { fontSize: typography.sizes.text, fontStyle: 'italic' },
  play: { width: PLAY, height: PLAY, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  ltr: { writingDirection: 'ltr' },
  rtl: { writingDirection: 'rtl', textAlign: 'right' },
});

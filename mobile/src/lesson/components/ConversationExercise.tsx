import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../../theme/Pressable';
import { isSoraniDialect, nextConversationLine, type ConversationLine, type ConversationSpeaker, type RecordingVoice } from '@kurda/shared';
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
import { PromptWords } from './PromptWords';
import { pressedDim } from '../../theme/motion';
import { autoplayOn } from '../../feedback/autoplayPref';
import { AUTOPLAY_MS } from '../useAutoplay';

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
 * have play buttons. The main button takes the conversation a turn at a time, waiting for the learner to say their own
 * lines ("I said it") before the answer plays, and marks the line heard or waiting.
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
  const [translated, setTranslated] = useState(false);

  const listenable = canPlayAudio() && lineAudio.some((url) => !!url);
  const audio = useConversationAudio(speakers, lines, lineAudio, listenable && !disabled && autoplayOn());
  const meanings = lines.some((line) => !!line.en);
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
            <ClayButton label={t(STEP_LABEL[audio.step])} icon="play" tone="primary" variant="outline" onPress={audio.advance} />
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
          // The learner's own line, waiting for them to say it.
          const waiting = audio.waiting === i;
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
                testID={heard ? 'conversation-heard' : waiting ? 'conversation-turn' : undefined}
                style={[
                  styles.bubble,
                  { flexDirection: dir.row, backgroundColor: `${tint}${wash}`, borderColor: heard || waiting ? colors.gold : 'transparent' },
                  waiting ? styles.waiting : null,
                ]}
              >
                {/* Speaker, words and meaning, read as one. */}
                <View accessible style={styles.said}>
                  <Text style={[styles.name, yours ? null : kurdish, { color: colors.textSecondary }]}>{name}</Text>
                  {/* Each word a tap from what it means, as in the lesson's other Kurdish lines. */}
                  <PromptWords prompt={line.text} tokens={exercise.lineTokens?.[i]} style={[styles.text, kurdish, { color: colors.textPrimary }]} />
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

/** A requested line. */
interface Turn {
  line: number;
  /** Counts requests, so the same line asked for twice is two turns. */
  n: number;
}

/** What the main button does next: hear the first line, say the learner's own line, hear the next, or start again. */
type Step = 'first' | 'yours' | 'next' | 'again';

/** The main button's words for each step. */
const STEP_LABEL = {
  first: 'lesson.conversation.first',
  yours: 'lesson.conversation.said',
  next: 'lesson.conversation.next',
  again: 'lesson.conversation.again',
} as const;

/**
 * The conversation's recordings through the lesson's one player (useAudio), so one sounds at a time and sound stops
 * when the exercise goes. A turn at a time, as a real exchange: with `auto`, the first line by itself AUTOPLAY_MS after
 * the exercise appears; when the learner's own line comes, the main button waits for them to say it and then plays the
 * answer; otherwise it plays the next line (the shared `nextConversationLine`). A line plays once loaded, and its turn
 * ends when the player stops or when it cannot play.
 */
function useConversationAudio(
  speakers: readonly ConversationSpeaker[],
  lines: readonly ConversationLine[],
  lineAudio: ReadonlyArray<string | null>,
  auto: boolean,
): {
  turn: Turn | null;
  /** The line playing now, or the one heard last; null before any was requested. */
  at: number | null;
  /** The line's recording is sounding now. */
  playing: boolean;
  clock: PlaybackClock | null;
  source: string | null;
  step: Step;
  /** The learner's own line waiting to be said, or null. */
  waiting: number | null;
  playLine: (line: number) => void;
  advance: () => void;
} {
  const [turn, setTurn] = useState<Turn | null>(null);
  // The last line reached, heard or said, kept after its turn so the stage still shows who said it and the button knows
  // what is next.
  const [last, setLast] = useState<number | null>(null);
  const url = turn ? (lineAudio[turn.line] ?? undefined) : undefined;
  const { source, playing, error, clock, play } = useAudio(url);
  const asked = useRef(0);
  // The turn its recording was started for, and whether it has been heard playing since.
  const started = useRef(0);
  const heard = useRef(false);
  // The recording the player had last time: a failure belongs to the old one until the player moves on.
  const loaded = useRef<string | undefined>(undefined);

  const ask = useCallback((line: number) => {
    setTurn({ line, n: ++asked.current });
  }, []);

  const from = (i: number): number | null => nextConversationLine(speakers, lines, lineAudio, i);
  const yours = (i: number | null): boolean => i !== null && speakers[lines[i]?.speaker ?? -1]?.learner === true;
  const first = from(0);
  // The first line by itself, unless the learner has already asked for one or the conversation opens on their own line.
  const opener = first !== null && !yours(first) ? first : null;
  useEffect(() => {
    if (!auto || opener === null) return;
    const id = setTimeout(() => {
      if (asked.current === 0) ask(opener);
    }, AUTOPLAY_MS);
    return () => clearTimeout(id);
  }, [auto, opener, ask]);

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
    setTurn(null);
  }, [turn, url, playing, error]);

  const at = turn ? turn.line : last;
  const next = from(at === null ? 0 : at + 1);
  const step: Step = next === null ? 'again' : yours(next) ? 'yours' : at === null ? 'first' : 'next';
  return {
    turn,
    at,
    playing: playing && !!url && source === url,
    clock: url && source === url ? clock : null,
    source,
    step,
    waiting: step === 'yours' ? next : null,
    playLine: (line) => (lineAudio[line] ? ask(line) : undefined),
    advance: () => {
      if (next === null) {
        setLast(null);
        if (opener !== null) ask(opener);
      } else if (yours(next)) {
        // Said: on to whoever answers.
        setTurn(null);
        setLast(next);
        const then = from(next + 1);
        if (then !== null && !yours(then)) ask(then);
      } else {
        ask(next);
      }
    },
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
  // The learner's own line, waiting for them to say it.
  waiting: { borderStyle: 'dashed' },
  play: { width: PLAY, height: PLAY, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  ltr: { writingDirection: 'ltr' },
  rtl: { writingDirection: 'rtl', textAlign: 'right' },
});

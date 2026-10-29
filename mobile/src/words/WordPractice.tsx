import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  askWordAgain,
  makeWordRound,
  wordIn,
  type AlphabetScript,
  type SetWord,
  type WordQuestion,
  type WordSetId,
} from '@kurda/shared';
import { PlayButton, SpokenStage, scriptText } from '../alphabet/parts';
import { Dots } from '../alphabet/Practice';
import type { ClipPlayer } from '../alphabet/useClipPlayer';
import { haptic } from '../feedback/haptics';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { useDirection } from '../reports/direction';
import { useAnnouncer } from '../stories/ui';
import { display } from '../theme/fonts';
import { ClayButton } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { AnswerMotion, Pop } from '../theme/MotionParts';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import type { WordsAudio } from './audio';
import { DayName, Digits, Swatch, WordText, meaningOf } from './parts';

interface Item {
  q: WordQuestion;
  /** a miss coming back later in the round; it does not count toward the score */
  retry: boolean;
}

/** How far back a missed question comes: far enough to be recalled, not just remembered. */
const COMEBACK = 3;

/** What each kind asks, by set where the set changes the question. */
function askKey(q: WordQuestion): TranslationKey {
  const by = (colour: TranslationKey, number: TranslationKey, word: TranslationKey) => (q.set === 'colours' ? colour : q.set === 'numbers' ? number : word);
  switch (q.kind) {
    case 'hear':
      return by('words.practice.qHearColour', 'words.practice.qHearNumber', 'words.practice.qHearWord');
    case 'see':
      return by('words.practice.qSeeColour', 'words.practice.qSeeNumber', 'words.practice.qSeeWord');
    case 'read':
      return by('words.practice.qReadColour', 'words.practice.qReadNumber', 'words.practice.qReadWord');
    case 'after':
      return 'words.practice.qAfter';
    case 'next':
      return 'words.practice.qNext';
    case 'newroz':
      return q.topic.set === 'months' && q.topic.calendar === 'kurdish' ? 'words.practice.qNewrozKurdish' : 'words.practice.qNewroz';
  }
}

/**
 * "Check yourself" for a word set: a round of eight short questions made in
 * @kurda/shared (`makeWordRound` says how and why), drawn the way the
 * alphabet's round is (alphabet/Practice.tsx) — a miss shows the right answer
 * with its sound at once and comes back later in the round; nothing is scored,
 * saved or ranked, and the end names the words to look at again, with a round
 * of just those.
 */
export function WordPractice({
  set,
  dialect,
  audio,
  player,
  onBegin,
  onOpen,
}: {
  set: WordSetId;
  dialect: AlphabetScript;
  audio: WordsAudio;
  player: ClipPlayer;
  /** a round has begun and grown to its height: the screen brings it into view */
  onBegin: () => void;
  /** open a word missed in the round */
  onOpen: (id: string) => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const { announce, region } = useAnnouncer();
  const [queue, setQueue] = useState<Item[] | null>(null);
  const [at, setAt] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  const [missed, setMissed] = useState<SetWord[]>([]);
  const [results, setResults] = useState<Array<boolean | null>>([]);
  const { play } = player;
  // brought into view once the card has grown to hold the round, as the alphabet's is
  const begun = useRef(false);

  const start = (focus: string[] | null = null): void => {
    const round = makeWordRound(set, dialect, focus, Math.random, audio.sounds);
    setQueue(round.map((q) => ({ q, retry: false })));
    setResults(round.map(() => null));
    setAt(0);
    setChosen(null);
    setMissed([]);
    begun.current = true;
  };

  const item = queue?.[at];
  const q = item?.q;
  const done = queue !== null && at >= queue.length;

  // a listening question speaks as it appears: Start, or Next, was the tap that lets it
  useEffect(() => {
    if (q?.clip) play(q.clip);
  }, [q, play]);

  const choose = useCallback(
    (id: string) => {
      if (!q || !item || chosen !== null) return;
      setChosen(id);
      const right = id === q.answer;
      haptic(right ? 'correct' : 'wrong');
      announce(right ? t('alphabet.practice.right') : t('alphabet.practice.wrong', { letter: wordIn(q.topic, dialect) }));
      if (!item.retry) {
        const original = queue!.slice(0, at + 1).filter((i) => !i.retry).length - 1;
        setResults((r) => r.map((v, i) => (i === original ? right : v)));
      }
      if (!right) {
        setMissed((m) => (m.includes(q.topic) ? m : [...m, q.topic]));
        if (!item.retry) {
          setQueue((qs) => {
            const list = [...qs!];
            list.splice(Math.min(at + 1 + COMEBACK, list.length), 0, { q: askWordAgain(q), retry: true });
            return list;
          });
        }
      }
    },
    [q, item, chosen, queue, at, announce, t, dialect],
  );

  const firstTries = results.length;
  const firstRight = results.filter((r) => r === true).length;
  const answered = results.filter((r) => r !== null).length;
  const replay = q?.clip ? <PlayButton src={q.clip} label={t('alphabet.practice.replay')} player={player} size="large" /> : null;

  return (
    <View
      style={[styles.card, { backgroundColor: colors.surface }]}
      onLayout={() => {
        if (!begun.current) return;
        begun.current = false;
        onBegin();
      }}
    >
      {region}
      <Text style={[styles.title, dir.text, { color: colors.textPrimary }]} accessibilityRole="header">
        {t('alphabet.practice.title')}
      </Text>

      {!queue ? (
        <>
          <Text style={[styles.body, dir.text, { color: colors.textSecondary }]}>{t('alphabet.practice.body')}</Text>
          <ClayButton label={t('alphabet.practice.start')} tone="primary" onPress={() => start()} style={styles.action} />
        </>
      ) : null}

      {q && item ? (
        <View style={styles.question}>
          <View style={[styles.top, { flexDirection: dir.row }]}>
            <Dots
              results={results}
              label={t('alphabet.practice.progress', { n: Math.min(answered + (item.retry || chosen !== null ? 0 : 1), firstTries), total: firstTries })}
            />
            {item.retry ? (
              <View style={[styles.pill, { backgroundColor: colors.controlTrack }]}>
                <Text style={[styles.pillText, { color: colors.goldText }]}>{t('alphabet.practice.retry')}</Text>
              </View>
            ) : null}
          </View>

          <Text style={[styles.ask, dir.text, { color: colors.textSecondary }]}>{t(askKey(q))}</Text>

          {q.clip ? (
            // whoever says the word stands on a stage beside its button, and is pleased with a right answer
            <SpokenStage
              srcs={[q.clip]}
              audio={audio}
              player={player}
              reaction={chosen === null ? null : chosen === q.answer ? 'cheer' : 'hmm'}
              fallback={<View style={[styles.prompt, { flexDirection: dir.row }]}>{replay}</View>}
            >
              <View style={styles.staged}>{replay}</View>
            </SpokenStage>
          ) : q.prompt ? (
            <View style={[styles.prompt, { flexDirection: dir.row }]}>
              <Face word={q.prompt} dialect={dialect} shows={q.kind === 'see' ? 'meaning' : 'word'} size="prompt" />
            </View>
          ) : null}

          <View style={[styles.options, { flexDirection: dir.row }]} testID="word-options">
            {q.options.map((o) => (
              <Choice
                key={o.id}
                word={o}
                dialect={dialect}
                shows={q.shows}
                state={chosen === null ? 'open' : o.id === q.answer ? 'right' : o.id === chosen ? 'wrong' : 'dim'}
                picked={o.id === chosen}
                onPress={() => choose(o.id)}
              />
            ))}
          </View>

          {chosen !== null ? (
            <View style={styles.feedback}>
              <Text style={[styles.verdict, dir.text, { color: chosen === q.answer ? colors.success : colors.danger }]}>
                {chosen === q.answer ? t('alphabet.practice.right') : t('alphabet.practice.wrong', { letter: wordIn(q.topic, dialect) })}
                {chosen !== q.answer && !item.retry ? (
                  <Text style={[styles.comeback, { color: colors.textSecondary }]}>{` ${t('alphabet.practice.comeback')}`}</Text>
                ) : null}
              </Text>
              <Explain word={q.topic} dialect={dialect} audio={audio} player={player} />
              <ClayButton
                label={t('alphabet.practice.next')}
                tone="primary"
                onPress={() => {
                  setAt((n) => n + 1);
                  setChosen(null);
                }}
                style={styles.action}
              />
            </View>
          ) : null}
        </View>
      ) : null}

      {done ? (
        <View style={styles.done}>
          <Dots results={results} />
          <Pop when={missed.length === 0}>
            <Text style={[styles.score, dir.text, { color: missed.length === 0 ? colors.success : colors.textPrimary }]} accessibilityLiveRegion="polite">
              {t('alphabet.practice.score', { right: firstRight, total: firstTries })}
            </Text>
          </Pop>
          {missed.length === 0 ? (
            <Text style={[styles.body, dir.text, { color: colors.textSecondary }]}>{t('words.practice.perfect')}</Text>
          ) : (
            <>
              <Text style={[styles.body, dir.text, { color: colors.textSecondary }]}>
                {`${t('alphabet.practice.review')} ${t('words.practice.reviewHint')}`}
              </Text>
              <View style={[styles.review, { flexDirection: dir.row }]}>
                {missed.map((w) => (
                  <Pressable
                    key={w.id}
                    onPress={() => onOpen(w.id)}
                    accessibilityRole="button"
                    accessibilityLabel={wordIn(w, dialect)}
                    style={({ pressed }) => [styles.reviewTile, { backgroundColor: colors.controlTrack, opacity: pressed ? 0.7 : 1 }]}
                  >
                    <Face word={w} dialect={dialect} shows="word" size="option" />
                  </Pressable>
                ))}
              </View>
            </>
          )}
          <View style={[styles.actions, { flexDirection: dir.row }]}>
            {missed.length > 0 ? <ClayButton label={t('words.practice.focus')} tone="primary" onPress={() => start(missed.map((w) => w.id))} /> : null}
            <ClayButton label={t('alphabet.practice.again')} variant={missed.length > 0 ? 'outline' : 'solid'} tone="primary" onPress={() => start()} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

const FACE = { prompt: { word: 34, digits: 52, swatch: 72, text: typography.sizes.lg }, option: { word: 20, digits: 30, swatch: 40, text: typography.sizes.sm } } as const;

/**
 * A word as a question or an option shows it: the Kurdish word (a day with its
 * number marked) — or what it means: a colour's swatch, a number's digits, the
 * reader's own word for a day or a month.
 */
function Face({ word, dialect, shows, size }: { word: SetWord; dialect: AlphabetScript; shows: 'word' | 'meaning'; size: keyof typeof FACE }): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const s = FACE[size];
  if (shows === 'word') {
    if (word.set !== 'days') return <WordText word={word} dialect={dialect} size={s.word} latin={size === 'prompt'} />;
    const arabic = dialect === 'ckb';
    return (
      <DayName
        day={word}
        dialect={dialect}
        style={[arabic ? { fontSize: s.word, lineHeight: Math.round(s.word * 1.5) } : { ...display(s.word), lineHeight: Math.round(s.word * 1.2) }, styles.centre]}
      />
    );
  }
  if (word.set === 'colours') return <Swatch hex={word.hex} size={s.swatch} />;
  if (word.set === 'numbers') return <Digits value={word.value} dialect={dialect} size={s.digits} />;
  const meaning = meaningOf(word, dialect, locale, t);
  return (
    <Text style={[{ ...display(s.text), lineHeight: Math.round(s.text * 1.3) }, styles.centre, meaning.script ? scriptText(meaning.script) : dir.text, { color: colors.textPrimary }]}>
      {meaning.text}
    </Text>
  );
}

/** One answer: a tile that says, once chosen, whether it was the one — in colour, with a mark, and with a pop or a shake. */
function Choice({
  word,
  dialect,
  shows,
  state,
  picked,
  onPress,
}: {
  word: SetWord;
  dialect: AlphabetScript;
  shows: 'word' | 'meaning';
  state: 'open' | 'right' | 'wrong' | 'dim';
  picked: boolean;
  onPress: () => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const fill = state === 'right' ? colors.successFill : state === 'wrong' ? colors.dangerFill : colors.controlTrack;
  const edge = state === 'right' ? colors.success : state === 'wrong' ? colors.danger : 'transparent';
  // a swatch or a number is read out as what it is
  const said = shows === 'word' ? wordIn(word, dialect) : meaningOf(word, dialect, locale, t).text;
  return (
    <AnswerMotion verdict={picked ? (state === 'right' ? 'right' : 'wrong') : null} style={styles.choiceWrap}>
      <Pressable
        onPress={onPress}
        disabled={state !== 'open'}
        accessibilityRole="button"
        accessibilityLabel={state === 'right' ? `${said}, ${t('lesson.correct')}` : said}
        accessibilityState={{ disabled: state !== 'open' }}
        style={({ pressed }) => [styles.choice, { backgroundColor: fill, borderColor: edge, opacity: state === 'dim' ? 0.45 : pressed ? 0.75 : 1 }]}
      >
        <Face word={word} dialect={dialect} shows={shows} size="option" />
        {state === 'right' ? <Icon name="check" size={16} color={colors.success} style={styles.choiceMark} /> : null}
        {state === 'wrong' ? <Icon name="close" size={16} color={colors.danger} style={styles.choiceMark} /> : null}
      </Pressable>
    </AnswerMotion>
  );
}

/** Why the answer is what it is: the word, what it means, and its sound. */
function Explain({ word, dialect, audio, player }: { word: SetWord; dialect: AlphabetScript; audio: WordsAudio; player: ClipPlayer }): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const meaning = meaningOf(word, dialect, locale, t);
  return (
    <View style={[styles.explain, { backgroundColor: colors.controlTrack, flexDirection: dir.row }]}>
      {word.set === 'colours' ? <Swatch hex={word.hex} size={32} /> : null}
      <View style={styles.flex}>
        <WordText word={word} dialect={dialect} size={typography.sizes.lg} align="start" />
        <Text style={[styles.explainNote, meaning.script ? scriptText(meaning.script) : dir.text, { color: colors.textSecondary }]}>{meaning.text}</Text>
      </View>
      <PlayButton src={audio.sounds.of(word, dialect)} label={t('alphabet.listen')} player={player} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.lg, padding: spacing.md + 4, gap: spacing.sm + 4 },
  title: { ...display(typography.sizes.lg) },
  body: { fontSize: typography.sizes.sm, lineHeight: 21 },
  action: { alignSelf: 'flex-start' },
  flex: { flex: 1 },
  centre: { textAlign: 'center' },

  question: { gap: spacing.sm + 4 },
  top: { alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, minHeight: 22 },
  pill: { borderRadius: radii.pill, paddingHorizontal: spacing.sm + 2, paddingVertical: 3 },
  pillText: { fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold },
  ask: { fontSize: typography.sizes.md },
  prompt: { alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: spacing.sm + 6, minHeight: 56 },
  staged: { alignItems: 'center', gap: spacing.sm },

  options: { gap: spacing.sm + 2 },
  choiceWrap: { flex: 1 },
  choice: {
    minHeight: 72,
    borderRadius: radii.md,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.sm,
  },
  choiceMark: { position: 'absolute', top: 6, right: 6 },

  feedback: { gap: spacing.sm + 4 },
  verdict: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  comeback: { fontWeight: typography.weights.regular },
  explain: { alignItems: 'center', borderRadius: radii.md, padding: spacing.sm + 4, gap: spacing.sm + 4 },
  explainNote: { fontSize: typography.sizes.sm },

  done: { gap: spacing.sm + 4 },
  score: { ...display(typography.sizes.xl) },
  review: { flexWrap: 'wrap', gap: spacing.sm },
  reviewTile: { minWidth: 56, minHeight: 56, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.sm },
  actions: { flexWrap: 'wrap', gap: spacing.sm },
});

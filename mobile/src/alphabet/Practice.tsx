import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  LATIN_LETTERS,
  SORANI_LETTERS,
  alphabetRound,
  askAgain,
  compareLocaleOf,
  likeFor,
  type AlphabetOption,
  type AlphabetQuestion,
  type AlphabetScript,
  type AlphabetTopic,
} from '@kurda/shared';
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
import type { AlphabetAudio } from './audio';
import { Like, Meaning, PlayButton, SpokenStage, scriptLanguage, scriptText } from './parts';
import type { ClipPlayer } from './useClipPlayer';

interface Item {
  q: AlphabetQuestion;
  /** a miss coming back later in the round; it does not count toward the score */
  retry: boolean;
}

const POSITION: Record<'start' | 'middle' | 'end', TranslationKey> = {
  start: 'alphabet.form.start',
  middle: 'alphabet.form.middle',
  end: 'alphabet.form.end',
};

/** How far back a missed question comes: far enough to be recalled, not just remembered. */
const COMEBACK = 3;

function clipOf(q: AlphabetQuestion): string | null {
  return 'clip' in q ? q.clip : null;
}

/**
 * "Check yourself": a round of eight short questions, the website's own
 * (`alphabetRound` in @kurda/shared says how a round is made and why). A miss
 * shows the right answer with its sound at once and comes back later in the
 * round; nothing is scored, saved or ranked, and the end names what to look
 * at again, with a round of just those.
 *
 * A listening question speaks as it appears — Start was the tap that lets it
 * — and its character, when the recording has one, says it beside the button
 * that plays it again.
 */
export function Practice({
  script,
  audio,
  player,
  onBegin,
  onOpen,
}: {
  script: AlphabetScript;
  audio: AlphabetAudio;
  player: ClipPlayer;
  /** a round has begun and grown to its height: the screen brings it into view */
  onBegin: () => void;
  /** open a letter missed in the round */
  onOpen: (id: string) => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const { announce, region } = useAnnouncer();
  const [queue, setQueue] = useState<Item[] | null>(null);
  const [at, setAt] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  const [missed, setMissed] = useState<AlphabetTopic[]>([]);
  const [results, setResults] = useState<Array<boolean | null>>([]);
  const { play } = player;
  /*
   * A round just begun is brought into view once the card has grown to hold
   * it: scrolled at once, the page would stop short at the end of what it was
   * before the questions arrived.
   */
  const begun = useRef(false);

  const start = (focus: string[] | null = null): void => {
    const round = alphabetRound(script, locale, focus, Math.random, audio.sounds);
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

  useEffect(() => {
    const clip = q ? clipOf(q) : null;
    if (clip) play(clip);
  }, [q, play]);

  const choose = useCallback(
    (id: string) => {
      if (!q || !item || chosen !== null) return;
      setChosen(id);
      const right = id === q.answer;
      haptic(right ? 'correct' : 'wrong');
      const answer = q.options.find((o) => o.id === q.answer)!.text;
      announce(right ? t('alphabet.practice.right') : t('alphabet.practice.wrong', { letter: answer }));
      if (!item.retry) {
        const original = queue!.slice(0, at + 1).filter((i) => !i.retry).length - 1;
        setResults((r) => r.map((v, i) => (i === original ? right : v)));
      }
      if (!right) {
        setMissed((m) => (m.some((x) => x.id === q.topic.id && x.script === q.topic.script) ? m : [...m, q.topic]));
        if (!item.retry) {
          setQueue((qs) => {
            const list = [...qs!];
            list.splice(Math.min(at + 1 + COMEBACK, list.length), 0, { q: askAgain(q), retry: true });
            return list;
          });
        }
      }
    },
    [q, item, chosen, queue, at, announce, t],
  );

  const ask = (question: AlphabetQuestion): string => {
    switch (question.kind) {
      case 'hear':
        return t('alphabet.practice.qHear');
      case 'like':
        return t('alphabet.practice.qSound');
      case 'spell':
        return t('alphabet.practice.qSpell');
      case 'pair':
        return t('alphabet.practice.qPair');
      case 'form':
        return t('alphabet.practice.qForm');
      case 'script':
        return question.prompt.script === 'kmr' ? t('alphabet.practice.qToSorani') : t('alphabet.practice.qToLatin');
    }
  };

  // a question asked out loud: the button that says it again, and for a spelling the meaning of the word
  const sounded =
    q && (q.kind === 'hear' || q.kind === 'spell' || q.kind === 'pair') ? (
      <>
        <PlayButton src={q.clip} label={t('alphabet.practice.replay')} player={player} size="large" />
        {/* for a Kurmancî reader the meaning would be the answer, so they get the Soranî word instead */}
        {q.kind === 'spell' ? <Meaning meaning={q.meaning} script="kmr" style={styles.promptMeaning} /> : null}
      </>
    ) : null;

  const firstTries = results.length;
  const firstRight = results.filter((r) => r === true).length;
  const answered = results.filter((r) => r !== null).length;

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

          <Text style={[styles.ask, dir.text, { color: colors.textSecondary }]}>{ask(q)}</Text>

          {q.kind === 'hear' || q.kind === 'spell' || q.kind === 'pair' ? (
            // whoever says the sound stands on a stage beside its button, and is pleased with a right answer
            <SpokenStage
              srcs={[q.clip]}
              audio={audio}
              player={player}
              reaction={chosen === null ? null : chosen === q.answer ? 'cheer' : 'hmm'}
              fallback={<View style={[styles.prompt, { flexDirection: dir.row }]}>{sounded}</View>}
            >
              <View style={styles.staged}>{sounded}</View>
            </SpokenStage>
          ) : (
            <View style={[styles.prompt, { flexDirection: dir.row }]}>
              {q.kind === 'like' ? <Like like={q.like} style={styles.promptLike} /> : null}
              {q.kind === 'script' ? <Glyph o={q.prompt} size={PROMPT_GLYPH} /> : null}
              {q.kind === 'form' ? (
                <View style={[styles.form, { backgroundColor: colors.controlTrack }]}>
                  <Glyph o={{ id: q.topic.id, text: q.prompt, script: 'ckb' }} size={PROMPT_GLYPH} />
                  <Text style={[styles.formLabel, { color: colors.textSecondary }]}>{t(POSITION[q.position])}</Text>
                </View>
              ) : null}
            </View>
          )}

          <View style={[styles.options, { flexDirection: dir.row }]} testID="alphabet-options">
            {q.options.map((o) => (
              <Choice
                key={o.id}
                option={o}
                words={q.kind === 'spell' || q.kind === 'pair'}
                state={chosen === null ? 'open' : o.id === q.answer ? 'right' : o.id === chosen ? 'wrong' : 'dim'}
                picked={o.id === chosen}
                onPress={() => choose(o.id)}
              />
            ))}
          </View>

          {chosen !== null ? (
            <View style={styles.feedback}>
              <Text style={[styles.verdict, dir.text, { color: chosen === q.answer ? colors.success : colors.danger }]}>
                {chosen === q.answer
                  ? t('alphabet.practice.right')
                  : t('alphabet.practice.wrong', { letter: q.options.find((o) => o.id === q.answer)!.text })}
                {chosen !== q.answer && !item.retry ? (
                  <Text style={[styles.comeback, { color: colors.textSecondary }]}>{` ${t('alphabet.practice.comeback')}`}</Text>
                ) : null}
              </Text>
              <Explain q={q} audio={audio} player={player} />
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
            <Text style={[styles.body, dir.text, { color: colors.textSecondary }]}>{t('alphabet.practice.perfect')}</Text>
          ) : (
            <>
              <Text style={[styles.body, dir.text, { color: colors.textSecondary }]}>
                {`${t('alphabet.practice.review')} ${t('alphabet.practice.reviewHint')}`}
              </Text>
              <View style={[styles.review, { flexDirection: dir.row }]}>
                {missed.map((m) => {
                  const text = m.script === 'kmr' ? m.id : (SORANI_LETTERS.find((l) => l.id === m.id)?.char ?? m.id);
                  return (
                    <Pressable
                      key={`${m.script}:${m.id}`}
                      onPress={() => onOpen(m.id)}
                      accessibilityRole="button"
                      accessibilityLabel={text}
                      style={({ pressed }) => [styles.reviewTile, { backgroundColor: colors.controlTrack, opacity: pressed ? 0.7 : 1 }]}
                    >
                      <Glyph o={{ id: m.id, text, script: m.script }} size={typography.sizes.xl} />
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}
          <View style={[styles.actions, { flexDirection: dir.row }]}>
            {missed.length > 0 ? <ClayButton label={t('alphabet.practice.focus')} tone="primary" onPress={() => start(missed.map((m) => m.id))} /> : null}
            <ClayButton label={t('alphabet.practice.again')} variant={missed.length > 0 ? 'outline' : 'solid'} tone="primary" onPress={() => start()} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

const PROMPT_GLYPH = 44;

/** A letter or a word in its own script, the way it is written there. */
function Glyph({ o, size }: { o: AlphabetOption; size: number }): React.JSX.Element {
  const { colors } = useTheme();
  const arabic = o.script === 'ckb';
  return (
    <Text
      style={[
        arabic ? { fontSize: size, lineHeight: Math.round(size * 1.45) } : { ...display(size), lineHeight: Math.round(size * 1.2) },
        scriptText(o.script),
        { color: colors.textPrimary },
      ]}
      accessibilityLanguage={scriptLanguage(o.script)}
      maxFontSizeMultiplier={1.3}
    >
      {o.text}
    </Text>
  );
}

/** One answer: a tile that says, once chosen, whether it was the one — in colour, with a mark, and with a pop or a shake. */
function Choice({
  option,
  words,
  state,
  picked,
  onPress,
}: {
  option: AlphabetOption;
  words: boolean;
  state: 'open' | 'right' | 'wrong' | 'dim';
  picked: boolean;
  onPress: () => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const fill = state === 'right' ? colors.successFill : state === 'wrong' ? colors.dangerFill : colors.controlTrack;
  const edge = state === 'right' ? colors.success : state === 'wrong' ? colors.danger : 'transparent';
  return (
    <AnswerMotion verdict={picked ? (state === 'right' ? 'right' : 'wrong') : null} style={styles.choiceWrap}>
      <Pressable
        onPress={onPress}
        disabled={state !== 'open'}
        accessibilityRole="button"
        accessibilityLabel={state === 'right' ? `${option.text}, ${t('lesson.correct')}` : option.text}
        accessibilityState={{ disabled: state !== 'open' }}
        style={({ pressed }) => [
          styles.choice,
          { backgroundColor: fill, borderColor: edge, opacity: state === 'dim' ? 0.45 : pressed ? 0.75 : 1 },
        ]}
      >
        <Glyph o={option} size={words ? typography.sizes.lg : typography.sizes.xl + 4} />
        {state === 'right' ? <Icon name="check" size={16} color={colors.success} style={styles.choiceMark} /> : null}
        {state === 'wrong' ? <Icon name="close" size={16} color={colors.danger} style={styles.choiceMark} /> : null}
      </Pressable>
    </AnswerMotion>
  );
}

/** The round so far: a dot for each first try, green when it was right and red when it was not (the word sets' round too). */
export function Dots({ results, label }: { results: Array<boolean | null>; label?: string }): React.JSX.Element {
  const { colors } = useTheme();
  const dir = useDirection();
  return (
    <View
      style={[styles.dots, { flexDirection: dir.row }]}
      accessible={!!label}
      accessibilityLabel={label}
      importantForAccessibility={label ? 'yes' : 'no-hide-descendants'}
      accessibilityElementsHidden={!label}
    >
      {results.map((r, i) => (
        <View key={i} style={[styles.dot, { backgroundColor: r === true ? colors.success : r === false ? colors.danger : colors.textSecondary }, r === null && styles.dotOpen]} />
      ))}
    </View>
  );
}

/** Why the answer is what it is: the letter, its sound, a word with it in. */
function Explain({ q, audio, player }: { q: AlphabetQuestion; audio: AlphabetAudio; player: ClipPlayer }): React.JSX.Element | null {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const box = [styles.explain, { backgroundColor: colors.controlTrack }];
  const line = (children: React.ReactNode, key?: string) => (
    <View key={key} style={[styles.explainLine, { flexDirection: dir.row }]}>
      {children}
    </View>
  );

  if (q.kind === 'pair') {
    return (
      <View style={box}>
        <Text style={[styles.explainNote, dir.text, { color: colors.textSecondary }]}>{t('alphabet.practice.pairWhy')}</Text>
        {[q.pair.a, q.pair.b].map((w) =>
          line(
            <>
              <Glyph o={{ id: w.word, text: w.word, script: 'kmr' }} size={typography.sizes.lg} />
              <Meaning meaning={w.meaning} script="kmr" style={styles.flex} />
              <PlayButton src={audio.sounds.pairWord(w.word)} label={t('alphabet.listenWord')} player={player} />
            </>,
            w.word,
          ),
        )}
      </View>
    );
  }

  if (q.topic.script === 'kmr') {
    const l = LATIN_LETTERS.find((x) => x.id === q.topic.id);
    if (!l) return null;
    const like = compareLocaleOf(locale) ? likeFor(l.id, locale) : null;
    return (
      <View style={box}>
        {line(
          <>
            <Glyph o={{ id: l.id, text: `${l.upper} ${l.id}`, script: 'kmr' }} size={typography.sizes.xl} />
            <View style={styles.flex}>
              {like ? (
                <Like like={like} style={[styles.explainLike, dir.text]} />
              ) : l.sorani ? (
                <Text style={[styles.explainLike, dir.text, { color: colors.textPrimary }]} accessibilityLanguage="ckb">
                  {l.sorani}
                </Text>
              ) : null}
            </View>
            <PlayButton src={audio.sounds.latinSound(l.id)} label={t('alphabet.listen')} player={player} />
          </>,
        )}
        {line(
          <>
            <Glyph o={{ id: l.word, text: l.word, script: 'kmr' }} size={typography.sizes.lg} />
            <Meaning meaning={l.meaning} script="kmr" style={styles.flex} />
            <PlayButton src={audio.sounds.latinWord(l.id)} label={t('alphabet.listenWord')} player={player} />
          </>,
        )}
      </View>
    );
  }

  const l = SORANI_LETTERS.find((x) => x.id === q.topic.id);
  if (!l) return null;
  return (
    <View style={box}>
      {line(
        <>
          <Glyph o={{ id: l.id, text: l.char, script: 'ckb' }} size={typography.sizes.xl} />
          <View style={styles.flex}>
            {l.latin ? <Text style={[styles.explainNote, dir.text, { color: colors.textSecondary }]}>{`${t('alphabet.inKurmanci')}: ${l.latin}`}</Text> : null}
          </View>
          <PlayButton src={audio.sounds.soraniSound(l)} label={t('alphabet.listen')} player={player} />
        </>,
      )}
      {line(
        <>
          <Glyph o={{ id: l.word, text: l.word, script: 'ckb' }} size={typography.sizes.lg} />
          <Meaning meaning={l.meaning} script="ckb" style={styles.flex} />
          <PlayButton src={audio.sounds.soraniWord(l)} label={t('alphabet.listenWord')} player={player} />
        </>,
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.lg, padding: spacing.md + 4, gap: spacing.sm + 4 },
  title: { ...display(typography.sizes.lg) },
  body: { fontSize: typography.sizes.sm, lineHeight: 21 },
  action: { alignSelf: 'flex-start' },
  flex: { flex: 1 },

  question: { gap: spacing.sm + 4 },
  top: { alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, minHeight: 22 },
  pill: { borderRadius: radii.pill, paddingHorizontal: spacing.sm + 2, paddingVertical: 3 },
  pillText: { fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold },
  ask: { fontSize: typography.sizes.md },
  prompt: { alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm + 6, minHeight: 56 },
  staged: { alignItems: 'center', gap: spacing.sm },
  promptMeaning: { fontSize: typography.sizes.md, flexShrink: 1 },
  promptLike: { flexShrink: 1 },
  form: { alignItems: 'center', gap: 2, minWidth: 84, borderRadius: radii.md, paddingHorizontal: spacing.md, paddingTop: spacing.xs, paddingBottom: spacing.sm },
  formLabel: { fontSize: typography.sizes.xs },

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
  explain: { borderRadius: radii.md, padding: spacing.sm + 4, gap: spacing.sm },
  explainLine: { alignItems: 'center', gap: spacing.sm + 4 },
  explainLike: { fontSize: typography.sizes.md, lineHeight: 22 },
  explainNote: { fontSize: typography.sizes.sm },

  dots: { flexWrap: 'wrap', gap: 6 },
  dot: { width: 10, height: 10, borderRadius: radii.pill },
  // still to come: the grey of the words, faint, so it shows on the card in either theme
  dotOpen: { opacity: 0.3 },

  done: { gap: spacing.sm + 4 },
  score: { ...display(typography.sizes.xl) },
  review: { flexWrap: 'wrap', gap: spacing.sm },
  reviewTile: { minWidth: 56, minHeight: 56, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.sm },
  actions: { flexWrap: 'wrap', gap: spacing.sm },
});

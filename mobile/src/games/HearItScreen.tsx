import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import {
  CHARACTER_NAMES,
  HEAR_STAGES,
  hearItClipPath,
  learnGame,
  meaningIn,
  type GameDialect,
  type HearItCorrection,
  type HearItHint,
  type HearItItemView,
  type HearStage,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { TONES } from '../coursemap/path';
import { KurdishAnswerInput } from '../lesson/components/KurdishAnswerInput';
import { useAudio } from '../lesson/useAudio';
import { useCourseDialect } from '../learn/courseDialect';
import { useDirection } from '../reports/direction';
import { timing } from '../theme/animate';
import { Icon } from '../theme/Icon';
import { PressableScale } from '../theme/MotionParts';
import { Tile, TileButton, type TileState } from '../theme/Tile';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { SoloGameShell, type SoloRound } from './SoloGameShell';
import { useAvailability, useOpenRound } from './learnGames';

/**
 * Hear It, Find It on the phone.
 *
 * The stage is a small radio: a speaker grille, one big play key, and a row
 * of sound-wave bars that rise and fall while a person's voice plays and lie
 * still when it stops. Under it a gentle counter of the replays left — a dot
 * for each, emptied as it is used. When the same words come back in another
 * voice, a tag on the radio says so, and the character a recording is shown
 * with is named on it.
 *
 * The clip plays from its handle for this round (`hearItClipPath`): its
 * address never says what is said. The first play starts once the clip has
 * loaded; a play that fails gives its count back.
 *
 * Then the rung's question: four tiles that light up when one is taken —
 * how a word or a sentence is written, or what a phrase means — or, on the
 * last rung, a field with the key bar. A wrong first pick is greyed out; a
 * wrong typed try marks the words right where they stand. Once an item is
 * done the radio plays freely and what was said is shown with its meaning.
 *
 * Soranî tiles and fields read right to left. Under Reduce Motion the bars
 * stand still and the colours alone say what is playing. The website's
 * games/HearIt.tsx stages the same round.
 */

type Round = SoloRound<HearItItemView, HearItHint, HearItCorrection>;

const GAME = learnGame('hear-it');

export const STAGE_KEY: Record<HearStage, TranslationKey> = {
  word: 'games.hear.stage.word',
  phrase: 'games.hear.stage.phrase',
  sentence: 'games.hear.stage.sentence',
  type: 'games.hear.stage.type',
};

const WHY_KEY: Record<HearStage, TranslationKey> = {
  word: 'games.hear.why.word',
  phrase: 'games.hear.why.phrase',
  sentence: 'games.hear.why.sentence',
  type: 'games.hear.why.type',
};

/** The wave's bars and how tall each stands at its loudest, a little out of step with the next. */
const BARS = [0.5, 0.8, 0.6, 1, 0.7, 0.9, 0.55, 0.75, 0.45];

/** One bar of the wave: still at rest, rising and falling while a voice plays (still under Reduce Motion). */
function Bar({ peak, i, playing, color }: { peak: number; i: number; playing: boolean; color: string }): React.JSX.Element {
  const reduce = useReducedMotion();
  const level = useRef(new Animated.Value(0.18)).current;
  useEffect(() => {
    if (!playing || reduce) {
      level.setValue(playing ? 0.6 * peak : 0.18);
      return;
    }
    const loop = Animated.loop(Animated.sequence([timing(level, peak, 280 + (i % 3) * 90), timing(level, 0.25, 300 + (i % 2) * 110)]));
    loop.start();
    return () => loop.stop();
  }, [playing, reduce, level, peak, i]);
  return <Animated.View style={[styles.bar, { backgroundColor: color, opacity: playing ? 0.95 : 0.45, transform: [{ scaleY: level }] }]} />;
}

function Radio({ item, url, done }: { item: HearItItemView; url: string; done: boolean }): React.JSX.Element {
  const { colors, scheme } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const tone = TONES[scheme][GAME.tone];
  const audio = useAudio(url);
  const [plays, setPlays] = useState(0);
  const started = useRef<string | null>(null);
  const allowed = 1 + item.replays;
  const left = Math.max(0, allowed - plays);
  const can = done || plays < allowed;

  // the clip plays once it has loaded, the first time only
  useEffect(() => {
    if (audio.source !== url || started.current === url) return;
    started.current = url;
    setPlays(1);
    audio.play();
  }, [audio, url]);
  // a play that never sounded is not one of the player's plays
  useEffect(() => {
    if (audio.error) setPlays((n) => Math.max(0, n - 1));
  }, [audio.error]);

  const listen = (): void => {
    if (!can) return;
    if (!done) setPlays((n) => n + 1);
    audio.play();
  };

  return (
    <View style={[styles.radio, { backgroundColor: colors.surface, borderColor: tone.fill }]}>
      <View style={[styles.top, { flexDirection: dir.row }]}>
        <View style={styles.grille} aria-hidden>
          {Array.from({ length: 24 }, (_, i) => (
            <View key={i} style={[styles.hole, { backgroundColor: colors.textSecondary }]} />
          ))}
        </View>
        {item.speaker ? <Text style={[styles.tag, { backgroundColor: colors.controlTrack, color: colors.textPrimary }]}>{t('games.hear.speaker', { name: CHARACTER_NAMES[item.speaker] })}</Text> : null}
        {item.newVoice ? <Text style={[styles.tag, { backgroundColor: tone.fill, color: tone.ink }]}>{t('games.hear.newVoice')}</Text> : null}
      </View>
      <View style={[styles.dial, { flexDirection: dir.row }]}>
        <PressableScale
          onPress={listen}
          disabled={!can}
          accessibilityRole="button"
          accessibilityLabel={plays === 0 ? t('games.hear.play') : t('games.hear.replay')}
          accessibilityState={{ disabled: !can }}
          style={[styles.play, { backgroundColor: tone.fill, opacity: can ? 1 : 0.45 }]}
        >
          <Icon name="audio-play" size={30} color={tone.ink} />
        </PressableScale>
        <View style={[styles.wave, { flexDirection: dir.row }]} aria-hidden>
          {BARS.map((peak, i) => (
            <Bar key={i} peak={peak} i={i} playing={audio.playing} color={tone.fill} />
          ))}
        </View>
      </View>
      <View style={[styles.count, { flexDirection: dir.row }]} accessibilityLiveRegion="polite">
        {done ? (
          <Text style={[styles.countText, { color: colors.textSecondary }]}>{t('games.hear.free')}</Text>
        ) : (
          <>
            <View style={[styles.dots, { flexDirection: dir.row }]} aria-hidden>
              {Array.from({ length: item.replays }, (_, i) => (
                <View key={i} style={[styles.dot, { borderColor: tone.fill, backgroundColor: i < Math.min(left, item.replays) ? tone.fill : 'transparent' }]} />
              ))}
            </View>
            <Text style={[styles.countText, { color: colors.textSecondary }]}>
              {left > 0 ? t('games.hear.replaysLeft', { n: Math.min(left, item.replays) }) : t('games.hear.noReplays')}
            </Text>
          </>
        )}
      </View>
      {audio.error ? <Text style={[dir.text, { color: colors.danger }]}>{t('games.hear.cantPlay')}</Text> : null}
    </View>
  );
}

function HearBoard({ round, dialect }: { round: Round; dialect: GameDialect }): React.JSX.Element {
  const { client } = useAuth();
  const { colors, scheme } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const tone = TONES[scheme][GAME.tone];
  const { sessionId, item, result, busy, submit } = round;
  const rtl = dialect === 'ckb';
  const url = `${client.baseUrl}${hearItClipPath(sessionId, item.clip)}`;
  const [picked, setPicked] = useState<number | null>(null);
  const [struck, setStruck] = useState<number[]>([]);
  const [typed, setTyped] = useState('');
  const [tried, setTried] = useState<string | null>(null);
  const done = result?.done === true;
  const locked = done || busy;
  const correction = done ? result?.correction : null;

  useEffect(() => {
    setPicked(null);
    setStruck([]);
    setTyped('');
    setTried(null);
  }, [item.index]);

  useEffect(() => {
    if (!result || result.done || result.correct) return;
    const s = result.hint?.struck;
    if (typeof s === 'number') {
      setStruck((was) => (was.includes(s) ? was : [...was, s]));
      setPicked(null);
    }
  }, [result]);

  const choose = (i: number): void => {
    if (locked || struck.includes(i)) return;
    setPicked(i);
    void submit({ choice: i });
  };

  const choices: Array<{ text: string; kurdish: boolean }> | null = item.options
    ? item.options.map((o) => ({ text: o, kurdish: true }))
    : item.meanings
      ? item.meanings.map((m) => ({ text: meaningIn(m, locale) ?? '', kurdish: false }))
      : null;
  const marks = !done && result && !result.correct ? result.hint?.right : null;
  const verdict: 'right' | 'wrong' | null = result ? (result.correct ? 'right' : result.done ? 'wrong' : null) : null;
  const meaning = correction ? meaningIn(correction.meanings, locale) : null;

  return (
    <View style={styles.board}>
      <Text style={[styles.kicker, dir.text, { color: tone.text }]}>{t(STAGE_KEY[item.stage])}</Text>
      <Radio item={item} url={url} done={done} />

      {choices ? (
        <View style={styles.choices} accessibilityLabel={t('games.hear.options')} testID="hear-choices">
          {choices.map((c, i) => {
            const right = correction?.choice === i;
            const state: TileState = done ? (right ? 'right' : picked === i ? 'wrong' : 'disabled') : struck.includes(i) ? 'spent' : picked === i ? 'picked' : 'idle';
            return (
              <Tile
                key={i}
                label={c.text}
                state={state}
                disabled={locked || struck.includes(i)}
                onPress={() => choose(i)}
                accessibilityLabel={struck.includes(i) && !done ? `${c.text}, ${t('games.hear.struck')}` : c.text}
                textStyle={c.kurdish && rtl ? styles.rtl : null}
              />
            );
          })}
        </View>
      ) : (
        <View style={styles.typed}>
          <KurdishAnswerInput
            key={item.index}
            text={typed}
            onChangeText={setTyped}
            dialect={rtl ? 'sorani' : 'kurmanci'}
            disabled={locked}
            placeholder={t('games.hear.typeLabel')}
            placeholderTextColor={colors.textSecondary}
            accessibilityLabel={t('games.hear.typeLabel')}
            verdict={verdict}
            style={[styles.input, { color: colors.textPrimary, borderColor: colors.controlTrack }]}
          />
          {marks && marks.length > 0 ? (
            // one mark per typed word, running the way the words run
            <View style={[styles.marks, { flexDirection: rtl ? 'row-reverse' : 'row' }]} accessibilityLabel={t('games.hear.hintTyped')}>
              {marks.map((ok, i) => (
                <View
                  key={i}
                  accessible
                  accessibilityLabel={ok ? t('games.solo.right') : t('games.hear.notThis')}
                  style={[styles.mark, { backgroundColor: ok ? colors.successFill : colors.dangerFill }]}
                >
                  <Icon name={ok ? 'check' : 'close'} size={14} color={ok ? colors.success : colors.danger} />
                </View>
              ))}
            </View>
          ) : null}
          {!done ? (
            <TileButton
              label={result && !result.correct ? t('games.solo.tryAgain') : t('games.solo.check')}
              onPress={() => {
                const text = typed.trim();
                if (!text || tried === text) return;
                setTried(text);
                void submit({ text });
              }}
              busy={busy}
              disabled={locked || typed.trim() === '' || tried === typed.trim()}
            />
          ) : null}
        </View>
      )}

      {!done && result && !result.correct ? (
        <Text style={[dir.text, styles.hint, { color: colors.textSecondary }]}>
          {typeof result.hint?.struck === 'number' ? t('games.hear.hintStruck') : t('games.hear.hintTyped')}
        </Text>
      ) : null}

      {correction ? (
        <View style={[styles.said, dir.rtl ? styles.edgeRight : styles.edgeLeft, { backgroundColor: colors.surface, borderColor: tone.fill }]} accessibilityLabel={t('games.hear.said')}>
          <Text style={[styles.saidLabel, dir.text, { color: colors.textSecondary }]}>{t('games.hear.said')}</Text>
          <Text style={[styles.saidText, { color: tone.text }, rtl ? styles.rtlText : null]}>{correction.text}</Text>
          {meaning ? <Text style={[dir.text, styles.saidMeaning, { color: colors.textSecondary }]}>{meaning}</Text> : null}
          {correction.verdict === 'typo' ? <Text style={[dir.text, styles.note, { color: colors.textSecondary }]}>{t('games.hear.typo')}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

/** The ladder a round climbs, for the intro: four rungs, the last for the advanced round only. */
function HearLadder(): React.JSX.Element {
  const { colors, scheme } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const tone = TONES[scheme][GAME.tone];
  return (
    <View style={styles.ladder}>
      <Text style={[styles.ladderTitle, dir.text, { color: colors.textSecondary }]} accessibilityRole="header">
        {t('games.hear.ladder')}
      </Text>
      {HEAR_STAGES.map((stage, i) => (
        <View key={stage} style={[styles.rung, { flexDirection: dir.row }]}>
          <View style={[styles.rungN, { backgroundColor: tone.fill }]}>
            <Text style={[styles.rungNText, { color: tone.ink }]}>{i + 1}</Text>
          </View>
          <Text style={[styles.rungName, { color: colors.textPrimary }]}>{t(STAGE_KEY[stage])}</Text>
          {stage === 'type' ? (
            <Text style={[styles.rungMeta, { backgroundColor: colors.controlTrack, color: colors.textSecondary }]}>{t('games.hear.ladder.advanced')}</Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

export function HearItScreen({ onExit }: { onExit: () => void }): React.JSX.Element {
  const { t } = useI18n();
  const { scheme } = useTheme();
  const dialect = useCourseDialect();
  const availability = useAvailability(dialect);
  const open = useOpenRound('hear-it', dialect);
  const game = availability?.games.find((g) => g.id === 'hear-it');
  const difficulties = availability ? (game?.difficulties ?? []) : null;
  return (
    <SoloGameShell<HearItItemView, HearItHint, HearItCorrection>
      game="hear-it"
      dialect={dialect}
      title={t('games.hear.name')}
      blurb={t('games.hear.intro')}
      intro={<HearLadder />}
      difficulties={difficulties}
      open={open}
      renderRound={(round) => <HearBoard round={round} dialect={dialect} />}
      explain={(why) => (why in WHY_KEY ? t(WHY_KEY[why as HearStage]) : null)}
      onExit={onExit}
      tone={TONES[scheme][GAME.tone].fill}
    />
  );
}

const styles = StyleSheet.create({
  board: { gap: spacing.lg },
  kicker: { fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold },
  radio: { borderRadius: radii.xl, borderWidth: 2, padding: spacing.md, gap: spacing.md },
  top: { alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  grille: { flex: 1, minWidth: 96, flexDirection: 'row', flexWrap: 'wrap', gap: 6, height: 20, overflow: 'hidden' },
  hole: { width: 4, height: 4, borderRadius: radii.pill, opacity: 0.5 },
  tag: { fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold, borderRadius: radii.pill, paddingHorizontal: spacing.sm, paddingVertical: 2, overflow: 'hidden' },
  dial: { alignItems: 'center', gap: spacing.lg },
  play: { width: 72, height: 72, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  wave: { flex: 1, height: 56, alignItems: 'center', justifyContent: 'space-between' },
  bar: { width: 6, height: 56, borderRadius: radii.pill },
  count: { alignItems: 'center', gap: spacing.sm, minHeight: 24 },
  countText: { fontSize: typography.sizes.sm },
  dots: { gap: 6 },
  dot: { width: 10, height: 10, borderRadius: radii.pill, borderWidth: 2 },
  choices: { gap: spacing.sm },
  typed: { gap: spacing.sm },
  input: { borderWidth: 1, borderRadius: radii.md, minHeight: MIN_TOUCH_TARGET, paddingHorizontal: spacing.md, fontSize: typography.sizes.lg },
  marks: { flexWrap: 'wrap', gap: 6 },
  mark: { width: 28, height: 28, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  hint: { fontSize: typography.sizes.sm },
  said: { borderRadius: radii.lg, borderWidth: 1, padding: spacing.md, gap: spacing.xs },
  // the coloured edge on the side the reader's language starts from
  edgeLeft: { borderLeftWidth: 4 },
  edgeRight: { borderRightWidth: 4 },
  saidLabel: { fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold },
  saidText: { fontSize: typography.sizes.xl, fontWeight: typography.weights.semibold },
  saidMeaning: { fontSize: typography.sizes.md },
  note: { fontSize: typography.sizes.xs },
  rtl: { writingDirection: 'rtl' },
  rtlText: { writingDirection: 'rtl', textAlign: 'right' },
  ladder: { gap: spacing.sm },
  ladderTitle: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  rung: { alignItems: 'center', gap: spacing.sm, minHeight: MIN_TOUCH_TARGET },
  rungN: { width: 32, height: 32, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  rungNText: { fontWeight: typography.weights.bold, fontSize: typography.sizes.sm },
  rungName: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  rungMeta: { fontSize: typography.sizes.xs, borderRadius: radii.pill, paddingHorizontal: spacing.sm, overflow: 'hidden' },
});

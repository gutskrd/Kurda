import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useNavigation } from '@react-navigation/native';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  PROVERB_ROUND_MODES,
  originalLocale,
  type GameDialect,
  type ProverbRoundItemView,
  type ProverbRoundMode,
  type SoloItemState,
  type SoloResults,
} from '@kurda/shared';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { describeError } from '../api/errors';
import type { ApiError } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { haptic } from '../feedback/haptics';
import { Stones } from '../games/SoloGameShell';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import type { RootNavigation } from '../navigation/rootStack';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { useDirection } from '../reports/direction';
import { COLUMN } from '../stories/ui';
import { display } from '../theme/fonts';
import { GradientBackground } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { heldDim } from '../theme/MotionParts';
import { Pressable } from '../theme/Pressable';
import { Tile, TileButton, type TileState } from '../theme/Tile';
import { useTheme } from '../theme/ThemeProvider';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { answerProverbRound, finishProverbRound, getProverbRound, openProverbRound, startProverbRound, type ProverbRoundResult, type ProverbRoundView } from './api';
import { PROVERBS_NAME, centred, kurdishIn, textIn } from './labels';
import { dialectNameKey } from '../i18n/dialectName';

const MODE_KEY: Record<ProverbRoundMode, { name: TranslationKey; line: TranslationKey; ask: TranslationKey }> = {
  meaning: { name: 'lore.round.meaning', line: 'lore.round.meaningLine', ask: 'lore.round.askMeaning' },
  situation: { name: 'lore.round.situation', line: 'lore.round.situationLine', ask: 'lore.round.askSituation' },
  complete: { name: 'lore.round.mode.complete', line: 'lore.round.mode.completeLine', ask: 'lore.round.ask.complete' },
};

type Phase = 'intro' | 'round' | 'results';

function nextOpen(states: readonly SoloItemState[]): number {
  const at = states.findIndex((s) => !s.done);
  return at < 0 ? states.length : at;
}

/**
 * A short round on the proverbs, in the way the games played alone go on
 * the phone (games/SoloGameShell): a start with the two kinds of round to
 * choose from — what a proverb means, or which proverb fits a little scene —
 * and the round left unfinished to go back to; five items, a stone each,
 * three choices, a second try with the first one crossed out, and after each
 * item the proverb it was about with what it means, and a way to its page;
 * and results that say exactly what happened.
 *
 * The round is the server's: made there with its answers kept there, checked
 * there, counted there. It pays no XP, as no game played alone does, and the
 * results say so in the same quiet line the games use; at least half right
 * on the first try counts for the streak and the day.
 *
 * The choices are in one language for the whole round — the reader's when
 * enough proverbs are translated into it, else English — and set in that
 * language's direction; the proverbs themselves are in their own Kurdish.
 */
export function ProverbRoundScreen({ dialect, mode: asked, onExit }: { dialect: GameDialect; mode?: ProverbRoundMode; onExit: () => void }): React.JSX.Element {
  const { client } = useAuth();
  const navigation = useNavigation<RootNavigation>();
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const [phase, setPhase] = useState<Phase>('intro');
  const [mode, setMode] = useState<ProverbRoundMode>(asked ?? 'meaning');
  const [open, setOpen] = useState<string | null>(null);
  const [session, setSession] = useState<ProverbRoundView | null>(null);
  const [index, setIndex] = useState(0);
  const [result, setResult] = useState<ProverbRoundResult | null>(null);
  const [results, setResults] = useState<SoloResults | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [struck, setStruck] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // the round of this kind left unfinished, offered first
  useEffect(() => {
    let live = true;
    setOpen(null);
    void openProverbRound(client, dialect, mode).then((res) => {
      if (live && res.ok) setOpen(res.data.id);
    });
    return () => {
      live = false;
    };
  }, [client, dialect, mode]);

  const fail = useCallback(
    (e: ApiError) => {
      if (e.code === 'GAME_SESSION_EXPIRED') {
        setError(t('games.solo.expired'));
        setSession(null);
        setPhase('intro');
      } else if (e.code === 'NOT_ENOUGH_CONTENT') setError(t('lore.round.notEnough'));
      else setError(describeError(e, t));
    },
    [t],
  );

  const begin = (view: ProverbRoundView): void => {
    setSession(view);
    setIndex(nextOpen(view.states));
    setResult(null);
    setResults(null);
    setPicked(null);
    setStruck([]);
    setError(null);
    setPhase('round');
  };

  const finish = async (id: string): Promise<void> => {
    setBusy(true);
    const res = await finishProverbRound(client, id);
    setBusy(false);
    if (!res.ok) return fail(res.error);
    setResults(res.data);
    setOpen(null);
    setPhase('results');
    if (res.data.learningCounted) haptic('celebrate');
  };

  const start = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await startProverbRound(client, dialect, mode);
    setBusy(false);
    if (!res.ok) return fail(res.error);
    begin(res.data);
  };

  const resume = async (): Promise<void> => {
    if (!open || busy) return;
    setBusy(true);
    const res = await getProverbRound(client, open);
    setBusy(false);
    if (!res.ok) return fail(res.error);
    if (res.data.expired) return fail({ kind: 'client', status: 410, message: '', code: 'GAME_SESSION_EXPIRED' });
    begin(res.data);
    if (nextOpen(res.data.states) >= res.data.items.length) await finish(res.data.id);
  };

  const choose = async (choice: number): Promise<void> => {
    if (!session || busy || struck.includes(choice) || result?.done) return;
    const state = session.states[index]!;
    setPicked(choice);
    setBusy(true);
    const res = await answerProverbRound(client, session.id, index, choice, state.attempts + 1);
    setBusy(false);
    if (!res.ok) {
      setPicked(null);
      return fail(res.error);
    }
    const r = res.data;
    setResult(r);
    haptic(r.correct ? 'correct' : 'wrong');
    if (!r.correct && !r.done && typeof r.hint?.struck === 'number') {
      const s = r.hint.struck;
      setStruck((was) => (was.includes(s) ? was : [...was, s]));
      setPicked(null);
    }
    setSession((s) =>
      s ? { ...s, states: s.states.map((st) => (st.index === index ? { index, attempts: r.attempt, correct: r.correct, firstTry: r.firstTry, done: r.done } : st)) } : s,
    );
  };

  const next = (): void => {
    if (!session) return;
    const at = nextOpen(session.states);
    if (at >= session.items.length) {
      void finish(session.id);
      return;
    }
    setIndex(at);
    setResult(null);
    setPicked(null);
    setStruck([]);
  };

  const text = [dir.text, { color: colors.textPrimary }];
  const muted = [dir.text, styles.muted, { color: colors.textSecondary }];
  const variety = t('games.solo.variety', { variety: t(dialectNameKey(dialect)) });

  let body: ReactNode;
  if (phase === 'results' && results && session) {
    body = (
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.title, ...text]} accessibilityRole="header">
          {t('games.solo.results.title')}
        </Text>
        <Text style={[styles.score, ...text]}>{t('games.solo.results.score', { correct: results.correct, total: results.total })}</Text>
        <Stones states={session.states} here={null} tone={colors.gold} />
        <Text style={muted}>{t('games.solo.results.firstTry', { n: results.firstTry })}</Text>
        {results.learningCounted ? (
          <Text style={muted}>{t('games.solo.results.streak')}</Text>
        ) : (
          <Text style={[...text, styles.honest]}>{t('games.solo.results.notCounted', { needed: results.needed, correct: results.firstTry })}</Text>
        )}
        <Text style={muted}>{t('games.noXpAlone')}</Text>
        {error ? <Text style={[dir.text, { color: colors.danger }]}>{error}</Text> : null}
        <View style={styles.actions}>
          <TileButton label={t('games.solo.playAgain')} onPress={() => void start()} busy={busy} />
          <TileButton label={t('common.done')} onPress={onExit} tone="success" />
        </View>
      </ScrollView>
    );
  } else if (phase === 'round' && session) {
    const item = session.items[Math.min(index, session.items.length - 1)]!;
    const total = session.items.length;
    const last = session.states.every((s) => s.done || s.index === index);
    body = (
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.bar, { flexDirection: dir.row }]}>
          <Stones states={session.states} here={index} tone={colors.gold} />
          <Text style={[styles.count, { color: colors.textSecondary }]}>{t('games.solo.progress', { n: index + 1, total })}</Text>
        </View>
        <RoundItem
          item={item}
          result={result}
          picked={picked}
          struck={struck}
          busy={busy}
          onChoose={(c) => void choose(c)}
          onAbout={(slug) => navigation.navigate('Proverb', { slug })}
          onNext={next}
          last={last}
        />
        {error ? <Text style={[dir.text, { color: colors.danger }]}>{error}</Text> : null}
      </ScrollView>
    );
  } else {
    body = (
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.kicker, ...muted]} accessibilityLanguage="ku">
          {PROVERBS_NAME}
        </Text>
        <Text style={[styles.title, ...text]} accessibilityRole="header">
          {t('lore.round.play')}
        </Text>
        <Text style={[...text, styles.blurb]}>{t('lore.round.blurb')}</Text>
        <Text style={muted}>{variety}</Text>
        <View style={styles.modes} accessibilityRole="radiogroup" accessibilityLabel={t('lore.round.mode')}>
          {PROVERB_ROUND_MODES.map((m) => {
            const on = m === mode;
            return (
              <Pressable
                key={m}
                onPress={() => {
                  if (!on) haptic('select');
                  setMode(m);
                }}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                accessibilityLabel={t(MODE_KEY[m].name)}
                accessibilityHint={t(MODE_KEY[m].line)}
                style={({ pressed }) => [
                  styles.mode,
                  { flexDirection: dir.row, backgroundColor: colors.surface, borderColor: on ? colors.primary : 'transparent' },
                  pressed && heldDim,
                ]}
              >
                <View style={[styles.radio, { borderColor: on ? colors.primary : colors.textSecondary }]}>
                  {on ? <View style={[styles.radioDot, { backgroundColor: colors.primary }]} /> : null}
                </View>
                <View style={styles.modeText}>
                  <Text style={[styles.modeName, ...text]}>{t(MODE_KEY[m].name)}</Text>
                  <Text style={[styles.modeLine, dir.text, { color: colors.textSecondary }]}>{t(MODE_KEY[m].line)}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
        {open ? <TileButton label={t('games.solo.continue')} onPress={() => void resume()} busy={busy} tone="success" /> : null}
        <TileButton label={t('games.solo.start')} onPress={() => void start()} busy={busy} testID="proverb-round-start" />
        <Text style={muted}>{t('games.noXpAlone')}</Text>
        {error ? <Text style={[dir.text, { color: colors.danger }]}>{error}</Text> : null}
      </ScrollView>
    );
  }

  return (
    <GradientBackground>
      <ScreenHeader
        title={t('lore.proverbs.name')}
        onBack={onExit}
        leading={phase === 'round' ? 'close' : 'back'}
        backLabel={phase === 'round' ? t('games.solo.exit') : undefined}
      />
      {body}
    </GradientBackground>
  );
}

/**
 * One item: the question in the round's language, the proverb (or the scene)
 * it is about, its three choices, and once it is done the right one with the
 * proverb's meaning and the way to its page.
 */
function RoundItem({
  item,
  result,
  picked,
  struck,
  busy,
  onChoose,
  onAbout,
  onNext,
  last,
}: {
  item: ProverbRoundItemView;
  result: ProverbRoundResult | null;
  picked: number | null;
  struck: readonly number[];
  busy: boolean;
  onChoose: (choice: number) => void;
  onAbout: (slug: string) => void;
  onNext: () => void;
  last: boolean;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const ku = kurdishIn(item.dialect);
  const round = textIn(item.locale);
  const done = result?.done === true;
  const correction = done ? result?.correction : null;
  // the choices are meanings in the round's language, or proverbs in their own Kurdish
  const optionSet = item.mode === 'meaning' ? round : ku;
  const english = item.locale === 'en' && locale !== 'en' && locale !== originalLocale(item.dialect);
  const verdict = result
    ? result.correct
      ? t(result.firstTry ? 'games.solo.rightFirstTry' : 'games.solo.right')
      : result.done
        ? t('games.solo.answerWas')
        : t('lore.round.struck')
    : null;

  return (
    <View style={styles.item}>
      <Text style={[styles.ask, dir.text, { color: colors.textSecondary }]}>{t(MODE_KEY[item.mode].ask)}</Text>
      {item.mode === 'meaning' ? (
        <Text {...ku.props} style={[styles.proverb, { color: colors.textPrimary }, centred(ku.style)]} testID="proverb-round-prompt">
          {item.proverb}
        </Text>
      ) : item.mode === 'complete' ? (
        // the missing word stays a gap until it is found, then shows in its place
        <Text {...ku.props} style={[styles.proverb, { color: colors.textPrimary }, centred(ku.style)]} testID="proverb-round-prompt">
          {`${item.before} ${correction ? item.options[correction.choice] : '…'}${item.after}`}
        </Text>
      ) : (
        <View style={[styles.scene, { backgroundColor: colors.surface }]}>
          <Text {...round.props} style={[styles.sceneText, { color: colors.textPrimary }, round.style]} testID="proverb-round-prompt">
            {item.scene}
          </Text>
        </View>
      )}
      {english ? <Text style={[styles.muted, dir.text, { color: colors.textSecondary }]}>{t('lore.round.inEnglish')}</Text> : null}
      <View style={styles.options} accessibilityLabel={t('lore.round.options')}>
        {item.options.map((o, i) => {
          const right = correction?.choice === i;
          const spent = struck.includes(i);
          const state: TileState = done ? (right ? 'right' : picked === i ? 'wrong' : 'disabled') : spent ? 'spent' : picked === i ? 'picked' : 'idle';
          return (
            <Tile
              key={i}
              label={o}
              state={state}
              disabled={busy || done || spent}
              onPress={() => onChoose(i)}
              accessibilityLabel={spent && !done ? `${o}, ${t('games.hear.struck')}` : o}
              accessibilityLanguage={optionSet.props.accessibilityLanguage}
              textStyle={optionSet.style}
            />
          );
        })}
      </View>
      {verdict ? (
        <View
          accessibilityLiveRegion="polite"
          style={[styles.feedback, { backgroundColor: result?.correct ? colors.successFill : result?.done ? colors.dangerFill : colors.controlTrack }]}
        >
          <View style={[styles.verdictRow, { flexDirection: dir.row }]}>
            {result?.correct ? <Icon name="check" size={18} color={colors.success} /> : null}
            <Text style={[styles.verdict, dir.text, { color: colors.textPrimary }]}>{verdict}</Text>
          </View>
          {correction ? (
            <View style={styles.correction}>
              <Text {...ku.props} style={[styles.correctionText, { color: colors.textPrimary }, ku.style]}>
                {correction.text}
              </Text>
              <Text {...textIn(correction.locale).props} style={[styles.correctionLine, { color: colors.textSecondary }, textIn(correction.locale).style]}>
                {correction.translation}
              </Text>
              <Text {...textIn(correction.locale).props} style={[styles.correctionLine, { color: colors.textPrimary }, textIn(correction.locale).style]}>
                {correction.meaning}
              </Text>
              <Pressable
                onPress={() => onAbout(correction.slug)}
                accessibilityRole="link"
                style={({ pressed }) => [styles.about, { flexDirection: dir.row }, pressed && heldDim]}
              >
                <Text style={[styles.aboutText, { color: colors.primary }]}>{t('lore.round.about')}</Text>
                <Icon name="chevron-right" size={14} color={colors.primary} style={dir.flip ?? undefined} />
              </Pressable>
            </View>
          ) : null}
          {done ? <TileButton label={last ? t('games.solo.seeResults') : t('games.solo.next')} onPress={onNext} busy={busy} /> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { ...COLUMN, paddingHorizontal: layout.gutter, paddingTop: spacing.md, paddingBottom: spacing.xl * 2, gap: spacing.md },
  kicker: { fontSize: typography.sizes.xs, fontWeight: typography.weights.bold, letterSpacing: 1, textTransform: 'uppercase' },
  title: { ...display(typography.sizes.xl) },
  blurb: { fontSize: typography.sizes.md, lineHeight: 24 },
  muted: { fontSize: typography.sizes.sm, lineHeight: 20 },
  honest: { fontSize: typography.sizes.md, lineHeight: 24 },
  score: { ...display(typography.sizes.xxl) },
  modes: { gap: spacing.sm, marginTop: spacing.sm },
  mode: { alignItems: 'center', gap: spacing.md, borderRadius: radii.lg, borderWidth: 2, padding: spacing.md, minHeight: MIN_TOUCH_TARGET },
  radio: { width: 22, height: 22, borderRadius: radii.pill, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: radii.pill },
  modeText: { flex: 1, gap: 2 },
  modeName: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  modeLine: { fontSize: typography.sizes.sm, lineHeight: 20 },
  actions: { gap: spacing.sm, marginTop: spacing.md },
  bar: { alignItems: 'center', gap: spacing.sm },
  count: { fontSize: typography.sizes.xs, fontVariant: ['tabular-nums'] },
  item: { gap: spacing.md },
  ask: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  proverb: { ...display(typography.sizes.xl), lineHeight: Math.round(typography.sizes.xl * 1.35), paddingVertical: spacing.sm },
  scene: { borderRadius: radii.lg, padding: spacing.md },
  sceneText: { fontSize: typography.sizes.md, lineHeight: 26 },
  options: { gap: spacing.sm },
  feedback: { borderRadius: radii.lg, padding: spacing.md, gap: spacing.sm },
  verdictRow: { alignItems: 'center', gap: spacing.xs },
  verdict: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  correction: { gap: spacing.xs },
  correctionText: { ...display(typography.sizes.lg), lineHeight: Math.round(typography.sizes.lg * 1.3) },
  correctionLine: { fontSize: typography.sizes.sm, lineHeight: 21 },
  about: { alignItems: 'center', gap: 4, minHeight: MIN_TOUCH_TARGET, alignSelf: 'flex-start' },
  aboutText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
});

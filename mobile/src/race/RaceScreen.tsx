import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { describeError } from '../api/errors';
import { ClayButton, GlassCard, GradientBackground, Segmented } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { radii, spacing, typography } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { useScreenTopInset } from '../navigation/tabBarLayout';
import { finishRace, startRace, type RaceGame, type RaceLength, type RaceResult } from './raceApi';

const LENGTHS: readonly RaceLength[] = [1, 2, 3];

const LENGTH_KEY: Record<RaceLength, TranslationKey> = {
  1: 'games.race.short',
  2: 'games.race.medium',
  3: 'games.race.long',
};

/** How often the on-screen clock ticks. The score is timed server-side. */
const TICK_MS = 100;

/**
 * Typing Race (KUR-307) on the phone: type a Kurdish text against the clock.
 *
 * The one game of the four with no lobby and no invite — it is a solo time
 * trial. Speed is the server's to decide (it timed the handover), so the timer
 * here is for the racer and is never sent.
 *
 * The text and the box you type into are the same thing, as they are in the
 * browser. Two of them would mean the target sat there as ordinary prose above
 * an input — and on a phone, "select all, paste" is two taps. The characters
 * colour themselves as you go and the field that takes the keys is an
 * invisible layer over the top.
 */
export function RaceScreen({ onExit }: { onExit: () => void }): React.JSX.Element {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const topInset = useScreenTopInset();

  const [game, setGame] = useState<RaceGame | null>(null);
  const [length, setLength] = useState<RaceLength>(1);
  const [typed, setTyped] = useState('');
  const [result, setResult] = useState<RaceResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef<number | null>(null);
  const inputRef = useRef<TextInput>(null);

  const target = game?.text.body ?? '';
  const chars = useMemo(() => [...target], [target]);
  const typedChars = useMemo(() => [...typed], [typed]);
  const progress = chars.length === 0 ? 0 : Math.min(typedChars.length / chars.length, 1);

  const start = useCallback(async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    setTyped('');
    const res = await startRace(client, length);
    setBusy(false);
    if (res.ok) {
      setGame(res.data);
      startedAt.current = Date.now();
      setElapsed(0);
    } else {
      setGame(null);
      setError(res.error.code === 'EMPTY_RACE_POOL' ? t('games.race.emptyPool') : describeError(res.error, t));
    }
  }, [client, length, t]);

  /*
   * Typing begins the moment the text appears, and the clock is already
   * running — so the field takes focus as soon as it exists. On a phone this
   * is also what opens the keyboard.
   */
  useEffect(() => {
    if (game && !result) inputRef.current?.focus();
  }, [game, result]);

  // a running clock, for the racer; the score is timed server-side
  useEffect(() => {
    if (!game || result) return;
    const timer = setInterval(() => {
      if (startedAt.current) setElapsed(Date.now() - startedAt.current);
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [game, result]);

  const finish = useCallback(async () => {
    if (!game || result) return;
    setBusy(true);
    const res = await finishRace(client, game.id, typed);
    setBusy(false);
    if (res.ok) setResult(res.data);
    else setError(describeError(res.error, t));
  }, [client, game, typed, result, t]);

  // reaching the end ends the race; nobody should have to notice they are done
  // and then reach for a button
  useEffect(() => {
    if (game && !result && chars.length > 0 && typedChars.length >= chars.length) void finish();
  }, [typedChars.length, chars.length, game, result, finish]);

  return (
    <GradientBackground>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: topInset }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Pressable onPress={onExit} accessibilityRole="button" accessibilityLabel={t('common.back')} hitSlop={10}>
            <Icon name="chevron-left" size={22} color={colors.textSecondary} />
          </Pressable>
          <Text style={[styles.title, { color: colors.primary }]}>{t('games.race.name')}</Text>
          <View style={styles.headerSpacer} />
        </View>

        {!game ? (
          <GlassCard style={styles.card}>
            <Icon name="bolt" size={44} tone="primary" />
            <Text style={[styles.blurb, { color: colors.textSecondary }]}>{t('games.race.intro')}</Text>
            <Text style={[styles.label, { color: colors.textSecondary }]}>{t('games.race.length')}</Text>
            <View style={styles.stretch}>
              <Segmented<string>
                options={LENGTHS.map(String)}
                value={String(length)}
                onChange={(v) => setLength(Number(v) as RaceLength)}
                labelOf={(v) => t(LENGTH_KEY[Number(v) as RaceLength])}
              />
            </View>
            <ClayButton
              label={busy ? t('games.starting') : t('games.race.start')}
              icon="play"
              tone="primary"
              onPress={() => void start()}
              style={styles.stretch}
            />
            {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
          </GlassCard>
        ) : (
          <>
            <View style={styles.stats}>
              <Text style={[styles.timer, { color: colors.textPrimary }]}>{(elapsed / 1000).toFixed(1)}s</Text>
              <View style={[styles.track, { backgroundColor: colors.controlTrack }]}>
                <View style={[styles.trackFill, { backgroundColor: colors.primary, width: `${progress * 100}%` }]} />
              </View>
              <Text style={[styles.textTitle, { color: colors.textSecondary }]} numberOfLines={1}>
                {game.text.title}
              </Text>
            </View>

            <Pressable onPress={() => inputRef.current?.focus()} style={[styles.typeArea, { borderColor: colors.glassBorder }]}>
              <Text style={styles.raceText}>
                {chars.map((ch, i) => {
                  const got = typedChars[i];
                  const here = i === typedChars.length && !result;
                  return (
                    <Text
                      key={i}
                      style={[
                        styles.raceChar,
                        { color: got === undefined ? colors.textSecondary : got === ch ? colors.success : colors.danger },
                        got !== undefined && got !== ch ? { backgroundColor: colors.dangerFill } : null,
                        here ? { backgroundColor: colors.primary, color: colors.textOnPrimary } : null,
                      ]}
                    >
                      {ch}
                    </Text>
                  );
                })}
              </Text>

              {/*
                The field is here, invisible, on purpose. It is what the keyboard
                types into; the coloured characters above are what you read. RN
                Text is not selectable unless asked, so there is nothing on this
                screen to copy into it.
              */}
              <TextInput
                ref={inputRef}
                value={typed}
                onChangeText={(v) => setTyped([...v].slice(0, chars.length).join(''))}
                editable={!result}
                multiline
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                caretHidden
                accessibilityLabel={t('games.race.typeTheText')}
                style={styles.capture}
              />
            </Pressable>

            {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

            {!result ? (
              <ClayButton
                label={busy ? t('games.race.scoring') : t('games.race.giveUp')}
                tone="neutral"
                onPress={() => void finish()}
                style={styles.stretch}
              />
            ) : (
              <GlassCard style={styles.card}>
                <Text style={[styles.verdict, { color: result.implausible ? colors.danger : colors.primary }]}>
                  {result.implausible
                    ? t('games.race.notScored')
                    : result.perfect
                      ? t('games.race.perfect')
                      : t('games.race.finished')}
                </Text>
                {/*
                  Said out loud rather than shown as a silent zero. Somebody who
                  hits this has almost certainly found a way around the typing
                  box, and a result that just reads 0 looks like a broken game.
                */}
                {result.implausible ? (
                  <Text style={[styles.blurb, { color: colors.textSecondary }]}>{t('games.race.refused')}</Text>
                ) : null}
                <View style={styles.figures}>
                  <Figure value={result.wpm.toFixed(1)} label={t('games.race.wpm')} />
                  <Figure value={`${Math.round(result.accuracy * 100)}%`} label={t('games.race.accuracy')} />
                  <Figure value={`${(result.elapsedMs / 1000).toFixed(1)}s`} label={t('games.race.time')} />
                  {/* XP is the app's own unit and reads the same in every language */}
                  <Figure value={`+${result.xpAwarded}`} label="XP" />
                </View>
                <ClayButton label={t('games.race.again')} tone="primary" onPress={() => void start()} style={styles.stretch} />
              </GlassCard>
            )}
          </>
        )}
      </ScrollView>
    </GradientBackground>
  );
}

function Figure({ value, label }: { value: string; label: string }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={styles.figure}>
      <Text style={[styles.figureValue, { color: colors.primary }]}>{value}</Text>
      <Text style={[styles.figureLabel, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  headerSpacer: { width: 22 },
  title: { flex: 1, textAlign: 'center', fontSize: typography.sizes.xl, fontWeight: typography.weights.bold },
  card: { alignItems: 'center', gap: spacing.sm },
  stretch: { alignSelf: 'stretch', marginTop: spacing.sm },
  blurb: { fontSize: typography.sizes.md, textAlign: 'center', lineHeight: 20 },
  label: { fontSize: typography.sizes.sm, marginTop: spacing.sm },
  error: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold, textAlign: 'center' },
  stats: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  timer: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, fontVariant: ['tabular-nums'] },
  track: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  trackFill: { height: 6, borderRadius: 3 },
  textTitle: { fontSize: typography.sizes.sm, maxWidth: 110 },
  typeArea: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radii.md, padding: spacing.md, minHeight: 180 },
  raceText: { lineHeight: 30 },
  raceChar: { fontSize: typography.sizes.lg },
  // full-bleed and invisible: it takes the keystrokes, the text above is read
  capture: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0, color: 'transparent' },
  verdict: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold, textAlign: 'center' },
  figures: { flexDirection: 'row', flexWrap: 'wrap', alignSelf: 'stretch', rowGap: spacing.md, marginTop: spacing.sm },
  // two across, not four: "words per minute" is PEYV/XULEK in Kurmancî and
  // Wörter/Minute in German, and four of those in a phone's width collide
  figure: { width: '50%', alignItems: 'center' },
  figureValue: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold },
  figureLabel: { fontSize: typography.sizes.xs, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },
});

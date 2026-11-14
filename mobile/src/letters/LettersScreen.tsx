import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { BIRD_OUT_DAYS, PEN_PALS_MAX, type BirdOutResult, type LetterItem, type LetterPerson, type LettersHome } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import type { RootNavigation } from '../navigation/rootStack';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { ClayButton, ErrorRetry, GradientBackground } from '../theme/glass';
import { PressableScale } from '../theme/MotionParts';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { sectionLabel } from '../theme/fonts';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { useI18n } from '../i18n/I18nContext';
import { useDirection } from '../reports/direction';
import { describeError } from '../api/errors';
import type { ApiError } from '../api/types';
import { haptic } from '../feedback/haptics';
import { LetterWindow, type WindowScene } from './LetterWindow';
import { BirdBadge, LetterPaper, LetterSheet } from './LetterParts';
import { letterErrorText } from './errors';

/** What the screen shows under the window: as it stands, writing, a bird on its way, or a letter just come. */
type Moment =
  | { kind: 'rest' }
  | { kind: 'writing' }
  | { kind: 'sent'; result: BirdOutResult }
  /** your bird has flown and is out there waiting: said at once, before the screen has read again */
  | { kind: 'waiting' }
  | { kind: 'arrived'; person: LetterPerson; letter: LetterItem; threadId: string };

/** The window is as wide as the screen allows, and no wider than a hand's width of sky. */
const WINDOW_MAX = 300;

/**
 * Letters by bird, on the phone: writing to somebody new in Kurdish, and the
 * pen pals you write to. The same screen as the website's /app/letters
 * (web/src/letters/LettersPage.tsx).
 *
 * At the top, your window. With your bird at home there is one thing to do —
 * write a letter — and sending it is watched rather than read: the bird takes
 * it in its beak and flies off. If another bird is out, theirs comes to your
 * window in the same moment with their letter, read here at once; if not, the
 * sill stays empty and the screen says, in plain words, that nobody else has
 * sent a bird out yet and yours is waiting for the next one, with the way to
 * call it back.
 *
 * Under it your pen pals, the one most recently written to first, each with
 * whose turn it is, and one short list of how it works. Reporting and
 * blocking are on each correspondence, where they are needed.
 */
export function LettersScreen({ onExit }: { onExit: () => void }): React.JSX.Element {
  const { client } = useAuth();
  const navigation = useNavigation<RootNavigation>();
  const { t } = useI18n();
  const { colors } = useTheme();
  const dir = useDirection();
  const { width } = useWindowDimensions();
  const [home, setHome] = useState<LettersHome | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [moment, setMoment] = useState<Moment>({ kind: 'rest' });
  const [scene, setScene] = useState<WindowScene | null>(null);
  const [busy, setBusy] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [howOpen, setHowOpen] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    const res = await client.get<LettersHome>('/letters');
    if (res.ok) {
      setHome(res.data);
      setError(null);
    } else setError(res.error);
  }, [client]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  // the bird is placed once the page is known: on the sill, or out
  useEffect(() => {
    if (home && !scene) setScene(home.out ? { kind: 'away' } : { kind: 'home', bird: home.bird });
  }, [home, scene]);

  // a window with no width yet (a screen still being laid out) is not drawn until it has one
  const size = Math.max(0, Math.min(width - layout.gutter * 2, WINDOW_MAX));

  const send = async (body: string): Promise<void> => {
    if (!home) return;
    setBusy(true);
    setSendError(null);
    const res = await client.post<BirdOutResult>('/letters/out', { body });
    setBusy(false);
    if (!res.ok) {
      haptic('error');
      setSendError(letterErrorText(res.error, t) ?? describeError(res.error, t));
      return;
    }
    haptic('tap');
    setMoment({ kind: 'sent', result: res.data });
    setScene({ kind: 'leaving', bird: home.bird });
    // no window drawn (a screen with no width yet): nothing to watch, so what follows the flight follows now
    if (size <= 0) landed(res.data);
  };

  /** Your bird has flown: theirs comes in with its letter, or the sill stays empty. */
  const flown = (): void => {
    if (moment.kind === 'sent') landed(moment.result);
  };
  const landed = (result: BirdOutResult): void => {
    if (result.kind === 'met') {
      setScene({ kind: 'arriving', bird: result.person.bird });
      setMoment({ kind: 'arrived', person: result.person, letter: result.letter, threadId: result.threadId });
    } else {
      setScene({ kind: 'away' });
      setMoment({ kind: 'waiting' });
    }
    void load();
  };

  const recall = async (): Promise<void> => {
    if (!home) return;
    setBusy(true);
    const res = await client.delete('/letters/out');
    setBusy(false);
    if (res.ok || res.error.status === 404) {
      setScene({ kind: 'arriving', bird: home.bird });
      setMoment({ kind: 'rest' });
      void load();
    }
  };

  const out = (home?.out != null || moment.kind === 'waiting') && moment.kind !== 'arrived';
  const canWrite = home !== null && home.refusal === null && !out && home.roomForMore;

  let status: React.ReactNode = null;
  if (home) {
    if (home.refusal === 'birth_month') status = <Text style={[styles.status, { color: colors.textSecondary }]}>{t('letters.refusal.birthMonth')}</Text>;
    else if (home.refusal === 'restricted') status = <Text style={[styles.status, { color: colors.textSecondary }]}>{t('letters.refusal.restricted')}</Text>;
    else if (moment.kind === 'sent') status = <Text style={[styles.status, { color: colors.textSecondary }]}>{t('letters.flying')}</Text>;
    else if (moment.kind === 'arrived') status = <Text style={[styles.status, styles.strong, { color: colors.textPrimary }]}>{t('letters.met', { name: moment.person.name })}</Text>;
    else if (out)
      status = (
        <>
          <Text style={[styles.status, styles.strong, { color: colors.textPrimary }]}>{t('letters.out.title')}</Text>
          <Text style={[styles.status, { color: colors.textSecondary }]} testID="letters-out">
            {t('letters.out.body', { days: BIRD_OUT_DAYS })}
          </Text>
          <ClayButton label={t('letters.recall')} onPress={() => void recall()} variant="outline" busy={busy} testID="letters-recall" />
        </>
      );
    else if (!home.roomForMore) status = <Text style={[styles.status, { color: colors.textSecondary }]}>{t('letters.full', { max: PEN_PALS_MAX })}</Text>;
    else if (moment.kind !== 'writing')
      status = <ClayButton label={t('letters.write')} onPress={() => setMoment({ kind: 'writing' })} tone="primary" style={styles.write} testID="letters-write" />;
  }

  return (
    <GradientBackground>
      <ScreenHeader title={t('letters.title')} onBack={onExit} hairline />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {!home ? (
            error ? (
              <ErrorRetry message={describeError(error, t)} onRetry={() => void load()} />
            ) : null
          ) : (
            <>
              <Text style={[styles.lead, dir.text, { color: colors.textSecondary }]}>{t('letters.lead')}</Text>
              {scene && size > 0 ? <LetterWindow scene={scene} size={size} onDone={scene.kind === 'leaving' ? flown : undefined} /> : null}
              <View style={styles.hero} accessibilityLiveRegion="polite">
                {status}
              </View>

              {moment.kind === 'writing' && canWrite ? (
                <LetterPaper label={t('letters.yourLetter')} busy={busy} onSend={(body) => void send(body)} error={sendError} testID="letters-paper" />
              ) : null}

              {moment.kind === 'arrived' ? (
                <View style={styles.arrived} testID="letters-arrived">
                  <LetterSheet letter={moment.letter} from={moment.person.name} />
                  <ClayButton
                    label={t('letters.writeBack', { name: moment.person.name })}
                    onPress={() => navigation.navigate('LetterThread', { threadId: moment.threadId })}
                    variant="outline"
                  />
                </View>
              ) : null}

              <View style={styles.section}>
                <Text style={[styles.heading, dir.text, { color: colors.textSecondary }]} accessibilityRole="header">
                  {t('letters.penPals')}
                </Text>
                {home.penPals.length === 0 ? (
                  <Text style={[styles.empty, dir.text, { color: colors.textSecondary }]}>{t('letters.empty')}</Text>
                ) : (
                  home.penPals.map((p) => (
                    <PressableScale
                      key={p.threadId}
                      onPress={() => navigation.navigate('LetterThread', { threadId: p.threadId })}
                      accessibilityRole="button"
                      accessibilityLabel={`${p.person.name}, ${p.yourTurn ? t('letters.yourTurn') : t('letters.theirTurn')}${p.unread > 0 ? `, ${t('letters.new')}` : ''}`}
                      testID={`letters-pal-${p.threadId}`}
                      style={[styles.pal, { backgroundColor: colors.surface, flexDirection: dir.row }]}
                    >
                      <BirdBadge bird={p.person.bird} />
                      <View style={styles.palText}>
                        <Text style={[styles.palName, dir.text, { color: colors.textPrimary }]} numberOfLines={1}>
                          {p.person.name}
                        </Text>
                        <Text style={[styles.palTurn, dir.text, { color: p.yourTurn ? colors.textPrimary : colors.textSecondary }]}>
                          {p.yourTurn ? t('letters.yourTurn') : t('letters.theirTurn')}
                        </Text>
                      </View>
                      {p.unread > 0 ? (
                        <View style={[styles.newBadge, { backgroundColor: colors.gold }]}>
                          <Text style={[styles.newText, { color: colors.textOnGold }]}>{t('letters.new')}</Text>
                        </View>
                      ) : null}
                      <Icon name="chevron-right" size={16} color={colors.textSecondary} style={dir.flip ?? undefined} />
                    </PressableScale>
                  ))
                )}
              </View>

              <View style={styles.section}>
                <PressableScale
                  onPress={() => setHowOpen((o) => !o)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: howOpen }}
                  testID="letters-how"
                  style={[styles.howHead, { flexDirection: dir.row }]}
                >
                  <Text style={[styles.howTitle, { color: colors.textPrimary }]}>{t('letters.how.title')}</Text>
                  <Icon name="chevron-down" size={16} color={colors.textSecondary} style={howOpen ? styles.flipped : undefined} />
                </PressableScale>
                {howOpen
                  ? (['letters.how.ages', 'letters.how.turns', 'letters.how.safe'] as const).map((key) => (
                      <Text key={key} style={[styles.howLine, dir.text, { color: colors.textSecondary }]}>
                        {t(key)}
                      </Text>
                    ))
                  : null}
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: layout.gutter, paddingBottom: spacing.xxl, gap: spacing.lg },
  lead: { fontSize: typography.sizes.sm, lineHeight: 20 },
  hero: { alignItems: 'center', gap: spacing.sm, marginTop: -spacing.sm },
  status: { fontSize: typography.sizes.md, lineHeight: 22, textAlign: 'center', maxWidth: 360 },
  strong: { fontWeight: typography.weights.bold },
  write: { alignSelf: 'stretch' },
  arrived: { gap: spacing.md },
  section: { gap: spacing.sm },
  heading: { ...sectionLabel },
  empty: { fontSize: typography.sizes.sm, lineHeight: 20 },
  pal: { alignItems: 'center', gap: spacing.md - 4, minHeight: MIN_TOUCH_TARGET + 20, paddingVertical: spacing.sm, paddingHorizontal: spacing.sm + 2, borderRadius: radii.lg },
  palText: { flex: 1, gap: 2 },
  palName: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  palTurn: { fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold },
  newBadge: { paddingHorizontal: spacing.sm + 2, paddingVertical: 2, borderRadius: radii.pill },
  newText: { fontSize: typography.sizes.xs, fontWeight: typography.weights.bold },
  howHead: { alignItems: 'center', justifyContent: 'space-between', minHeight: MIN_TOUCH_TARGET },
  howTitle: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  flipped: { transform: [{ rotate: '180deg' }] },
  howLine: { fontSize: typography.sizes.sm, lineHeight: 20 },
});

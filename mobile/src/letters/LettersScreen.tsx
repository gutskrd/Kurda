import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import {
  BIRD_OUT_DAYS,
  LETTER_FLIGHT,
  PEN_PALS_MAX,
  type BirdOutResult,
  type LetterPerson,
  type LetterVisitor,
  type LettersHome,
  type VisitorAnswer,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import type { RootNavigation } from '../navigation/rootStack';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { ClayButton, ErrorRetry, GradientBackground } from '../theme/glass';
import { PressableScale, Rise } from '../theme/MotionParts';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { sectionLabel } from '../theme/fonts';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { useI18n } from '../i18n/I18nContext';
import { useDirection } from '../reports/direction';
import { ReportSheet } from '../reports/ReportSheet';
import { describeError } from '../api/errors';
import type { ApiError } from '../api/types';
import { haptic } from '../feedback/haptics';
import { LetterWindow, type WindowScene } from './LetterWindow';
import { BirdBadge, LetterPaper, LetterSheet } from './LetterParts';
import { letterErrorText } from './errors';
import { BirdPicker } from './BirdPicker';

/**
 * What the screen is showing under the window: the letters as they stand,
 * writing your own letter, your bird on its way out, your answer on its way
 * home with somebody's bird, that bird sent on, or your own bird home with an
 * answer.
 */
type Moment =
  | { kind: 'rest' }
  | { kind: 'writing' }
  | { kind: 'sent' }
  /** your bird has flown and waits out there: said at once, before the screen has read again */
  | { kind: 'waiting' }
  | { kind: 'answered'; person: LetterPerson; threadId: string }
  | { kind: 'sentOn'; name: string }
  | { kind: 'homecoming'; person: LetterPerson; threadId: string };

/** The window is as wide as the screen allows, and no wider than a hand's width of sky. */
const WINDOW_MAX = 300;

/**
 * The screen's first look at what the server says: your bird where it is, a
 * bird at the window still there, and your bird home with an answer landing,
 * said in words under it.
 */
function firstLook(home: LettersHome): { scene: WindowScene; moment: Moment } {
  const back = home.homecoming !== null && home.out === null;
  return {
    scene: {
      own: home.out ? { kind: 'away' } : back ? { kind: 'arriving', bird: home.bird } : { kind: 'home', bird: home.bird },
      visitor: home.visitor ? { kind: 'here', bird: home.visitor.person.bird } : { kind: 'none' },
      sky: home.sky,
    },
    moment: back && home.homecoming ? { kind: 'homecoming', person: home.homecoming.person, threadId: home.homecoming.threadId } : { kind: 'rest' },
  };
}

/**
 * Letters by bird, on the phone: writing to somebody new in Kurdish, and the
 * pen pals you write to. The same screen as the website's /app/letters
 * (web/src/letters/LettersPage.tsx).
 *
 * At the top, your window, and over the country the birds out there, each
 * carrying a letter from somebody your age; how many is said under it. The
 * first time, you choose your bird there: the one on the sill takes the
 * colour of whichever you pick, and choosing it is free; a new bird later
 * costs Zêr, said before anything is paid. Then there are two ways to meet
 * somebody: write a letter, even a word, and send your own bird out with it
 * to wait until somebody calls it; or call one of the birds out there to your
 * window. It comes down with its letter and waits on the sill beside your
 * bird while you read it. Answer it, and that same bird carries your letter
 * home and the two of you are pen pals; or send it on its way, asked once
 * first, for somebody else. While it is there your own bird stays home. When
 * your own bird comes home from somebody's window with their answer, the
 * screen shows it landing, and the way to read it.
 *
 * Under it your pen pals, the one most recently written to first, each with
 * whose turn it is, and one short list of how it works. Reporting and
 * blocking are on each correspondence, and on a visiting bird's letter.
 */
export function LettersScreen({ onExit }: { onExit: () => void }): React.JSX.Element {
  const { client } = useAuth();
  const navigation = useNavigation<RootNavigation>();
  const { t } = useI18n();
  const { colors } = useTheme();
  const dir = useDirection();
  const reduce = useReducedMotion();
  const { width } = useWindowDimensions();
  const [home, setHome] = useState<LettersHome | null>(null);
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [moment, setMoment] = useState<Moment>({ kind: 'rest' });
  // what the window acts out: set from the screen once it is read, then by what is done here
  const [scene, setScene] = useState<WindowScene | null>(null);
  // the bird at the window, as the call brought it or the screen found it
  const [visitor, setVisitor] = useState<LetterVisitor | null>(null);
  const [askingOn, setAskingOn] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [calling, setCalling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [howOpen, setHowOpen] = useState(false);
  // choosing a new bird after the first, and the one picked while choosing, which the window shows on the sill
  const [changing, setChanging] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);
  const [birdError, setBirdError] = useState<string | null>(null);
  // left for a correspondence: coming back, the screen starts afresh from what the server then says, as the website's page does
  const away = useRef(false);

  const load = useCallback(
    async (afresh = false): Promise<void> => {
      const res = await client.get<LettersHome>('/letters');
      if (res.ok) {
        if (afresh) {
          const look = firstLook(res.data);
          setScene(look.scene);
          setMoment(look.moment);
          setVisitor(res.data.visitor);
          setAskingOn(false);
          setError(null);
        }
        setHome(res.data);
        setLoadError(null);
      } else setLoadError(res.error);
    },
    [client],
  );

  useFocusEffect(
    useCallback(() => {
      void load(away.current);
      away.current = false;
    }, [load]),
  );

  useEffect(() => {
    if (!home) return;
    if (!scene) {
      const look = firstLook(home);
      setScene(look.scene);
      setVisitor(home.visitor);
      if (look.moment.kind === 'homecoming') setMoment(look.moment);
      return;
    }
    // read again: the birds out there are as the screen now says
    setScene((s) => (s && s.sky.join() !== home.sky.join() ? { ...s, sky: home.sky } : s));
  }, [home, scene]);

  // a window with no width yet (a screen still being laid out) is not drawn until it has one
  const size = Math.max(0, Math.min(width - layout.gutter * 2, WINDOW_MAX));

  const out = home !== null && (home.out !== null || moment.kind === 'waiting');
  const here = visitor !== null && scene?.visitor.kind !== 'leaving' && scene?.visitor.kind !== 'none';
  // the bird is chosen at home, while nothing else is going on: the first time before the first letter, later whenever wanted
  const choosing = home !== null && home.refusal === null && !out && !here && moment.kind === 'rest' && (!home.birdChosen || changing);
  const pick = picked ?? home?.bird ?? 0;
  const shown = useMemo<WindowScene | null>(
    () => (choosing && scene?.own.kind === 'home' ? { ...scene, own: { kind: 'home', bird: pick } } : scene),
    [choosing, scene, pick],
  );

  const openThread = (threadId: string): void => {
    away.current = true;
    navigation.navigate('LetterThread', { threadId });
  };

  const send = async (body: string): Promise<void> => {
    if (!home) return;
    setBusy(true);
    setError(null);
    const res = await client.post<BirdOutResult>('/letters/out', { body });
    setBusy(false);
    if (!res.ok) {
      haptic('error');
      setError(letterErrorText(res.error, t) ?? describeError(res.error, t));
      return;
    }
    haptic('tap');
    setMoment({ kind: 'sent' });
    setScene((s) => s && { ...s, own: { kind: 'leaving', bird: home.bird } });
  };

  /** Your bird has flown out through the window: it waits out there now. */
  const ownGone = (): void => {
    setScene((s) => s && { ...s, own: { kind: 'away' } });
    setMoment((m) => (m.kind === 'sent' ? { kind: 'waiting' } : m));
    void load();
  };

  const call = async (): Promise<void> => {
    setBusy(true);
    setCalling(true);
    setError(null);
    const res = await client.post<{ visitor: LetterVisitor }>('/letters/call', {});
    setBusy(false);
    setCalling(false);
    if (!res.ok) {
      haptic('error');
      setError(letterErrorText(res.error, t) ?? describeError(res.error, t));
      void load();
      return;
    }
    haptic('tap');
    const came = res.data.visitor;
    setVisitor(came);
    setAskingOn(false);
    // the first bird out there is the one that comes: it leaves the sky as it sets out
    setScene((s) => s && { ...s, visitor: { kind: 'arriving', bird: came.person.bird }, sky: s.sky.slice(1) });
    setMoment({ kind: 'rest' });
  };

  /** The bird called to the window has landed and laid its letter down. */
  const visitorLanded = (): void => {
    setScene((s) => (s && s.visitor.kind === 'arriving' ? { ...s, visitor: { kind: 'here', bird: s.visitor.bird } } : s));
  };

  const answer = async (body: string): Promise<void> => {
    if (!visitor) return;
    setBusy(true);
    setError(null);
    const res = await client.post<VisitorAnswer>('/letters/visitor', { body });
    setBusy(false);
    if (!res.ok) {
      haptic('error');
      const gone = res.error.code === 'NO_VISITOR' || res.error.code === 'BIRD_GONE';
      setError(gone ? t('letters.visitor.gone') : (letterErrorText(res.error, t) ?? describeError(res.error, t)));
      if (gone) {
        setVisitor(null);
        setScene((s) => s && { ...s, visitor: { kind: 'none' } });
        void load();
      }
      return;
    }
    haptic('celebrate');
    // your letter drops onto the sill, their bird takes it home, and the two birds chirp to each other
    setMoment({ kind: 'answered', person: res.data.person, threadId: res.data.threadId });
    setScene((s) => s && { ...s, visitor: { kind: 'leaving', bird: visitor.person.bird, how: 'answered' }, song: (s.song ?? 0) + 1 });
  };

  const sendOn = async (): Promise<void> => {
    if (!visitor) return;
    setBusy(true);
    const res = await client.delete('/letters/visitor');
    setBusy(false);
    setAskingOn(false);
    if (res.ok || res.error.status === 404) {
      haptic('tap');
      setMoment({ kind: 'sentOn', name: visitor.person.name });
      setScene((s) => s && { ...s, visitor: { kind: 'leaving', bird: visitor.person.bird, how: 'sent-on' } });
    }
  };

  /** The visiting bird has flown off through the window, with your answer or on to somebody else. */
  const visitorGone = (): void => {
    setVisitor(null);
    setScene((s) => s && { ...s, visitor: { kind: 'none' } });
    setMoment((m) => (m.kind === 'sentOn' ? { kind: 'rest' } : m));
    void load();
  };

  // with no window drawn there is no flight to watch, so what follows one follows at once
  useEffect(() => {
    if (size > 0 || !scene) return;
    if (scene.own.kind === 'leaving') ownGone();
    if (scene.visitor.kind === 'arriving') visitorLanded();
    else if (scene.visitor.kind === 'leaving') visitorGone();
  }, [size, scene]);

  const recall = async (): Promise<void> => {
    if (!home) return;
    setBusy(true);
    const res = await client.delete('/letters/out');
    setBusy(false);
    if (res.ok || res.error.status === 404) {
      setScene((s) => s && { ...s, own: { kind: 'arriving', bird: home.bird } });
      setMoment({ kind: 'rest' });
      void load();
    }
  };

  const chooseBird = async (): Promise<void> => {
    if (!home) return;
    setBusy(true);
    setBirdError(null);
    const res = await client.post<LettersHome>('/letters/bird', { bird: pick });
    setBusy(false);
    // spent meanwhile, in another tab or on another phone: the Zêr there are now say how many are missing
    if (!res.ok && res.error.code === 'INSUFFICIENT_FUNDS') {
      haptic('error');
      void load();
      return;
    }
    // the same bird again is no change: there is nothing to pay and nothing to say
    if (!res.ok && res.error.code !== 'LETTER_BIRD_SAME') {
      haptic('error');
      setBirdError(describeError(res.error, t));
      return;
    }
    haptic('celebrate');
    if (res.ok) setHome(res.data);
    setChanging(false);
    setPicked(null);
    setScene((s) => s && { ...s, own: { kind: 'home', bird: res.ok ? res.data.bird : pick } });
  };
  const startChanging = (): void => {
    if (!home) return;
    setPicked(home.bird);
    setBirdError(null);
    setChanging(true);
  };

  const visitorName = visitor?.person.name ?? '';
  const canWrite = home !== null && home.refusal === null && !out && !here && home.roomForMore;
  const quiet = [styles.status, { color: colors.textSecondary }];
  const strong = [styles.status, styles.strong, { color: colors.textPrimary }];

  let status: React.ReactNode = null;
  if (home && scene) {
    const room = home.roomForMore;
    const canCall = home.refusal === null && !here && room && home.birdsOut > 0 && home.callsLeft > 0;
    // the birds out there, how many, and the way to call one
    const sky =
      home.refusal === null && room && !here ? (
        <View style={styles.sky}>
          <Text style={quiet} testID="letters-sky">
            {home.birdsOut === 0 ? t('letters.sky.none') : home.birdsOut === 1 ? t('letters.sky.one') : t('letters.sky.many', { count: home.birdsOut })}
          </Text>
          {home.birdsOut > 0 ? (
            home.callsLeft > 0 ? (
              <ClayButton
                label={calling ? t('letters.calling') : t('letters.call')}
                onPress={() => void call()}
                variant="outline"
                busy={calling}
                disabled={busy || !canCall}
                style={styles.wide}
                testID="letters-call"
              />
            ) : (
              <Text style={[styles.status, styles.quiet, { color: colors.textSecondary }]}>{t('letters.callsDone')}</Text>
            )
          ) : null}
        </View>
      ) : null;
    const change = <ClayButton label={t('letters.bird.change')} onPress={startChanging} variant="outline" testID="letters-bird-change" />;

    if (home.refusal === 'birth_month') status = <Text style={quiet}>{t('letters.refusal.birthMonth')}</Text>;
    else if (home.refusal === 'restricted') status = <Text style={quiet}>{t('letters.refusal.restricted')}</Text>;
    else if (moment.kind === 'answered') {
      const { person, threadId } = moment;
      status =
        scene.visitor.kind === 'leaving' ? (
          <Text style={strong}>{t('letters.visitor.leaving', { name: person.name })}</Text>
        ) : (
          <>
            <Text style={strong}>{t('letters.pals.now', { name: person.name })}</Text>
            <ClayButton label={t('letters.pals.open', { name: person.name })} onPress={() => openThread(threadId)} variant="outline" testID="letters-pals-open" />
            {canWrite ? <ClayButton label={t('letters.write')} onPress={() => setMoment({ kind: 'writing' })} variant="outline" testID="letters-write" /> : null}
            {sky}
          </>
        );
    } else if (moment.kind === 'sentOn' && scene.visitor.kind === 'leaving') status = <Text style={quiet}>{t('letters.visitor.sentOn', { name: moment.name })}</Text>;
    else if (here && visitor)
      status =
        scene.visitor.kind === 'arriving' ? (
          <Text style={quiet}>{t('letters.visitor.coming')}</Text>
        ) : (
          <>
            <Text style={strong}>{t('letters.visitor.title', { name: visitorName })}</Text>
            <Text style={quiet}>{t('letters.visitor.body')}</Text>
          </>
        );
    else if (moment.kind === 'homecoming') {
      const { person, threadId } = moment;
      status = (
        <>
          <Text style={strong}>{t('letters.home.title', { name: person.name })}</Text>
          <ClayButton label={t('letters.home.read')} onPress={() => openThread(threadId)} tone="primary" style={styles.wide} testID="letters-home-read" />
        </>
      );
    } else if (moment.kind === 'sent') status = <Text style={quiet}>{t('letters.flying')}</Text>;
    else if (out)
      status = (
        <>
          <Text style={strong}>{t('letters.out.title')}</Text>
          <Text style={quiet} testID="letters-out">
            {home.out?.visiting ? t('letters.out.visiting') : t('letters.out.body', { days: BIRD_OUT_DAYS })}
          </Text>
          <ClayButton label={t('letters.recall')} onPress={() => void recall()} variant="outline" busy={busy && !calling} disabled={busy} testID="letters-recall" />
          {sky}
        </>
      );
    else if (choosing)
      status = (
        <BirdPicker
          first={!home.birdChosen}
          current={home.bird}
          picked={pick}
          zer={home.zer}
          busy={busy}
          error={birdError}
          onPick={(bird) => {
            haptic('select');
            setPicked(bird);
            setBirdError(null);
          }}
          onConfirm={() => void chooseBird()}
          onCancel={() => {
            setChanging(false);
            setPicked(null);
          }}
        />
      );
    else if (!room)
      status = (
        <>
          <Text style={quiet}>{t('letters.full', { max: PEN_PALS_MAX })}</Text>
          {change}
        </>
      );
    else
      status = (
        <>
          {moment.kind !== 'writing' ? (
            <ClayButton label={t('letters.write')} onPress={() => setMoment({ kind: 'writing' })} tone="primary" style={styles.wide} testID="letters-write" />
          ) : null}
          {sky}
          {change}
        </>
      );
  }

  // a called bird's letter unfolds once the bird has landed with it; a reader who asked for less motion has it at once
  const unfold = scene?.visitor.kind === 'arriving' && !reduce ? LETTER_FLIGHT.ms : null;

  return (
    <GradientBackground>
      <ScreenHeader title={t('letters.title')} onBack={onExit} hairline />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {!home || !scene ? (
            loadError ? (
              <ErrorRetry message={describeError(loadError, t)} onRetry={() => void load()} />
            ) : null
          ) : (
            <>
              <Text style={[styles.lead, dir.text, { color: colors.textSecondary }]}>{t('letters.lead')}</Text>
              {shown && size > 0 ? <LetterWindow scene={shown} size={size} onOwnGone={ownGone} onVisitorGone={visitorGone} onVisitorLanded={visitorLanded} /> : null}
              <View style={styles.hero} accessibilityLiveRegion="polite">
                {status}
                {error && !here && moment.kind !== 'writing' ? (
                  <Text style={[styles.status, { color: colors.danger }]} testID="letters-error">
                    {error}
                  </Text>
                ) : null}
              </View>

              {moment.kind === 'writing' && canWrite ? (
                <LetterPaper label={t('letters.yourLetter')} busy={busy} onSend={(body) => void send(body)} error={error} testID="letters-paper" />
              ) : null}

              {here && visitor ? (
                <Rise key={visitor.letter.id} delay={unfold}>
                  <View style={styles.visitor} testID="letters-visitor">
                    <LetterSheet letter={visitor.letter} from={visitorName} onReport={() => setReporting(true)} />
                    <LetterPaper
                      label={t('letters.visitor.answerLabel', { name: visitorName })}
                      sendLabel={t('letters.visitor.send', { name: visitorName })}
                      busy={busy}
                      onSend={(body) => void answer(body)}
                      error={error}
                      testID="letters-visitor-answer"
                    />
                    <Text style={[styles.note, dir.text, { color: colors.textSecondary }]}>{t('letters.visitor.ownWaits', { name: visitorName })}</Text>
                    {askingOn ? (
                      <View style={styles.ask}>
                        <Text style={[styles.note, dir.text, { color: colors.textPrimary }]}>{t('letters.visitor.sendOnAsk', { name: visitorName })}</Text>
                        <View style={[styles.askActions, { flexDirection: dir.row }]}>
                          <ClayButton
                            label={t('letters.visitor.sendOnYes')}
                            onPress={() => void sendOn()}
                            variant="outline"
                            busy={busy}
                            style={styles.askAction}
                            testID="letters-visitor-send-on-yes"
                          />
                          <ClayButton
                            label={t('letters.visitor.keep')}
                            onPress={() => setAskingOn(false)}
                            variant="outline"
                            style={styles.askAction}
                            testID="letters-visitor-keep"
                          />
                        </View>
                      </View>
                    ) : (
                      <ClayButton
                        label={t('letters.visitor.sendOn')}
                        onPress={() => setAskingOn(true)}
                        variant="outline"
                        disabled={busy}
                        testID="letters-visitor-send-on"
                      />
                    )}
                  </View>
                </Rise>
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
                      onPress={() => openThread(p.threadId)}
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
                  ? (['letters.how.call', 'letters.how.ages', 'letters.how.turns', 'letters.how.safe'] as const).map((key) => (
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
      {visitor ? (
        <ReportSheet
          visible={reporting}
          target={{ type: 'letter', letterId: visitor.letter.id }}
          name={visitorName}
          blockable={{ userId: visitor.person.id, name: visitorName }}
          onClose={() => setReporting(false)}
          onBlocked={() => {
            setReporting(false);
            visitorGone();
          }}
        />
      ) : null}
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
  quiet: { fontSize: typography.sizes.sm, lineHeight: 20 },
  wide: { alignSelf: 'stretch' },
  sky: { alignSelf: 'stretch', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  visitor: { gap: spacing.md },
  note: { fontSize: typography.sizes.sm, lineHeight: 20 },
  ask: { gap: spacing.sm },
  askActions: { flexWrap: 'wrap', gap: spacing.sm },
  askAction: { flexGrow: 1 },
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

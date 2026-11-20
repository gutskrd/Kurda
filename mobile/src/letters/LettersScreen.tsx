import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import {
  BIRD_OUT_DAYS,
  LETTER_FLIGHT,
  PEN_PALS_MAX,
  firstLook,
  flightOf,
  lookAfterAnswer,
  lookAfterBirdChosen,
  lookAfterCall,
  lookAfterLanded,
  lookAfterOwnGone,
  lookAfterRecall,
  lookAfterSend,
  lookAfterSendOn,
  lookAfterVisitorGone,
  lookInMotion,
  lookWithMoment,
  nextLook,
  untilServerTime,
  type BirdOutResult,
  type LetterReturnReason,
  type LetterVisitor,
  type LettersHome,
  type PictureRejection,
  type VisitorAnswer,
  type WindowLook,
  type WindowMoment,
  type WindowSpot,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import type { RootNavigation } from '../navigation/rootStack';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { ClayButton, ErrorRetry, GradientBackground } from '../theme/glass';
import { Skeleton, SkeletonText } from '../theme/Skeleton';
import { PressableScale, Rise } from '../theme/MotionParts';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { sectionLabel } from '../theme/fonts';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { useDirection } from '../reports/direction';
import { ReportSheet } from '../reports/ReportSheet';
import { describeError } from '../api/errors';
import type { ApiError } from '../api/types';
import { haptic } from '../feedback/haptics';
import { LetterWindow, type WindowScene } from './LetterWindow';
import { BirdBadge, LetterSheet } from './LetterParts';
import { LetterComposer, rememberPaper, rememberedPaper, type ComposedLetter } from './LetterComposer';
import { usePaperScroll } from './usePaperScroll';
import { letterErrorText } from './errors';
import { BirdPicker } from './BirdPicker';
import { NEW_LETTER, keepDraft, moveDraft, strayAnswers, threadDraft, useLetterDrafts, visitorDraft } from './drafts';
import { useLettersHome } from './useLettersHome';
import { LetterWidgetButton } from '../widget/LetterWidgetButton';
import { HeldNote, PictureRefusal } from '../pictures/PictureReview';
import { isHeld, rejectionOf } from '../pictures/review';

/** The window's maximum width; below it, the screen's width decides. */
const WINDOW_MAX = 300;

/** A correspondence id as a notification names it (`bird`); anything else is ignored. */
const THREAD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A visitor is re-read this long after its day ends, so it is seen flying on rather than left there. */
const AFTER_LEAVING_MS = 1500;
/** Timers further off than this are left to the next read. */
const TIMED_MAX_MS = 26 * 3_600_000;

/** Why your bird came home by itself, shown under the window. */
const RETURNED: Record<LetterReturnReason, TranslationKey> = {
  unanswered: 'letters.returned.unanswered',
  band: 'letters.returned.band',
  full: 'letters.returned.full',
};

/** An answer whose bird flew on, kept to send another way: to that person's correspondence, or with your own bird. */
type Kept = { name: string; threadId: string } | { name: null; threadId: null };

/**
 * Letters by bird: writing to someone new in Kurdish, and your pen pals. The same screen as the website's
 * web/src/letters/LettersPage.tsx.
 *
 * At the top is your window, with the waiting birds outside and their count below. The first time you choose your
 * bird for free; later changes cost Zêr. You meet someone by sending your bird out with a letter until someone calls
 * it, or by calling a waiting bird to your window; answering it makes you pen pals, sending it on passes it to
 * someone else.
 *
 * Every letter lands at the window once, with a light haptic outside Reduce Motion, and its bird waits on the sill
 * until it is read. The shared window logic (shared/src/letter-window.ts) decides what the window acts out from the
 * latest read (useLettersHome.ts) and local actions, one letter at a time. A notification's `bird` lands first, or
 * its correspondence opens when there is nothing to land or the window is busy.
 *
 * Letters are written on your own paper (LetterComposer.tsx). A first letter to someone new carries no drawing; an
 * answer to a visitor may. Drafts are kept (drafts.ts), and an answer whose bird flew on is kept for that person's
 * correspondence or your own bird. Pen pals are listed below, most recent first, with whose turn it is. An answer whose
 * drawing waits for a person says so, since their bird cannot take it home until then; a drawing the check refuses says
 * why under the paper.
 */
export function LettersScreen({ onExit, bird, onBirdUsed }: { onExit: () => void; bird?: string; onBirdUsed?: () => void }): React.JSX.Element {
  const { client, user } = useAuth();
  const navigation = useNavigation<RootNavigation>();
  const { t } = useI18n();
  const { colors } = useTheme();
  const dir = useDirection();
  const reduce = useReducedMotion();
  const { width } = useWindowDimensions();
  const home = useLettersHome();
  const data = home.read?.data ?? null;
  const who = user?.id ?? null;
  const draftsReady = useLetterDrafts(who);
  const [askingOn, setAskingOn] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [calling, setCalling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Your answer's drawing waits for a person; a refused one says why.
  const [heldSent, setHeldSent] = useState(false);
  const [refusal, setRefusal] = useState<PictureRejection | null>(null);
  const [kept, setKept] = useState<Kept | null>(null);
  const [howOpen, setHowOpen] = useState(false);
  // Changing bird after the first, and the bird picked meanwhile, which the window shows on the sill.
  const [changing, setChanging] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);
  const [birdError, setBirdError] = useState<string | null>(null);
  // The page the paper lies on: held still while drawing, with the writing kept above the keyboard.
  const page = usePaperScroll();

  // What the window acts out, from each read and from local actions (`apply`). The ref always holds the latest, so a
  // flight ending and a read arriving in the same moment both build on it.
  const [look, setLook] = useState<WindowLook | null>(null);
  const current = useRef<WindowLook | null>(null);
  // Letters already reported to the server as landed, so each is reported once.
  const told = useRef(new Set<string>());
  const apply = useCallback((change: (l: WindowLook) => WindowLook): WindowLook | null => {
    const was = current.current;
    if (!was) return null;
    const next = change(was);
    if (next !== was) {
      current.current = next;
      setLook(next);
    }
    return next;
  }, []);

  // The paper you last wrote on, for this sheet and any correspondence opened from here.
  useEffect(() => rememberPaper(data?.paper), [data?.paper]);

  // The correspondence a notification named, handled with a read made after it arrived, which knows its letter.
  const hint = bird && THREAD_ID.test(bird) ? bird : null;
  const [hintFrom, setHintFrom] = useState<{ id: string; seq: number } | null>(null);
  const readSoFar = useRef(home.read);
  readSoFar.current = home.read;
  const { asked, reload } = home;
  useEffect(() => {
    if (!hint) {
      setHintFrom(null);
      return;
    }
    // The first read is already in flight; once letters are loaded, a new hint asks again.
    if (readSoFar.current === null) setHintFrom({ id: hint, seq: asked() });
    else {
      setHintFrom({ id: hint, seq: asked() + 1 });
      reload();
    }
  }, [hint, asked, reload]);
  const ready = hint !== null && hintFrom?.id === hint && home.read !== null && home.read.seq >= hintFrom.seq ? hint : null;

  // The window holds still while anything is open under it or in flight, so nothing is swapped out under the person;
  // it updates as soon as every hold ends.
  const held = askingOn || changing || reporting || busy;
  const moving = look !== null && lookInMotion(look);
  const saying = look?.moment.kind ?? null;
  useEffect(() => {
    if (!data) return;
    const was = current.current;
    const next = was ? nextLook(was, data, { held, hint: ready }) : firstLook(data, ready);
    if (next !== was) {
      current.current = next;
      setLook(next);
    }
  }, [data, held, ready, moving, saying]);

  // What became of a notification's bird: it lands here and is released, or its correspondence opens.
  const birdUsed = useRef(onBirdUsed);
  birdUsed.current = onBirdUsed;
  useEffect(() => {
    if (!bird) return;
    if (!hint) {
      birdUsed.current?.();
      return;
    }
    const made = look?.hint;
    if (!made || made.threadId !== hint) return;
    if (made.outcome === 'open-thread') navigation.navigate('LetterThread', { threadId: hint });
    birdUsed.current?.();
  }, [bird, hint, look?.hint, navigation]);

  // A visitor whose day ends, or your bird at someone else's window, is re-read then, by the server's clock.
  const visitorLeaves = data?.visitor?.leavesAt ?? null;
  const ownLeaves = data?.out?.leavesBy ?? null;
  const readAt = home.read?.at ?? 0;
  useEffect(() => {
    if (!data) return;
    const times = [visitorLeaves, ownLeaves]
      .filter((at): at is string => typeof at === 'string')
      .map((at) => untilServerTime(at, data, readAt, Date.now()))
      .filter((ms) => ms > -AFTER_LEAVING_MS && ms < TIMED_MAX_MS);
    if (times.length === 0) return;
    const timer = setTimeout(reload, Math.max(0, Math.min(...times)) + AFTER_LEAVING_MS);
    return () => clearTimeout(timer);
  }, [data, visitorLeaves, ownLeaves, readAt, reload]);

  /**
   * Keeps an answer begun to a bird that left without it: for that person's correspondence if you already write, else
   * for your own bird. Returns where it went, or null when nothing was written.
   */
  const keepAnswer = useCallback(
    (came: LetterVisitor, penPals: LettersHome['penPals']): Kept | null => {
      const pal = penPals.find((p) => p.person.id === came.person.id);
      const moved = pal
        ? moveDraft(who, visitorDraft(came.letter.id), threadDraft(pal.threadId), { strokes: true })
        : moveDraft(who, visitorDraft(came.letter.id), NEW_LETTER, { strokes: false });
      return moved ? (pal ? { name: pal.person.name, threadId: pal.threadId } : { name: null, threadId: null }) : null;
    },
    [who],
  );

  // A visitor that leaves by itself (its day up, or answered elsewhere) takes nothing with it: the paper is kept and
  // the screen says where.
  const lastVisitor = useRef<LetterVisitor | null>(null);
  const visitorNow = look?.visitor ?? null;
  const palsNow = data?.penPals ?? null;
  useEffect(() => {
    const was = lastVisitor.current;
    lastVisitor.current = visitorNow;
    if (!was || visitorNow?.letter.id === was.letter.id || !palsNow) return;
    const moved = keepAnswer(was, palsNow);
    if (moved) setKept(moved);
  }, [visitorNow, palsNow, keepAnswer]);

  // An answer begun to a bird whose day ended while the app was closed is found once drafts are read, and kept for
  // your own bird (who it was for is no longer known).
  const strayChecked = useRef(false);
  useEffect(() => {
    if (strayChecked.current || !data || !who || !draftsReady) return;
    strayChecked.current = true;
    let moved = false;
    for (const place of strayAnswers(who, data.visitor?.letter.id ?? null)) moved = moveDraft(who, place, NEW_LETTER, { strokes: false }) || moved;
    if (moved) setKept({ name: null, threadId: null });
  }, [data, who, draftsReady]);

  // No window is drawn until the screen has a width.
  const size = Math.max(0, Math.min(width - layout.gutter * 2, WINDOW_MAX));

  const scene = look?.scene ?? null;
  const moment: WindowMoment = look?.moment ?? { kind: 'rest' };
  const visitor = look?.visitor ?? null;
  const out = scene !== null && (scene.own.kind === 'away' || moment.kind === 'waiting');
  const here = visitor !== null && scene !== null && (scene.visitor.kind === 'arriving' || scene.visitor.kind === 'here');
  // Nothing is happening on the sill, or only your bird's return, so the bird can be chosen.
  const calm = moment.kind === 'rest' || moment.kind === 'returned';
  // The bird is chosen while home and nothing else is going on: first before the first letter, later whenever wanted.
  const choosing = data !== null && data.refusal === null && !out && !here && calm && (!data.birdChosen || changing);
  // Your bird can be changed while home and idle; the button sits on the window itself.
  const canChange = data !== null && data.refusal === null && data.birdChosen && !out && !here && !choosing && (calm || moment.kind === 'writing');
  const pick = picked ?? data?.bird ?? 0;
  const shown = useMemo<WindowScene | null>(
    () => (choosing && scene && (scene.own.kind === 'home' || scene.own.kind === 'here') ? { ...scene, own: { kind: scene.own.kind, bird: pick } } : scene),
    [choosing, scene, pick],
  );

  const said = (err: ApiError): string => letterErrorText(err, t) ?? describeError(err, t);

  const openThread = (threadId: string): void => {
    navigation.navigate('LetterThread', { threadId });
  };

  /** The sill's letter opened before its bird is down: it counts as seen, so it does not fly in again next time. */
  const readLanded = (threadId: string): void => {
    const shownLanding = current.current?.landing;
    if (shownLanding && !shownLanding.item.landed && shownLanding.item.letterId) tellLanded([shownLanding.item.letterId]);
    openThread(threadId);
  };

  const send = async (letter: ComposedLetter): Promise<void> => {
    if (!data) return;
    home.drop();
    setBusy(true);
    setError(null);
    setRefusal(null);
    const res = await client.post<BirdOutResult>('/letters/out', letter);
    setBusy(false);
    if (!res.ok) {
      haptic('error');
      // Refused because your bird was sent out elsewhere: the paper is put away (its draft kept) and the re-read shows the
      // bird out, with the way back.
      setError(said(res.error));
      if (res.error.code === 'BIRD_OUT') apply((l) => lookWithMoment(l, { kind: 'rest' }));
      home.reload();
      return;
    }
    haptic('tap');
    keepDraft(who, NEW_LETTER, null);
    setKept(null);
    apply((l) => lookAfterSend(l, data.bird, res.data));
  };

  /** Your bird has flown out through the window to wait outside. */
  const ownGone = (): void => {
    apply(lookAfterOwnGone);
    home.reload();
  };

  const call = async (): Promise<void> => {
    home.drop();
    setBusy(true);
    setCalling(true);
    setError(null);
    setKept(null);
    const res = await client.post<{ visitor: LetterVisitor }>('/letters/call', {});
    setBusy(false);
    setCalling(false);
    if (!res.ok) {
      // A bird already at the window (called on another phone) appears through the read.
      haptic('error');
      setError(said(res.error));
      home.reload();
      return;
    }
    haptic('tap');
    setAskingOn(false);
    // The first waiting bird is the one that comes, leaving the sky as it sets out.
    apply((l) => lookAfterCall(l, res.data.visitor));
    home.reload();
  };

  const answer = async (letter: ComposedLetter): Promise<void> => {
    const came = current.current?.visitor;
    if (!came || !data) return;
    home.drop();
    setBusy(true);
    setError(null);
    setRefusal(null);
    const res = await client.post<VisitorAnswer>('/letters/visitor', letter);
    setBusy(false);
    if (!res.ok) {
      haptic('error');
      // A drawing the check refused: the paper stays, with why under it.
      const rejection = rejectionOf(res.error);
      if (rejection) {
        setRefusal(rejection);
        return;
      }
      const gone = res.error.code === 'NO_VISITOR' || res.error.code === 'BIRD_GONE';
      if (gone) {
        // The bird flew on before the answer reached it, so the answer is kept for another way.
        setKept(keepAnswer(came, data.penPals));
        apply(lookAfterVisitorGone);
      }
      setError(gone ? t('letters.visitor.gone') : said(res.error));
      home.reload();
      return;
    }
    haptic('celebrate');
    keepDraft(who, visitorDraft(came.letter.id), null);
    setHeldSent(isHeld(res.data.letter));
    // Your letter drops onto the sill, their bird takes it home, and the birds chirp to each other.
    apply((l) => lookAfterAnswer(l, res.data));
    home.reload();
  };

  const sendOn = async (): Promise<void> => {
    const came = current.current?.visitor;
    if (!came) return;
    home.drop();
    setBusy(true);
    setError(null);
    const res = await client.delete('/letters/visitor');
    setBusy(false);
    setAskingOn(false);
    if (res.ok) {
      haptic('tap');
      // An answer begun to a bird sent on is not for anyone else.
      keepDraft(who, visitorDraft(came.letter.id), null);
      apply(lookAfterSendOn);
    } else if (res.error.status !== 404) {
      // Still at the window: signal it, so the button does not seem to have done nothing.
      haptic('error');
      setError(said(res.error));
    }
    // A 404 means the bird had already flown on; the re-read shows it going.
    home.reload();
  };

  /** The visiting bird has flown off, with your answer or on to someone else. */
  const visitorGone = (): void => {
    apply(lookAfterVisitorGone);
    home.reload();
  };

  /** Reports these letters as landed, each once; retried once on a network failure, else they land again next visit. */
  const tellLanded = (letterIds: readonly string[], again = true): void => {
    const fresh = letterIds.filter((id) => !told.current.has(id));
    if (fresh.length === 0) return;
    for (const id of fresh) told.current.add(id);
    void client.post('/letters/landed', { letterIds: fresh }).then((res) => {
      if (res.ok || res.error.kind !== 'network') return;
      for (const id of fresh) told.current.delete(id);
      if (again) setTimeout(() => tellLanded(fresh, false), 5000);
    });
  };

  /**
   * An arriving bird has touched down, so its letter has landed. The server is told now rather than after the landing
   * play, so leaving the screen meanwhile does not land it again. A seen arrival with a letter gets a light haptic,
   * except under Reduce Motion or with no window drawn.
   */
  const touchdown = (spot: WindowSpot, seen = true): void => {
    const l = current.current;
    if (!l) return;
    let letter: string | null = null;
    if (l.landing?.spot === spot && !l.landing.item.landed) letter = l.landing.item.letterId || null;
    else if (spot === 'own' && !l.landing && l.returned && !l.returned.landed) letter = l.returned.letterId;
    const bringing = (l.landing?.spot === spot && !l.landing.item.landed) || (spot === 'own' && !l.landing && l.returned !== null && !l.returned.landed);
    if (bringing && seen && !reduce) haptic('tap');
    if (letter) tellLanded([letter]);
  };

  /** A bird has settled on the sill with its letter laid down; the window shows it there from now on. */
  const landedAt = (spot: WindowSpot): void => {
    const was = current.current;
    if (!was) return;
    const done = lookAfterLanded(was, spot);
    if (!done.landed) return;
    current.current = done.look;
    setLook(done.look);
    tellLanded(done.post);
  };

  // With no window drawn there is no flight to watch, so what follows one happens at once.
  useEffect(() => {
    if (size > 0 || !scene) return;
    if (scene.own.kind === 'leaving') ownGone();
    else if (scene.own.kind === 'arriving') {
      touchdown('own', false);
      landedAt('own');
    }
    if (scene.visitor.kind === 'arriving') {
      touchdown('sill', false);
      landedAt('sill');
    } else if (scene.visitor.kind === 'leaving') visitorGone();
  }, [size, scene]);

  const recall = async (): Promise<void> => {
    if (!data) return;
    home.drop();
    setBusy(true);
    setError(null);
    const res = await client.delete('/letters/out');
    setBusy(false);
    // Recalled, it flies home with its letter; any other answer is shown by the re-read.
    if (res.ok) apply((l) => lookAfterRecall(l, data.bird));
    else if (res.error.status !== 404) {
      // Still out: signal it, so the button does not seem to have done nothing.
      haptic('error');
      setError(said(res.error));
    }
    home.reload();
  };

  const chooseBird = async (): Promise<void> => {
    if (!data) return;
    setBusy(true);
    setBirdError(null);
    const res = await client.post<LettersHome>('/letters/bird', { bird: pick });
    setBusy(false);
    // Spent meanwhile elsewhere: the current balance shows how many are missing.
    if (!res.ok && res.error.code === 'INSUFFICIENT_FUNDS') {
      haptic('error');
      home.reload();
      return;
    }
    // Sent out meanwhile elsewhere: a bird that is out is not changed, and the re-read shows it.
    if (!res.ok && res.error.code === 'BIRD_OUT') {
      haptic('error');
      setChanging(false);
      setPicked(null);
      setError(said(res.error));
      home.reload();
      return;
    }
    // The same bird again is no change, so nothing to pay or say; any other refusal is shown, and the re-read shows why.
    if (!res.ok && res.error.code !== 'LETTER_BIRD_SAME') {
      haptic('error');
      setBirdError(said(res.error));
      home.reload();
      return;
    }
    haptic('celebrate');
    setChanging(false);
    setPicked(null);
    apply((l) => lookAfterBirdChosen(l, res.ok ? res.data.bird : pick));
    home.reload();
  };

  // The picker replaces whatever is open under the window, the paper included, so the button always does what it says.
  const startChanging = (): void => {
    if (!data) return;
    setPicked(data.bird);
    setBirdError(null);
    setError(null);
    apply((l) => lookWithMoment(l, { kind: 'rest' }));
    setChanging(true);
  };

  const write = (): void => {
    setError(null);
    setRefusal(null);
    setKept(null);
    apply((l) => lookWithMoment(l, { kind: 'writing' }));
  };

  const visitorName = visitor?.person.name ?? '';
  const room = data?.roomForMore ?? false;
  const canWrite = data !== null && scene !== null && data.refusal === null && !out && !here && room && scene.own.kind !== 'leaving';
  const quiet = [styles.status, { color: colors.textSecondary }];
  const strong = [styles.status, styles.strong, { color: colors.textPrimary }];

  let status: React.ReactNode = null;
  let picker: React.ReactNode = null;
  if (data && scene && look) {
    const canCall = data.refusal === null && !here && room && data.birdsOut > 0 && data.callsLeft > 0;
    // The waiting birds as one card: the first few, their count, and the way to call one.
    const sky =
      data.refusal === null && room && !here ? (
        <View style={[styles.sky, { backgroundColor: colors.surface, borderColor: colors.separator }]}>
          <View style={[styles.skyTop, { flexDirection: dir.row }]}>
            {data.sky.length > 0 ? (
              <View style={[styles.skyBirds, { flexDirection: dir.row }]}>
                {data.sky.slice(0, 4).map((b, i) => (
                  <View key={`${i}-${b}`} style={[styles.skyBird, i > 0 ? styles.skyBirdOver : null, { borderColor: colors.surface }]}>
                    <BirdBadge bird={b} size={32} />
                  </View>
                ))}
              </View>
            ) : null}
            <Text style={[styles.skyText, dir.text, { color: colors.textSecondary }]} testID="letters-sky">
              {data.birdsOut === 0 ? t('letters.sky.none') : data.birdsOut === 1 ? t('letters.sky.one') : t('letters.sky.many', { count: data.birdsOut })}
            </Text>
          </View>
          {data.birdsOut > 0 ? (
            data.callsLeft > 0 ? (
              <ClayButton
                label={calling ? t('letters.calling') : t('letters.call')}
                onPress={() => void call()}
                busy={calling}
                disabled={busy || !canCall}
                style={styles.wide}
                testID="letters-call"
              />
            ) : (
              <Text style={[styles.skyText, dir.text, { color: colors.textSecondary }]}>{t('letters.callsDone')}</Text>
            )
          ) : null}
        </View>
      ) : null;
    const writeButton = <ClayButton label={t('letters.write')} onPress={write} tone="primary" style={styles.wide} testID="letters-write" />;

    if (data.refusal === 'birth_month')
      status = (
        <>
          <Text style={quiet}>{t('letters.refusal.birthMonth')}</Text>
          <ClayButton
            label={t('letters.refusal.birthMonthAction')}
            onPress={() => navigation.navigate('SettingsPage', { page: 'birthMonth' })}
            tone="primary"
            style={styles.wide}
            testID="letters-birth-month"
          />
        </>
      );
    else if (data.refusal === 'restricted') status = <Text style={quiet}>{t('letters.refusal.restricted')}</Text>;
    else if (moment.kind === 'answered') {
      const { person, threadId } = moment;
      status =
        // Held, the answer stays until a person has looked, so the bird is not said to take it.
        scene.visitor.kind === 'leaving' && !heldSent ? (
          <Text style={strong}>{t('letters.visitor.leaving', { name: person.name })}</Text>
        ) : (
          <>
            <Text style={strong}>{t('letters.pals.now', { name: person.name })}</Text>
            {heldSent ? <HeldNote body="picture.held.letter" testID="letters-held" /> : null}
            <ClayButton label={t('letters.pals.open', { name: person.name })} onPress={() => openThread(threadId)} variant="outline" testID="letters-pals-open" />
            {canWrite ? <ClayButton label={t('letters.write')} onPress={write} variant="outline" testID="letters-write" /> : null}
            {sky}
          </>
        );
    } else if ((moment.kind === 'sentOn' || moment.kind === 'flownOn') && scene.visitor.kind === 'leaving')
      status = <Text style={quiet}>{t('letters.visitor.sentOn', { name: moment.name })}</Text>;
    else if (here && visitor)
      status =
        scene.visitor.kind === 'arriving' ? (
          <Text style={quiet}>{t('letters.visitor.coming')}</Text>
        ) : (
          <>
            <Text style={strong}>{t('letters.visitor.title', { name: visitorName })}</Text>
            <Text style={quiet}>{t('letters.visitor.body')}</Text>
            {/* Your bird came home with an answer while this visitor was here; it is shown and readable all the same. */}
            {moment.kind === 'homecoming' ? (
              <View style={[styles.also, { borderTopColor: colors.separator }]}>
                <Text style={[styles.status, { color: colors.textPrimary }]}>{t('letters.home.title', { name: moment.person.name })}</Text>
                <ClayButton label={t('letters.home.read')} onPress={() => readLanded(moment.threadId)} variant="outline" testID="letters-home-read" />
              </View>
            ) : null}
          </>
        );
    else if (moment.kind === 'homecoming' || moment.kind === 'arrival') {
      const { person, threadId } = moment;
      status = (
        <>
          <Text style={strong}>{moment.kind === 'homecoming' ? t('letters.home.title', { name: person.name }) : t('letters.arrival.title', { name: person.name })}</Text>
          <ClayButton
            label={t('letters.home.read')}
            onPress={() => readLanded(threadId)}
            tone="primary"
            style={styles.wide}
            testID="letters-home-read"
          />
        </>
      );
    } else if (moment.kind === 'returned')
      status = (
        <>
          <Text style={strong}>{t('letters.returned.title')}</Text>
          <Text style={quiet} testID="letters-returned">
            {t(RETURNED[moment.why], { days: BIRD_OUT_DAYS, max: PEN_PALS_MAX })}
          </Text>
          {choosing ? null : canWrite ? writeButton : !room ? <Text style={quiet}>{t('letters.full', { max: PEN_PALS_MAX })}</Text> : null}
          {choosing ? null : sky}
        </>
      );
    else if (moment.kind === 'sent') status = <Text style={quiet}>{t('letters.flying')}</Text>;
    else if (out)
      status = (
        <>
          <Text style={strong}>{t('letters.out.title')}</Text>
          {/* Where your bird is: waiting to be called, or at someone's window being read. */}
          <Text style={quiet} testID="letters-out">
            {flightOf(data) === 'window' ? t('letters.out.visiting') : t('letters.out.body', { days: BIRD_OUT_DAYS })}
          </Text>
          <ClayButton label={t('letters.recall')} onPress={() => void recall()} variant="outline" busy={busy && !calling} disabled={busy} testID="letters-recall" />
          {sky}
        </>
      );
    // The picker is the only thing under the window while choosing, as the paper is while writing.
    else if (choosing || moment.kind === 'writing') status = null;
    else if (!room) status = <Text style={quiet}>{t('letters.full', { max: PEN_PALS_MAX })}</Text>;
    else
      status = (
        <>
          {writeButton}
          {sky}
        </>
      );

    picker = choosing ? (
      <BirdPicker
        first={!data.birdChosen}
        current={data.bird}
        picked={pick}
        zer={data.zer}
        busy={busy}
        error={birdError}
        onPick={(b) => {
          haptic('select');
          setPicked(b);
          setBirdError(null);
        }}
        onConfirm={() => void chooseBird()}
        onCancel={() => {
          setChanging(false);
          setPicked(null);
        }}
      />
    ) : null;
  }

  // A called bird's letter unfolds once it has landed; under Reduce Motion, at once.
  const unfold = scene?.visitor.kind === 'arriving' && !reduce ? LETTER_FLIGHT.ms : null;
  const shownError = error && !here && moment.kind !== 'writing';

  return (
    <GradientBackground>
      <ScreenHeader title={t('letters.title')} onBack={onExit} hairline right={<LetterWidgetButton />} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView {...page.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {!data || !scene || !look || !draftsReady ? (
            home.error && !data ? (
              <ErrorRetry message={describeError(home.error, t)} onRetry={home.reload} />
            ) : (
              <LettersSkeleton size={size} />
            )
          ) : (
            <>
              <Text style={[styles.lead, dir.text, { color: colors.textSecondary }]}>{t('letters.lead')}</Text>
              {shown ? (
                // As wide as the window, so what sits on the window sits on it rather than past its edge.
                <View style={[styles.windowSpot, { width: size }]}>
                  {size > 0 ? (
                    <LetterWindow
                      scene={shown}
                      size={size}
                      onOwnGone={ownGone}
                      onVisitorGone={visitorGone}
                      onVisitorLanded={() => landedAt('sill')}
                      onOwnLanded={() => landedAt('own')}
                      onTouchdown={(spot) => touchdown(spot)}
                    />
                  ) : null}
                  {/* The control for which bird is yours sits on the window itself. */}
                  {canChange ? (
                    <PressableScale
                      onPress={startChanging}
                      accessibilityRole="button"
                      accessibilityLabel={t('letters.bird.change')}
                      hitSlop={8}
                      testID="letters-bird-change"
                      style={[styles.change, dir.row === 'row-reverse' ? styles.changeLeft : styles.changeRight, { flexDirection: dir.row, backgroundColor: colors.surface, borderColor: colors.separator }]}
                    >
                      <Icon name="palette" size={15} color={colors.textPrimary} />
                      <Text style={[styles.changeText, { color: colors.textPrimary }]}>{t('letters.bird.change')}</Text>
                    </PressableScale>
                  ) : null}
                </View>
              ) : null}
              <View style={styles.hero} accessibilityLiveRegion="polite">
                {status}
                {picker}
                {look.waiting && moment.kind !== 'writing' && !choosing ? (
                  <Text style={[styles.status, styles.quiet, { color: colors.textSecondary }]} testID="letters-waiting-line">
                    {t('letters.window.waiting')}
                  </Text>
                ) : null}
                {shownError ? (
                  <Text style={[styles.status, { color: colors.danger }]} testID="letters-error">
                    {error}
                  </Text>
                ) : null}
                {kept && !here && moment.kind !== 'writing' ? (
                  kept.threadId ? (
                    // The correspondence it can go to now, one tap away.
                    <PressableScale onPress={() => openThread(kept.threadId)} accessibilityRole="link" testID="letters-kept">
                      <Text style={[styles.status, styles.quiet, styles.link, { color: colors.textPrimary }]}>{t('letters.draft.kept', { name: kept.name })}</Text>
                    </PressableScale>
                  ) : (
                    <Text style={[styles.status, styles.quiet, { color: colors.textSecondary }]} testID="letters-kept">
                      {t('letters.draft.keptOwn')}
                    </Text>
                  )
                ) : null}
              </View>

              {/* A first letter, to whoever calls your bird: paper and notes travel, a drawing waits until you are pen pals. */}
              {moment.kind === 'writing' && canWrite ? (
                <LetterComposer
                  label={t('letters.yourLetter')}
                  busy={busy}
                  onSend={(letter) => void send(letter)}
                  onCancel={() => {
                    setError(null);
                    apply((l) => lookWithMoment(l, { kind: 'rest' }));
                  }}
                  error={error}
                  autoFocus
                  canDraw={false}
                  paper={data.paper ?? rememberedPaper()}
                  host={page.host}
                  draft={NEW_LETTER}
                  testID="letters-paper"
                />
              ) : null}

              {here && visitor ? (
                <Rise key={visitor.letter.id} delay={unfold}>
                  <View style={styles.visitor} testID="letters-visitor">
                    <LetterSheet letter={visitor.letter} from={visitorName} onReport={() => setReporting(true)} />
                    {/* Answering the visitor makes you pen pals, so this letter may carry a drawing. */}
                    <LetterComposer
                      key={visitor.letter.id}
                      label={t('letters.visitor.answerLabel', { name: visitorName })}
                      sendLabel={t('letters.visitor.send', { name: visitorName })}
                      busy={busy}
                      onSend={(letter) => void answer(letter)}
                      error={error}
                      canDraw
                      paper={data.paper ?? rememberedPaper()}
                      host={page.host}
                      draft={visitorDraft(visitor.letter.id)}
                      testID="letters-visitor-answer"
                    />
                    {refusal ? <PictureRefusal rejection={refusal} testID="letters-refused" /> : null}
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
                {data.penPals.length === 0 ? (
                  <Text style={[styles.empty, dir.text, { color: colors.textSecondary }]}>{t('letters.empty')}</Text>
                ) : (
                  data.penPals.map((p) => (
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
                        <View style={[styles.newBadge, { backgroundColor: colors.primary }]}>
                          <Text style={[styles.newText, { color: colors.textOnPrimary }]}>{t('letters.new')}</Text>
                        </View>
                      ) : null}
                      <Icon name="chevron-right" size={16} color={colors.textSecondary} style={dir.flip ?? undefined} />
                    </PressableScale>
                  ))
                )}
              </View>

              <View style={styles.section}>
                <View style={[styles.how, { backgroundColor: colors.surface, borderColor: colors.separator }]}>
                  <PressableScale
                    onPress={() => setHowOpen((o) => !o)}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: howOpen }}
                    testID="letters-how"
                    style={[styles.howHead, { flexDirection: dir.row }]}
                  >
                    <Icon name="question" size={18} color={colors.textSecondary} />
                    <Text style={[styles.howTitle, dir.text, { color: colors.textPrimary }]}>{t('letters.how.title')}</Text>
                    <Icon name="chevron-down" size={16} color={colors.textSecondary} style={howOpen ? styles.flipped : undefined} />
                  </PressableScale>
                  {howOpen ? (
                    <View style={styles.howLines}>
                      {(['letters.how.call', 'letters.how.ages', 'letters.how.turns', 'letters.how.safe'] as const).map((key) => (
                        <Text key={key} style={[styles.howLine, dir.text, { color: colors.textSecondary }]}>
                          {t(key)}
                        </Text>
                      ))}
                    </View>
                  ) : null}
                </View>
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
            keepDraft(who, visitorDraft(visitor.letter.id), null);
            visitorGone();
          }}
        />
      ) : null}
    </GradientBackground>
  );
}

/** The loading state in the screen's own shape: the line over the window, the window, its button and the pen pals' heading. */
function LettersSkeleton({ size }: { size: number }): React.JSX.Element {
  const { t } = useI18n();
  const dir = useDirection();
  const start = dir.row === 'row-reverse' ? 'flex-end' : 'flex-start';
  return (
    <View style={styles.skeleton} accessibilityLabel={t('common.loading')} testID="letters-loading">
      <View>
        <SkeletonText size={typography.sizes.sm} lineHeight={20} width="92%" align={start} />
        <SkeletonText size={typography.sizes.sm} lineHeight={20} width="58%" align={start} />
      </View>
      {size > 0 ? <Skeleton width={size} height={size} radius={radii.xl} style={styles.skeletonWindow} /> : null}
      <Skeleton height={50} radius={radii.pill} />
      <SkeletonText size={typography.sizes.xs} width={96} align={start} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  skeleton: { gap: spacing.lg },
  skeletonWindow: { alignSelf: 'center' },
  windowSpot: { alignSelf: 'center' },
  content: { padding: layout.gutter, paddingBottom: spacing.xxl, gap: spacing.lg },
  lead: { fontSize: typography.sizes.sm, lineHeight: 20 },
  hero: { alignItems: 'center', gap: spacing.sm, marginTop: -spacing.sm },
  status: { fontSize: typography.sizes.md, lineHeight: 22, textAlign: 'center', maxWidth: 360 },
  strong: { fontWeight: typography.weights.bold },
  quiet: { fontSize: typography.sizes.sm, lineHeight: 20 },
  link: { textDecorationLine: 'underline' },
  wide: { alignSelf: 'stretch' },
  // Your bird home with an answer while a visitor is on the sill: shown under the visitor's words, with its own way in.
  also: { alignSelf: 'stretch', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth * 2 },
  sky: { alignSelf: 'stretch', gap: spacing.md - 2, padding: spacing.md, borderRadius: radii.lg, borderWidth: StyleSheet.hairlineWidth * 2 },
  skyTop: { alignItems: 'center', gap: spacing.md - 2 },
  skyBirds: { alignItems: 'center' },
  // The birds overlap a little, each ringed in the card's colour so they read as separate birds.
  skyBird: { borderRadius: radii.pill, borderWidth: 2 },
  skyBirdOver: { marginStart: -12 },
  skyText: { flex: 1, fontSize: typography.sizes.sm, lineHeight: 20 },
  change: {
    position: 'absolute',
    top: spacing.sm + 2,
    alignItems: 'center',
    gap: 6,
    minHeight: 34,
    paddingHorizontal: spacing.md - 4,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  // In the window's corner on the line-end side.
  changeRight: { right: spacing.sm + 2 },
  changeLeft: { left: spacing.sm + 2 },
  changeText: { fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold },
  how: { borderRadius: radii.lg, borderWidth: StyleSheet.hairlineWidth * 2, paddingHorizontal: spacing.md },
  howLines: { gap: spacing.sm, paddingBottom: spacing.md, paddingStart: 18 + spacing.sm + 2 },
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
  howHead: { alignItems: 'center', gap: spacing.sm + 2, minHeight: MIN_TOUCH_TARGET + 6 },
  howTitle: { flex: 1, fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  flipped: { transform: [{ rotate: '180deg' }] },
  howLine: { fontSize: typography.sizes.sm, lineHeight: 20 },
});

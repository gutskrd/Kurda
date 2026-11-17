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

/** The window is as wide as the screen allows, and no wider than a hand's width of sky. */
const WINDOW_MAX = 300;

/** A correspondence's id, as a notification names it (`bird`): anything else is not followed. */
const THREAD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A bird at the window is read again a moment after its day is up, so it is seen flying on rather than left there. */
const AFTER_LEAVING_MS = 1500;
/** Times further off than this are left to the next read: nobody keeps one screen open for a day. */
const TIMED_MAX_MS = 26 * 3_600_000;

/** Why your bird came home by itself, as said under the window. */
const RETURNED: Record<LetterReturnReason, TranslationKey> = {
  unanswered: 'letters.returned.unanswered',
  band: 'letters.returned.band',
  full: 'letters.returned.full',
};

/** An answer whose bird had flown on, kept to send another way: to a correspondence with that person, or with your own bird. */
type Kept = { name: string; threadId: string } | { name: null; threadId: null };

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
 * first, for somebody else. While it is there your own bird stays home.
 *
 * Every letter lands at the window once, however it was heard of: your own
 * bird home with an answer, or a pen pal's bird with their next letter,
 * flies in and lays it on the sill (felt as a light knock, for anybody who
 * has not asked the phone for less motion), and after that waits there,
 * without a flight, until the letter is read. What the window acts out is
 * worked out by the shared window logic (shared/src/letter-window.ts) from
 * the letters as the server last said them and from what is done here, and
 * they are read again whenever they may have changed (useLettersHome.ts), so
 * a bird that comes while the screen is open lands then. One letter is acted
 * out at a time; a quiet line says when another is waiting its turn. A
 * notification names its correspondence (`bird`): that bird lands first, or,
 * when there is nothing of it to land or the window is busy, the
 * correspondence opens instead.
 *
 * While your bird is out a line says where it is: out over the country
 * waiting to be called, or at somebody's window while they read your letter;
 * and when it came home by itself with your letter, why.
 *
 * Every letter is written on paper of your own (LetterComposer.tsx), which
 * opens on the paper you last wrote on: its lines, colour and ink, and notes
 * stuck to it. A first letter to somebody new carries no drawing — drawings
 * travel only between pen pals — but the answer to a bird at your window may.
 * What is on the paper is kept as it is written (drafts.ts), and an answer
 * whose bird flew on before it was sent is kept for that person's
 * correspondence, or for your own bird.
 *
 * Under it your pen pals, the one most recently written to first, each with
 * whose turn it is, and one short list of how it works. Reporting and
 * blocking are on each correspondence, and on a visiting bird's letter.
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
  const [kept, setKept] = useState<Kept | null>(null);
  const [howOpen, setHowOpen] = useState(false);
  // choosing a new bird after the first, and the one picked while choosing, which the window shows on the sill
  const [changing, setChanging] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);
  const [birdError, setBirdError] = useState<string | null>(null);
  // the page the paper lies on: held still while drawing, and kept with the writing above the keyboard
  const page = usePaperScroll();

  // what the window acts out: worked out from each read of the letters, and by what is done here (`apply`), the
  // latest always in the ref so a flight that ends and a read that comes in the same moment both build on it
  const [look, setLook] = useState<WindowLook | null>(null);
  const current = useRef<WindowLook | null>(null);
  // the letters this window has told the server landed, so each is told once
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

  // the paper you last wrote on, for this sheet and for a correspondence opened from here
  useEffect(() => rememberPaper(data?.paper), [data?.paper]);

  // the correspondence a notification was about: acted on with a read asked after it came, which knows of its letter
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
    // the first read is already on its way; once the letters are there, a new hint asks again
    if (readSoFar.current === null) setHintFrom({ id: hint, seq: asked() });
    else {
      setHintFrom({ id: hint, seq: asked() + 1 });
      reload();
    }
  }, [hint, asked, reload]);
  const ready = hint !== null && hintFrom?.id === hint && home.read !== null && home.read.seq >= hintFrom.seq ? hint : null;

  // the window is held still for anything open under it or on its way, so nothing is swapped out under the person; a
  // letter being written and a bird in flight hold it by themselves, and the look runs again as soon as any hold ends
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

  // what was made of a notification's bird: it lands here, and is let go; or its correspondence opens over the window
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

  // a bird at the window whose day is up, or yours at somebody else's, is read again then, by the server's clock
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
   * The answer begun to a bird that has left the window without it, kept to
   * send another way: to a correspondence with that person if you write to
   * each other already, or else with your own bird to somebody new. Says
   * where it went, or null when nothing was written (an answer sent, or one
   * sent on or blocked, has been let go already).
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

  // a bird that leaves the window by itself (its day up while an answer was being written, or answered on another
  // phone or the website) takes nothing with it: what was on the paper is kept, and the screen says where
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

  // an answer begun to a bird whose day ran out while the app was closed is found once the drafts are read, and kept
  // for your own bird (who it was for is not known any more), said once
  const strayChecked = useRef(false);
  useEffect(() => {
    if (strayChecked.current || !data || !who || !draftsReady) return;
    strayChecked.current = true;
    let moved = false;
    for (const place of strayAnswers(who, data.visitor?.letter.id ?? null)) moved = moveDraft(who, place, NEW_LETTER, { strokes: false }) || moved;
    if (moved) setKept({ name: null, threadId: null });
  }, [data, who, draftsReady]);

  // a window with no width yet (a screen still being laid out) is not drawn until it has one
  const size = Math.max(0, Math.min(width - layout.gutter * 2, WINDOW_MAX));

  const scene = look?.scene ?? null;
  const moment: WindowMoment = look?.moment ?? { kind: 'rest' };
  const visitor = look?.visitor ?? null;
  const out = scene !== null && (scene.own.kind === 'away' || moment.kind === 'waiting');
  const here = visitor !== null && scene !== null && (scene.visitor.kind === 'arriving' || scene.visitor.kind === 'here');
  // nothing is being said of the sill, or only that your bird came home by itself: the bird can be chosen then
  const calm = moment.kind === 'rest' || moment.kind === 'returned';
  // the bird is chosen at home, while nothing else is going on: the first time before the first letter, later whenever wanted
  const choosing = data !== null && data.refusal === null && !out && !here && calm && (!data.birdChosen || changing);
  // your own bird can be changed while it is home and nothing else is happening at the window: the button sits on the window itself
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

  /** The letter on the sill opened before its bird is down: it was seen at the window all the same, so it does not fly in again next time. */
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
    const res = await client.post<BirdOutResult>('/letters/out', letter);
    setBusy(false);
    if (!res.ok) {
      haptic('error');
      // refused because your bird is out already, sent from another phone or the website: the paper is put away (what
      // is on it is kept for when the bird is home) and the letters read again show the bird out, with the way back
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

  /** Your bird has flown out through the window: it waits out there now. */
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
      // a bird already at the window (called on another phone) is shown there by the read
      haptic('error');
      setError(said(res.error));
      home.reload();
      return;
    }
    haptic('tap');
    setAskingOn(false);
    // the first bird out there is the one that comes: it leaves the sky as it sets out
    apply((l) => lookAfterCall(l, res.data.visitor));
    home.reload();
  };

  const answer = async (letter: ComposedLetter): Promise<void> => {
    const came = current.current?.visitor;
    if (!came || !data) return;
    home.drop();
    setBusy(true);
    setError(null);
    const res = await client.post<VisitorAnswer>('/letters/visitor', letter);
    setBusy(false);
    if (!res.ok) {
      haptic('error');
      const gone = res.error.code === 'NO_VISITOR' || res.error.code === 'BIRD_GONE';
      if (gone) {
        // the bird flew on before the answer reached it: the answer is kept, to go to them in your letters if you
        // write to each other already, or else with your own bird to somebody new
        setKept(keepAnswer(came, data.penPals));
        apply(lookAfterVisitorGone);
      }
      setError(gone ? t('letters.visitor.gone') : said(res.error));
      home.reload();
      return;
    }
    haptic('celebrate');
    keepDraft(who, visitorDraft(came.letter.id), null);
    // your letter drops onto the sill, their bird takes it home, and the two birds chirp to each other
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
      // an answer begun to a bird sent on is not for anybody else
      keepDraft(who, visitorDraft(came.letter.id), null);
      apply(lookAfterSendOn);
    } else if (res.error.status !== 404) {
      // still at the window: said, so the button is not taken for one that did nothing
      haptic('error');
      setError(said(res.error));
    }
    // a 404 is a bird that had flown on already: the read says so, and the window shows it going
    home.reload();
  };

  /** The visiting bird has flown off through the window, with your answer or on to somebody else. */
  const visitorGone = (): void => {
    apply(lookAfterVisitorGone);
    home.reload();
  };

  /**
   * The window says it showed these letters land, each once however many
   * moments say so; asked again once if the network failed, and otherwise
   * they land again on the next visit.
   */
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
   * A bird flying in has come down on the sill: its letter has landed, and
   * the server is told at once rather than when the bird has finished laying
   * it down and looking about, so a screen left meanwhile does not land it
   * again next time. A bird bringing a letter is felt landing too, a light
   * knock, when it was seen flying in: not for a reader who asked for less
   * motion, nor with no window drawn.
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

  /** A bird has settled on the sill with its letter laid down: the window shows it there from now on. */
  const landedAt = (spot: WindowSpot): void => {
    const was = current.current;
    if (!was) return;
    const done = lookAfterLanded(was, spot);
    if (!done.landed) return;
    current.current = done.look;
    setLook(done.look);
    tellLanded(done.post);
  };

  // with no window drawn there is no flight to watch, so what follows one follows at once
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
    // called back, it flies home with its letter; any other answer (answered meanwhile, or not out) is what the read shows
    if (res.ok) apply((l) => lookAfterRecall(l, data.bird));
    else if (res.error.status !== 404) {
      // still out there: said, so the button is not taken for one that did nothing
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
    // spent meanwhile, on another phone or the website: the Zêr there are now say how many are missing
    if (!res.ok && res.error.code === 'INSUFFICIENT_FUNDS') {
      haptic('error');
      home.reload();
      return;
    }
    // sent out meanwhile from somewhere else: a bird out is not changed, and the read shows it out
    if (!res.ok && res.error.code === 'BIRD_OUT') {
      haptic('error');
      setChanging(false);
      setPicked(null);
      setError(said(res.error));
      home.reload();
      return;
    }
    // the same bird again is no change: there is nothing to pay and nothing to say; any other refusal is said in
    // your language, and the letters read again show why
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

  // the picker takes the place of whatever is open under the window, the paper included, so the button always does what it says
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
    // the birds out there: the first few of them as they look, how many there are, and the way to call one, as one card
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

    if (data.refusal === 'birth_month') status = <Text style={quiet}>{t('letters.refusal.birthMonth')}</Text>;
    else if (data.refusal === 'restricted') status = <Text style={quiet}>{t('letters.refusal.restricted')}</Text>;
    else if (moment.kind === 'answered') {
      const { person, threadId } = moment;
      status =
        scene.visitor.kind === 'leaving' ? (
          <Text style={strong}>{t('letters.visitor.leaving', { name: person.name })}</Text>
        ) : (
          <>
            <Text style={strong}>{t('letters.pals.now', { name: person.name })}</Text>
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
            {/* your own bird came home with an answer while this one was here: it is said, and can be read, all the same */}
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
          {/* where your bird is: out over the country waiting to be called, or at somebody's window being read */}
          <Text style={quiet} testID="letters-out">
            {flightOf(data) === 'window' ? t('letters.out.visiting') : t('letters.out.body', { days: BIRD_OUT_DAYS })}
          </Text>
          <ClayButton label={t('letters.recall')} onPress={() => void recall()} variant="outline" busy={busy && !calling} disabled={busy} testID="letters-recall" />
          {sky}
        </>
      );
    // the picker is the one thing under the window while a bird is chosen, as the paper is while a letter is written
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

  // a called bird's letter unfolds once the bird has landed with it; a reader who asked for less motion has it at once
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
                // as wide as the window, so what sits on the window sits on it, not on the edge of the screen beyond it
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
                  {/* the one control that is about your own bird, which bird it is, sits on the window itself */}
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
                    // the correspondence it can go to now, one tap away
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

              {/* a first letter, to whoever calls your bird: its paper and notes travel, a drawing waits until you are pen pals */}
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
                    {/* answering the bird at your window makes you pen pals, so this letter may carry a drawing */}
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

/**
 * The screen while it is read, in its own shape: the line over the window,
 * the window, the button under it and the pen pals' heading — so the page
 * that arrives is the one that was standing there, not a blank under the
 * header.
 */
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
  // your own bird home with an answer while a visitor is on the sill: said under the visitor's words, with its own way in
  also: { alignSelf: 'stretch', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth * 2 },
  sky: { alignSelf: 'stretch', gap: spacing.md - 2, padding: spacing.md, borderRadius: radii.lg, borderWidth: StyleSheet.hairlineWidth * 2 },
  skyTop: { alignItems: 'center', gap: spacing.md - 2 },
  skyBirds: { alignItems: 'center' },
  // the birds overlap a little, each ringed in the card's colour so they read as birds, not a blot
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
  // in the window's corner on the side a line ends on
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

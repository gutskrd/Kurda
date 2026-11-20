import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  BIRD_OUT_DAYS,
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
import { useAuth } from '../auth/AuthProvider';
import { useMemoryOwner } from '../lib/useApi';
import { describeError } from '../lib/api';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { ErrorState } from '../components/states';
import { ChevronIcon, HelpIcon, PaletteIcon } from '../components/icons';
import { ReportSheet } from '../reports/ReportSheet';
import { LetterWindow, type WindowScene } from './LetterWindow';
import { PictureRefusal } from '../pictures/PictureCheck';
import { BirdBadge, LetterSheet, drawingHeld } from './LetterParts';
import { LetterComposer, type LetterToSend } from './LetterComposer';
import { BirdPicker } from './BirdPicker';
import { letterErrorText } from './errors';
import { rememberPaper } from './paper';
import { NEW_LETTER, keepDraft, moveDraft, strayAnswers, threadDraft, visitorDraft } from './drafts';
import { useLettersHome } from './useLettersHome';
import './letters.css';

/** A correspondence's id, as a notification names it (`?bird=`): anything else is not followed. */
const THREAD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A bird at the window is read again a moment after its day is up, so it is seen flying on rather than left there. */
const AFTER_LEAVING_MS = 1500;
/** Times further off than this are left to the next read: nobody keeps one page open for a day. */
const TIMED_MAX_MS = 26 * 3_600_000;

/** Why your bird came home by itself, as said under the window. */
const RETURNED: Record<LetterReturnReason, MessageKey> = {
  unanswered: 'letters.returned.unanswered',
  band: 'letters.returned.band',
  full: 'letters.returned.full',
};

/** An answer whose bird had flown on, kept to send another way: to a correspondence with that person, or with your own bird. */
type Kept = { name: string; threadId: string } | { name: null; threadId: null };

/**
 * Letters by bird (/app/letters). The window shows the birds out with letters from people the reader's age; the first
 * visit picks a bird. To meet someone, send a letter with your own bird to wait, or call a bird to the window, read
 * its letter, and either answer (becoming pen pals) or send it on.
 *
 * Every letter lands at the window once, then waits on the sill until read. The shared window logic
 * (shared/src/letter-window.ts) decides what to act out from the server's state and local actions; the page refetches
 * whenever the server reports a change. One letter plays at a time, with a note when another waits. A notification's
 * `?bird=` lands that bird first, or opens its correspondence when nothing can land. A line says where the reader's
 * bird is, and why if it came home unanswered. Below are the pen pals, most recent first, and a short how-to. An answer
 * whose drawing waits for a person to check it is said to be checked before it goes.
 */
export function LettersPage(): React.JSX.Element {
  const t = useT();
  const { client } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const home = useLettersHome();
  const data = home.read?.data ?? null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kept, setKept] = useState<Kept | null>(null);
  // an answer's drawing refused, said under the paper; and the correspondence whose answer is held for a person
  const [refusal, setRefusal] = useState<PictureRejection | null>(null);
  const [heldIn, setHeldIn] = useState<string | null>(null);
  const [askingOn, setAskingOn] = useState(false);
  const [reporting, setReporting] = useState(false);
  // choosing a new bird after the first, and the one picked while choosing, which the window shows on the sill
  const [changing, setChanging] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);
  const [birdError, setBirdError] = useState<string | null>(null);

  // what the window acts out: worked out from each read of the page, and by what is done here (`apply`), the latest
  // always in the ref so a flight that ends and a read that comes in the same moment both build on it
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

  const who = useMemoryOwner();
  // the paper last written on, for a correspondence opened from here to start on it too
  useEffect(() => rememberPaper(who, data?.paper), [who, data?.paper]);

  // the correspondence a notification was about: acted on with a read asked after it came, which knows of its letter
  const bird = params.get('bird');
  const hint = bird && THREAD_ID.test(bird) ? bird : null;
  const [hintFrom, setHintFrom] = useState<{ id: string; seq: number } | null>(null);
  const readSoFar = useRef(home.read);
  readSoFar.current = home.read;
  useEffect(() => {
    if (!hint) {
      setHintFrom(null);
      return;
    }
    // the first read is already on its way; once the page is there, a new hint asks again
    if (readSoFar.current === null) setHintFrom({ id: hint, seq: home.asked() });
    else {
      setHintFrom({ id: hint, seq: home.asked() + 1 });
      home.reload();
    }
  }, [hint, home.asked, home.reload]);
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

  // what was made of a notification's bird: it lands here, so the address loses it; or its correspondence opens
  useEffect(() => {
    if (bird === null) return;
    const drop = (): void =>
      setParams(
        (p) => {
          const next = new URLSearchParams(p);
          next.delete('bird');
          return next;
        },
        { replace: true },
      );
    if (!hint) return drop();
    const made = look?.hint;
    if (!made || made.threadId !== hint) return;
    if (made.outcome === 'open-thread') navigate(`/app/letters/${hint}`, { replace: true });
    else drop();
  }, [bird, hint, look?.hint, navigate, setParams]);

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
    const timer = window.setTimeout(home.reload, Math.max(0, Math.min(...times)) + AFTER_LEAVING_MS);
    return () => window.clearTimeout(timer);
  }, [data, visitorLeaves, ownLeaves, readAt, home.reload]);

  /**
   * Keeps an unsent answer to a bird that has left: as a reply in an existing correspondence with that person, or as a
   * new letter for the reader's own bird. Returns where it went, or null when nothing was written.
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
  // device) takes nothing with it: what was on the paper is kept, and the page says where
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

  // an answer begun to a bird whose day ran out while the page was closed is found on the first read, and kept for
  // your own bird (who it was for is not known any more), said once
  const strayChecked = useRef(false);
  useEffect(() => {
    if (strayChecked.current || !data || !who) return;
    strayChecked.current = true;
    let moved = false;
    for (const place of strayAnswers(who, data.visitor?.letter.id ?? null)) moved = moveDraft(who, place, NEW_LETTER, { strokes: false }) || moved;
    if (moved) setKept({ name: null, threadId: null });
  }, [data, who]);

  const scene = look?.scene ?? null;
  const moment: WindowMoment = look?.moment ?? { kind: 'rest' };
  const visitor = look?.visitor ?? null;
  const out = scene !== null && (scene.own.kind === 'away' || moment.kind === 'waiting');
  const here = visitor !== null && scene !== null && (scene.visitor.kind === 'arriving' || scene.visitor.kind === 'here');
  // nothing is being said of the sill, or only that your bird came home by itself: the bird can be chosen then
  const calm = moment.kind === 'rest' || moment.kind === 'returned';
  // the bird is chosen at home, while nothing else is going on: the first time before the first letter, later whenever wanted
  const choosing = data !== null && data.refusal === null && !out && !here && calm && (!data.birdChosen || changing);
  const pick = picked ?? data?.bird ?? 0;
  const shown = useMemo<WindowScene | null>(
    () => (choosing && scene && (scene.own.kind === 'home' || scene.own.kind === 'here') ? { ...scene, own: { kind: scene.own.kind, bird: pick } } : scene),
    [choosing, scene, pick],
  );

  if (home.error && !data) return <ErrorState message={home.error} onRetry={home.reload} />;
  if (!data || !scene || !look) return <div className="container letters-page" aria-busy="true" />;

  const said = (err: Parameters<typeof letterErrorText>[0]): string => letterErrorText(err, t) ?? describeError(err, t);

  async function send(letter: LetterToSend): Promise<void> {
    if (!data) return;
    home.drop();
    setBusy(true);
    setError(null);
    const res = await client.post<BirdOutResult>('/letters/out', letter);
    setBusy(false);
    if (!res.ok) {
      // refused because your bird is out already, sent from another tab or the phone: the paper is put away (what is on
      // it is kept for when the bird is home) and the page read again shows the bird out, with the way to call it back
      setError(said(res.error));
      if (res.error.code === 'BIRD_OUT') apply((l) => lookWithMoment(l, { kind: 'rest' }));
      home.reload();
      return;
    }
    keepDraft(who, NEW_LETTER, null);
    setKept(null);
    apply((l) => lookAfterSend(l, data.bird, res.data));
  }

  /** Your bird has flown out through the window: it waits out there now. */
  function ownGone(): void {
    apply(lookAfterOwnGone);
    home.reload();
  }

  async function call(): Promise<void> {
    home.drop();
    setBusy(true);
    setError(null);
    setKept(null);
    setRefusal(null);
    const res = await client.post<{ visitor: LetterVisitor }>('/letters/call', {});
    setBusy(false);
    if (!res.ok) {
      // a bird already at the window (called in another tab) is shown there by the read
      setError(said(res.error));
      home.reload();
      return;
    }
    setAskingOn(false);
    apply((l) => lookAfterCall(l, res.data.visitor));
    home.reload();
  }

  async function answer(letter: LetterToSend): Promise<void> {
    const came = look?.visitor;
    if (!came || !data) return;
    home.drop();
    setBusy(true);
    setError(null);
    setRefusal(null);
    const res = await client.post<VisitorAnswer>('/letters/visitor', letter);
    setBusy(false);
    if (!res.ok && res.error.rejection) {
      setRefusal(res.error.rejection);
      return;
    }
    if (!res.ok) {
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
    keepDraft(who, visitorDraft(came.letter.id), null);
    setHeldIn(drawingHeld(res.data.letter) ? res.data.threadId : null);
    // your letter drops onto the sill, their bird takes it home, and the two birds chirp to each other
    apply((l) => lookAfterAnswer(l, res.data));
    home.reload();
  }

  async function sendOn(): Promise<void> {
    const came = look?.visitor;
    if (!came) return;
    home.drop();
    setBusy(true);
    const res = await client.delete('/letters/visitor');
    setBusy(false);
    setAskingOn(false);
    if (res.ok) {
      // an answer begun to a bird sent on is not for anybody else
      keepDraft(who, visitorDraft(came.letter.id), null);
      apply(lookAfterSendOn);
    }
    // otherwise it had flown on already, or the network failed: the read says which, and the window shows it
    home.reload();
  }

  /** The visiting bird has flown off through the window, with your answer or on to somebody else. */
  function visitorGone(): void {
    apply(lookAfterVisitorGone);
    home.reload();
  }

  /** A bird has settled on the sill with its letter laid down: the window shows it there from now on. */
  function landedAt(spot: WindowSpot): void {
    const was = current.current;
    if (!was) return;
    const done = lookAfterLanded(was, spot);
    if (!done.landed) return;
    current.current = done.look;
    setLook(done.look);
    tellLanded(done.post);
  }

  /**
   * A bird has touched down, so the server is told the letter landed at once, before the bird settles, so a page
   * closed meanwhile does not land it again next time.
   */
  function touchdown(spot: WindowSpot): void {
    const l = current.current;
    if (!l) return;
    if (l.landing?.spot === spot && !l.landing.item.landed && l.landing.item.letterId) tellLanded([l.landing.item.letterId]);
    else if (spot === 'own' && !l.landing && l.returned && !l.returned.landed) tellLanded([l.returned.letterId]);
  }

  /** Tells the server these letters landed, once each; retried once on a network failure, else they land again next visit. */
  function tellLanded(letterIds: readonly string[], again = true): void {
    const fresh = letterIds.filter((id) => !told.current.has(id));
    if (fresh.length === 0) return;
    for (const id of fresh) told.current.add(id);
    void client.post('/letters/landed', { letterIds: fresh }).then((res) => {
      if (res.ok || res.error.kind !== 'network') return;
      for (const id of fresh) told.current.delete(id);
      if (again) window.setTimeout(() => tellLanded(fresh, false), 5000);
    });
  }

  /** The letter on the sill opened before its bird is down: it was seen at the window all the same, so it does not fly in again next time. */
  function readLanded(): void {
    const shownLanding = current.current?.landing;
    if (shownLanding && !shownLanding.item.landed && shownLanding.item.letterId) tellLanded([shownLanding.item.letterId]);
  }

  async function recall(): Promise<void> {
    if (!data) return;
    home.drop();
    setBusy(true);
    const res = await client.delete('/letters/out');
    setBusy(false);
    // called back, it flies home with its letter; any other answer (answered meanwhile, or not out) is what the read shows
    if (res.ok) apply((l) => lookAfterRecall(l, data.bird));
    home.reload();
  }

  async function chooseBird(): Promise<void> {
    if (!data) return;
    setBusy(true);
    setBirdError(null);
    const res = await client.post<LettersHome>('/letters/bird', { bird: pick });
    setBusy(false);
    // spent meanwhile, in another tab: the Zêr there are now say how many are missing
    if (!res.ok && res.error.code === 'INSUFFICIENT_FUNDS') {
      home.reload();
      return;
    }
    // the same bird again is no change: there is nothing to pay and nothing to say; any other refusal (your bird
    // flew out meanwhile, from another tab or the phone) is said in your language, and the page read again shows why
    if (!res.ok && res.error.code !== 'LETTER_BIRD_SAME') {
      setBirdError(said(res.error));
      home.reload();
      return;
    }
    setChanging(false);
    setPicked(null);
    apply((l) => lookAfterBirdChosen(l, res.ok ? res.data.bird : pick));
    home.reload();
  }

  // the picker takes the place of whatever is open under the window, the paper included, so the button always does what it says
  function startChanging(): void {
    if (!data) return;
    setPicked(data.bird);
    setBirdError(null);
    setError(null);
    apply((l) => lookWithMoment(l, { kind: 'rest' }));
    setChanging(true);
  }

  function write(): void {
    setError(null);
    setKept(null);
    apply((l) => lookWithMoment(l, { kind: 'writing' }));
  }

  const room = data.roomForMore;
  const canWrite = data.refusal === null && !out && !here && room && scene.own.kind !== 'leaving';
  const canCall = data.refusal === null && !here && room && data.birdsOut > 0 && data.callsLeft > 0;
  const visitorName = visitor?.person.name ?? '';

  // the birds out there: the first few of them as they look, how many there are, and the way to call one
  const sky =
    data.refusal === null && room && !here ? (
      <div className={`letters-sky${data.birdsOut === 0 ? ' is-empty' : ''}`}>
        {data.sky.length > 0 && (
          <span className="letters-sky-birds" aria-hidden="true">
            {data.sky.slice(0, 4).map((b, i) => (
              <BirdBadge key={`${i}-${b}`} bird={b} size={34} />
            ))}
          </span>
        )}
        <p className="letters-sky-text">
          {data.birdsOut === 0 ? t('letters.sky.none') : data.birdsOut === 1 ? t('letters.sky.one') : t('letters.sky.many', { count: data.birdsOut })}
        </p>
        {data.birdsOut > 0 &&
          (data.callsLeft > 0 ? (
            <button type="button" className="btn btn-secondary letters-call" onClick={() => void call()} disabled={busy || !canCall}>
              {busy ? t('letters.calling') : t('letters.call')}
            </button>
          ) : (
            <p className="letters-sky-done">{t('letters.callsDone')}</p>
          ))}
      </div>
    ) : null;
  // your own bird can be changed while it is home and nothing else is happening at the window: the button sits on the window itself
  const canChange = data.refusal === null && data.birdChosen && !out && !here && !choosing && (calm || moment.kind === 'writing');
  const writeButton = (
    <button type="button" className="btn btn-primary letters-write" onClick={write}>
      {t('letters.write')}
    </button>
  );

  let status: React.ReactNode;
  if (data.refusal === 'birth_month')
    status = (
      <>
        <p className="letters-status">{t('letters.refusal.birthMonth')}</p>
        <Link to="/app/settings/birth-month" className="btn btn-primary">
          {t('letters.refusal.birthMonthAction')}
        </Link>
      </>
    );
  else if (data.refusal === 'restricted') status = <p className="letters-status">{t('letters.refusal.restricted')}</p>;
  else if (moment.kind === 'answered')
    status =
      scene.visitor.kind === 'leaving' ? (
        <p className="letters-status letters-status--strong">{t('letters.visitor.leaving', { name: moment.person.name })}</p>
      ) : (
        <>
          <p className="letters-status letters-status--strong">{t('letters.pals.now', { name: moment.person.name })}</p>
          {heldIn === moment.threadId && <p className="letters-status">{t('pictureCheck.held.letter')}</p>}
          <Link to={`/app/letters/${moment.threadId}`} className="btn btn-secondary">
            {t('letters.pals.open', { name: moment.person.name })}
          </Link>
          {canWrite && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={write}>
              {t('letters.write')}
            </button>
          )}
          {sky}
        </>
      );
  else if ((moment.kind === 'sentOn' || moment.kind === 'flownOn') && scene.visitor.kind === 'leaving')
    status = <p className="letters-status">{t('letters.visitor.sentOn', { name: moment.name })}</p>;
  else if (here && visitor)
    status =
      scene.visitor.kind === 'arriving' ? (
        <p className="letters-status">{t('letters.visitor.coming')}</p>
      ) : (
        <>
          <p className="letters-status letters-status--strong">{t('letters.visitor.title', { name: visitorName })}</p>
          <p className="letters-status">{t('letters.visitor.body')}</p>
          {/* your own bird came home with an answer while this one was here: it is said, and can be read, all the same */}
          {moment.kind === 'homecoming' && (
            <p className="letters-status letters-status--also">
              {t('letters.home.title', { name: moment.person.name })}{' '}
              <Link to={`/app/letters/${moment.threadId}`} className="reach-line" onClick={() => readLanded()}>
                {t('letters.home.read')}
              </Link>
            </p>
          )}
        </>
      );
  else if (moment.kind === 'homecoming' || moment.kind === 'arrival') {
    status = (
      <>
        <p className="letters-status letters-status--strong">
          {moment.kind === 'homecoming' ? t('letters.home.title', { name: moment.person.name }) : t('letters.arrival.title', { name: moment.person.name })}
        </p>
        <Link
          to={`/app/letters/${moment.threadId}`}
          className="btn btn-primary"
          onClick={() => readLanded()}
        >
          {t('letters.home.read')}
        </Link>
      </>
    );
  } else if (moment.kind === 'returned')
    status = (
      <>
        <p className="letters-status letters-status--strong">{t('letters.returned.title')}</p>
        <p className="letters-status">{t(RETURNED[moment.why], { days: BIRD_OUT_DAYS, max: PEN_PALS_MAX })}</p>
        {choosing ? null : canWrite ? writeButton : !room ? <p className="letters-status">{t('letters.full', { max: PEN_PALS_MAX })}</p> : null}
        {!choosing && sky}
      </>
    );
  else if (moment.kind === 'sent') status = <p className="letters-status">{t('letters.flying')}</p>;
  else if (out)
    status = (
      <>
        <p className="letters-status letters-status--strong">{t('letters.out.title')}</p>
        <p className="letters-status">{flightOf(data) === 'window' ? t('letters.out.visiting') : t('letters.out.body', { days: BIRD_OUT_DAYS })}</p>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void recall()} disabled={busy}>
          {t('letters.recall')}
        </button>
        {sky}
      </>
    );
  // the picker is the one thing under the window while a bird is chosen, as the paper is while a letter is written
  else if (choosing || moment.kind === 'writing') status = null;
  else if (!room) status = <p className="letters-status">{t('letters.full', { max: PEN_PALS_MAX })}</p>;
  else
    status = (
      <>
        {writeButton}
        {sky}
      </>
    );
  const picker = choosing ? (
    <BirdPicker
      first={!data.birdChosen}
      current={data.bird}
      picked={pick}
      zer={data.zer}
      busy={busy}
      error={birdError}
      onPick={(b) => {
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

  return (
    <div className="container letters-page">
      <header className="letters-head">
        <h1 className="page-title">{t('letters.title')}</h1>
        <p className="letters-lead">{t('letters.lead')}</p>
      </header>

      <section className="letters-hero">
        <div className="letters-window">
          {shown && (
            <LetterWindow
              scene={shown}
              onOwnGone={ownGone}
              onVisitorGone={visitorGone}
              onVisitorLanded={() => landedAt('sill')}
              onOwnLanded={() => landedAt('own')}
              onTouchdown={touchdown}
            />
          )}
          {canChange && (
            <button type="button" className="letters-change" onClick={startChanging}>
              <PaletteIcon size={15} />
              {t('letters.bird.change')}
            </button>
          )}
        </div>
        <div className="letters-hero-text" aria-live="polite">
          {status}
          {picker}
          {look.waiting && moment.kind !== 'writing' && !choosing && <p className="letters-status letters-status--quiet">{t('letters.window.waiting')}</p>}
          {error && !here && moment.kind !== 'writing' && (
            <p className="letters-picker-error" role="alert">
              {error}
            </p>
          )}
          {kept && !here && moment.kind !== 'writing' && (
            <p className="letters-status letters-status--quiet">
              {kept.threadId ? (
                <Link to={`/app/letters/${kept.threadId}`} className="reach-line">
                  {t('letters.draft.kept', { name: kept.name })}
                </Link>
              ) : (
                t('letters.draft.keptOwn')
              )}
            </p>
          )}
        </div>
      </section>

      {moment.kind === 'writing' && canWrite && (
        <LetterComposer
          label={t('letters.yourLetter')}
          paper={data.paper}
          // a first letter goes to somebody not yet met: what is drawn only travels between pen pals
          canDraw={false}
          draft={NEW_LETTER}
          busy={busy}
          onSend={(letter) => void send(letter)}
          onCancel={() => {
            setError(null);
            apply((l) => lookWithMoment(l, { kind: 'rest' }));
          }}
          error={error}
          autoFocus
        />
      )}

      {here && visitor && (
        <section className={`letters-arrived${scene.visitor.kind === 'arriving' ? ' is-landing' : ''}`} aria-label={t('letters.visitor.title', { name: visitorName })}>
          <LetterSheet letter={visitor.letter} from={visitorName} onReport={() => setReporting(true)} />
          <LetterComposer
            key={visitor.letter.id}
            label={t('letters.visitor.answerLabel', { name: visitorName })}
            sendLabel={t('letters.visitor.send', { name: visitorName })}
            paper={data.paper}
            // answering makes the two of you pen pals, so the answer may carry a drawing
            canDraw
            draft={visitorDraft(visitor.letter.id)}
            busy={busy}
            onSend={(letter) => void answer(letter)}
            error={error}
          />
          {refusal && <PictureRefusal rejection={refusal} className="letters-refused" />}
          <p className="letters-status letters-status--quiet">{t('letters.visitor.ownWaits', { name: visitorName })}</p>
          {askingOn ? (
            <div className="letters-ask" role="group" aria-label={t('letters.visitor.sendOn')}>
              <p className="letters-status">{t('letters.visitor.sendOnAsk', { name: visitorName })}</p>
              <div className="letters-ask-actions">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => void sendOn()} disabled={busy}>
                  {t('letters.visitor.sendOnYes')}
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAskingOn(false)}>
                  {t('letters.visitor.keep')}
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="letters-text-button" onClick={() => setAskingOn(true)} disabled={busy}>
              {t('letters.visitor.sendOn')}
            </button>
          )}
        </section>
      )}

      <section className="letters-pals" aria-labelledby="letters-pals-title">
        <h2 id="letters-pals-title" className="letters-section-title">
          {t('letters.penPals')}
        </h2>
        {data.penPals.length === 0 ? (
          <p className="letters-empty">{t('letters.empty')}</p>
        ) : (
          <ul className="letters-pal-list">
            {data.penPals.map((p) => (
              <li key={p.threadId}>
                <Link to={`/app/letters/${p.threadId}`} className="letters-pal">
                  <BirdBadge bird={p.person.bird} />
                  <span className="letters-pal-text">
                    <span className="letters-pal-name">{p.person.name}</span>
                    <span className={`letters-pal-turn${p.yourTurn ? ' is-yours' : ''}`}>{p.yourTurn ? t('letters.yourTurn') : t('letters.theirTurn')}</span>
                  </span>
                  {p.unread > 0 && <span className="letters-pal-new">{t('letters.new')}</span>}
                  <ChevronIcon size={16} className="letters-pal-go" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <details className="letters-how">
        <summary>
          <HelpIcon size={18} className="letters-how-icon" />
          <span>{t('letters.how.title')}</span>
          <ChevronIcon size={16} className="letters-how-open" />
        </summary>
        <ul>
          <li>{t('letters.how.call')}</li>
          <li>{t('letters.how.ages')}</li>
          <li>{t('letters.how.turns')}</li>
          <li>{t('letters.how.safe')}</li>
        </ul>
      </details>

      {visitor && (
        <ReportSheet
          open={reporting}
          onClose={() => setReporting(false)}
          target={{ targetType: 'letter', targetId: visitor.letter.id }}
          block={{ userId: visitor.person.id, name: visitorName }}
          onBlocked={() => {
            setReporting(false);
            keepDraft(who, visitorDraft(visitor.letter.id), null);
            visitorGone();
          }}
        />
      )}
    </div>
  );
}

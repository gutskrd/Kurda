import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BIRD_OUT_DAYS, PEN_PALS_MAX, type BirdOutResult, type LetterPerson, type LetterVisitor, type LettersHome, type VisitorAnswer } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { useApiGet } from '../lib/useApi';
import { describeError } from '../lib/api';
import { useT } from '../i18n/I18nProvider';
import { ErrorState } from '../components/states';
import { ChevronIcon } from '../components/icons';
import { ReportSheet } from '../reports/ReportSheet';
import { LetterWindow, type WindowScene } from './LetterWindow';
import { BirdBadge, LetterPaper, LetterSheet } from './LetterParts';
import { BirdPicker } from './BirdPicker';
import { letterErrorText } from './errors';
import './letters.css';

/**
 * What the page is showing under the window: the letters page as it stands,
 * writing your own letter, your bird on its way out, your answer on its way
 * home with somebody's bird, that bird sent on, or your own bird home with an
 * answer.
 */
type Moment =
  | { kind: 'rest' }
  | { kind: 'writing' }
  | { kind: 'sent' }
  /** your bird has flown and waits out there: said at once, before the page has been read again */
  | { kind: 'waiting' }
  | { kind: 'answered'; person: LetterPerson; threadId: string }
  | { kind: 'sentOn'; name: string }
  | { kind: 'homecoming'; person: LetterPerson; threadId: string };

/**
 * Letters by bird (/app/letters): writing to somebody new in Kurdish, and
 * the pen pals you write to.
 *
 * At the top, your window, and over the country the birds out there, each
 * carrying a letter from somebody your age; how many is said under it. The
 * first time, you choose your bird there. Then there are two ways to meet
 * somebody: write a letter, even a word, and send your own bird out with it
 * to wait until somebody calls it; or call one of the birds out there to
 * your window. It comes down with its letter and waits on the sill beside
 * your bird while you read it. Answer it, and that same bird carries your
 * letter home and the two of you are pen pals; or send it on its way, for
 * somebody else. While it is there your own bird stays home. When your own
 * bird comes home from somebody's window with their answer, the page shows
 * it landing, and the way to read it.
 *
 * Under it, your pen pals, the one most recently written to first, each with
 * whose turn it is, and how it all works in a few lines at the foot.
 */
export function LettersPage(): React.JSX.Element {
  const t = useT();
  const { client } = useAuth();
  const home = useApiGet<LettersHome>('/letters', { fresh: true });
  const [moment, setMoment] = useState<Moment>({ kind: 'rest' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // what the window acts out: set from the page once it is read, then by what is done here
  const [scene, setScene] = useState<WindowScene | null>(null);
  // the bird at the window, as the call brought it or the page found it
  const [visitor, setVisitor] = useState<LetterVisitor | null>(null);
  const [askingOn, setAskingOn] = useState(false);
  const [reporting, setReporting] = useState(false);
  // choosing a new bird after the first, and the one picked while choosing, which the window shows on the sill
  const [changing, setChanging] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);
  const [birdError, setBirdError] = useState<string | null>(null);

  const data = home.data;
  useEffect(() => {
    if (!data) return;
    if (!scene) {
      // the first look: your bird where it is, a bird at the window still there, and your bird home with an answer landing
      const back = data.homecoming && !data.out;
      setScene({
        own: data.out ? { kind: 'away' } : back ? { kind: 'arriving', bird: data.bird } : { kind: 'home', bird: data.bird },
        visitor: data.visitor ? { kind: 'here', bird: data.visitor.person.bird } : { kind: 'none' },
        sky: data.sky,
      });
      setVisitor(data.visitor);
      if (back && data.homecoming) setMoment({ kind: 'homecoming', person: data.homecoming.person, threadId: data.homecoming.threadId });
      return;
    }
    // read again: the birds out there are as the page now says
    setScene((s) => (s && s.sky.join() !== data.sky.join() ? { ...s, sky: data.sky } : s));
  }, [data, scene]);

  const out = data !== null && (data.out !== null || moment.kind === 'waiting');
  const here = visitor !== null && scene?.visitor.kind !== 'leaving' && scene?.visitor.kind !== 'none';
  // the bird is chosen at home, while nothing else is going on: the first time before the first letter, later whenever wanted
  const choosing = data !== null && data.refusal === null && !out && !here && moment.kind === 'rest' && (!data.birdChosen || changing);
  const pick = picked ?? data?.bird ?? 0;
  const shown = useMemo<WindowScene | null>(
    () => (choosing && scene?.own.kind === 'home' ? { ...scene, own: { kind: 'home', bird: pick } } : scene),
    [choosing, scene, pick],
  );

  if (home.error && !data) return <ErrorState message={home.error} onRetry={home.reload} />;
  if (!data || !scene) return <div className="container letters-page" aria-busy="true" />;

  async function send(body: string): Promise<void> {
    if (!data) return;
    setBusy(true);
    setError(null);
    const res = await client.post<BirdOutResult>('/letters/out', { body });
    setBusy(false);
    if (!res.ok) {
      setError(letterErrorText(res.error, t) ?? describeError(res.error, t));
      return;
    }
    setMoment({ kind: 'sent' });
    setScene((s) => s && { ...s, own: { kind: 'leaving', bird: data.bird } });
  }

  /** Your bird has flown out through the window: it waits out there now. */
  function ownGone(): void {
    setScene((s) => s && { ...s, own: { kind: 'away' } });
    if (moment.kind === 'sent') setMoment({ kind: 'waiting' });
    home.reload();
  }

  async function call(): Promise<void> {
    setBusy(true);
    setError(null);
    const res = await client.post<{ visitor: LetterVisitor }>('/letters/call', {});
    setBusy(false);
    if (!res.ok) {
      setError(letterErrorText(res.error, t) ?? describeError(res.error, t));
      home.reload();
      return;
    }
    const came = res.data.visitor;
    setVisitor(came);
    setAskingOn(false);
    // the first bird out there is the one that comes: it leaves the sky as it sets out
    setScene((s) => s && { ...s, visitor: { kind: 'arriving', bird: came.person.bird }, sky: s.sky.slice(1) });
    setMoment({ kind: 'rest' });
  }

  async function answer(body: string): Promise<void> {
    if (!visitor) return;
    setBusy(true);
    setError(null);
    const res = await client.post<VisitorAnswer>('/letters/visitor', { body });
    setBusy(false);
    if (!res.ok) {
      const gone = res.error.code === 'NO_VISITOR' || res.error.code === 'BIRD_GONE';
      setError(gone ? t('letters.visitor.gone') : (letterErrorText(res.error, t) ?? describeError(res.error, t)));
      if (gone) {
        setVisitor(null);
        setScene((s) => s && { ...s, visitor: { kind: 'none' } });
        home.reload();
      }
      return;
    }
    // your letter drops onto the sill, their bird takes it home, and the two birds chirp to each other
    setMoment({ kind: 'answered', person: res.data.person, threadId: res.data.threadId });
    setScene((s) => s && { ...s, visitor: { kind: 'leaving', bird: visitor.person.bird, how: 'answered' }, song: (s.song ?? 0) + 1 });
  }

  async function sendOn(): Promise<void> {
    if (!visitor) return;
    setBusy(true);
    const res = await client.delete('/letters/visitor');
    setBusy(false);
    setAskingOn(false);
    if (res.ok || res.error.status === 404) {
      setMoment({ kind: 'sentOn', name: visitor.person.name });
      setScene((s) => s && { ...s, visitor: { kind: 'leaving', bird: visitor.person.bird, how: 'sent-on' } });
    }
  }

  /** The visiting bird has flown off through the window, with your answer or on to somebody else. */
  function visitorGone(): void {
    setVisitor(null);
    setScene((s) => s && { ...s, visitor: { kind: 'none' } });
    setMoment((m) => (m.kind === 'sentOn' ? { kind: 'rest' } : m));
    home.reload();
  }

  async function recall(): Promise<void> {
    if (!data) return;
    setBusy(true);
    const res = await client.delete('/letters/out');
    setBusy(false);
    if (res.ok || res.error.status === 404) {
      setScene((s) => s && { ...s, own: { kind: 'arriving', bird: data.bird } });
      setMoment({ kind: 'rest' });
      home.reload();
    }
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
    // the same bird again is no change: there is nothing to pay and nothing to say
    if (!res.ok && res.error.code !== 'LETTER_BIRD_SAME') {
      setBirdError(describeError(res.error, t));
      return;
    }
    setChanging(false);
    setPicked(null);
    setScene((s) => s && { ...s, own: { kind: 'home', bird: res.ok ? res.data.bird : pick } });
    home.reload();
  }

  // the picker takes the place of whatever is open under the window, the paper included, so the button always does what it says
  function startChanging(): void {
    if (!data) return;
    setPicked(data.bird);
    setBirdError(null);
    setError(null);
    setMoment({ kind: 'rest' });
    setChanging(true);
  }

  const room = data.roomForMore;
  const canWrite = data.refusal === null && !out && !here && room;
  const canCall = data.refusal === null && !here && room && data.birdsOut > 0 && data.callsLeft > 0;
  const visitorName = visitor?.person.name ?? '';

  // the birds out there, how many, and the way to call one
  const sky =
    data.refusal === null && room && !here ? (
      <div className="letters-sky">
        <p className="letters-status">
          {data.birdsOut === 0 ? t('letters.sky.none') : data.birdsOut === 1 ? t('letters.sky.one') : t('letters.sky.many', { count: data.birdsOut })}
        </p>
        {data.birdsOut > 0 &&
          (data.callsLeft > 0 ? (
            <button type="button" className="btn btn-secondary letters-call" onClick={() => void call()} disabled={busy || !canCall}>
              {busy ? t('letters.calling') : t('letters.call')}
            </button>
          ) : (
            <p className="letters-status letters-status--quiet">{t('letters.callsDone')}</p>
          ))}
      </div>
    ) : null;
  const change = (
    <button type="button" className="btn btn-ghost btn-sm" onClick={startChanging}>
      {t('letters.bird.change')}
    </button>
  );

  let status: React.ReactNode;
  if (data.refusal === 'birth_month')
    status = (
      <>
        <p className="letters-status">{t('letters.refusal.birthMonth')}</p>
        <Link to="/app/settings" className="btn btn-primary">
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
          <Link to={`/app/letters/${moment.threadId}`} className="btn btn-secondary">
            {t('letters.pals.open', { name: moment.person.name })}
          </Link>
          {canWrite && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMoment({ kind: 'writing' })}>
              {t('letters.write')}
            </button>
          )}
          {sky}
        </>
      );
  else if (moment.kind === 'sentOn' && scene.visitor.kind === 'leaving') status = <p className="letters-status">{t('letters.visitor.sentOn', { name: moment.name })}</p>;
  else if (here && visitor)
    status =
      scene.visitor.kind === 'arriving' ? (
        <p className="letters-status">{t('letters.visitor.coming')}</p>
      ) : (
        <>
          <p className="letters-status letters-status--strong">{t('letters.visitor.title', { name: visitorName })}</p>
          <p className="letters-status">{t('letters.visitor.body')}</p>
        </>
      );
  else if (moment.kind === 'homecoming')
    status = (
      <>
        <p className="letters-status letters-status--strong">{t('letters.home.title', { name: moment.person.name })}</p>
        <Link to={`/app/letters/${moment.threadId}`} className="btn btn-primary">
          {t('letters.home.read')}
        </Link>
      </>
    );
  else if (moment.kind === 'sent') status = <p className="letters-status">{t('letters.flying')}</p>;
  else if (out)
    status = (
      <>
        <p className="letters-status letters-status--strong">{t('letters.out.title')}</p>
        <p className="letters-status">{data.out?.visiting ? t('letters.out.visiting') : t('letters.out.body', { days: BIRD_OUT_DAYS })}</p>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void recall()} disabled={busy}>
          {t('letters.recall')}
        </button>
        {sky}
      </>
    );
  else if (choosing)
    status = (
      <BirdPicker
        first={!data.birdChosen}
        current={data.bird}
        picked={pick}
        zer={data.zer}
        busy={busy}
        error={birdError}
        onPick={(bird) => {
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
        <p className="letters-status">{t('letters.full', { max: PEN_PALS_MAX })}</p>
        {change}
      </>
    );
  else
    status = (
      <>
        {moment.kind !== 'writing' && (
          <button type="button" className="btn btn-primary letters-write" onClick={() => setMoment({ kind: 'writing' })}>
            {t('letters.write')}
          </button>
        )}
        {sky}
        {change}
      </>
    );

  return (
    <div className="container letters-page">
      <header className="letters-head">
        <h1 className="page-title">{t('letters.title')}</h1>
        <p className="letters-lead">{t('letters.lead')}</p>
      </header>

      <section className="letters-hero">
        {shown && (
          <LetterWindow
            scene={shown}
            onOwnGone={ownGone}
            onVisitorGone={visitorGone}
            onVisitorLanded={() => setScene((s) => (s && s.visitor.kind === 'arriving' ? { ...s, visitor: { kind: 'here', bird: s.visitor.bird } } : s))}
          />
        )}
        <div className="letters-hero-text" aria-live="polite">
          {status}
          {error && !here && moment.kind !== 'writing' && (
            <p className="letters-picker-error" role="alert">
              {error}
            </p>
          )}
        </div>
      </section>

      {moment.kind === 'writing' && canWrite && <LetterPaper label={t('letters.yourLetter')} busy={busy} onSend={(body) => void send(body)} error={error} />}

      {here && visitor && (
        <section className={`letters-arrived${scene.visitor.kind === 'arriving' ? ' is-landing' : ''}`} aria-label={t('letters.visitor.title', { name: visitorName })}>
          <LetterSheet letter={visitor.letter} from={visitorName} onReport={() => setReporting(true)} />
          <LetterPaper
            label={t('letters.visitor.answerLabel', { name: visitorName })}
            sendLabel={t('letters.visitor.send', { name: visitorName })}
            busy={busy}
            onSend={(body) => void answer(body)}
            error={error}
          />
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
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAskingOn(true)} disabled={busy}>
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
        <summary>{t('letters.how.title')}</summary>
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
            visitorGone();
          }}
        />
      )}
    </div>
  );
}

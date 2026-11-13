import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BIRD_OUT_DAYS, PEN_PALS_MAX, type BirdOutResult, type LettersHome, type LetterItem, type LetterPerson } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { useApiGet } from '../lib/useApi';
import { describeError } from '../lib/api';
import { useT } from '../i18n/I18nProvider';
import { ErrorState } from '../components/states';
import { ChevronIcon } from '../components/icons';
import { LetterWindow, type WindowScene } from './LetterWindow';
import { BirdBadge, LetterPaper, LetterSheet } from './LetterParts';
import { letterErrorText } from './errors';
import './letters.css';

/** What the page is showing under the window: the letters page as it stands, writing, a bird on its way, or a letter that has just come. */
type Moment =
  | { kind: 'rest' }
  | { kind: 'writing' }
  | { kind: 'sent'; result: BirdOutResult }
  /** your bird has flown and is out there waiting: said at once, before the page has been read again */
  | { kind: 'waiting' }
  | { kind: 'arrived'; person: LetterPerson; letter: LetterItem; threadId: string };

/**
 * Letters by bird (/app/letters): writing to somebody new in Kurdish, and
 * the pen pals you write to.
 *
 * At the top, your window. With your bird at home there is one thing to do —
 * write a letter — and sending it is watched rather than read: the bird takes
 * it in its beak and flies off. If another bird is out, theirs comes to your
 * window in the same moment with their letter, and it is read here at once;
 * if not, the sill stays empty and the page says, in plain words, that nobody
 * else has sent a bird out yet and yours is waiting for the next one, with
 * the way to call it back.
 *
 * Under it, your pen pals, the one most recently written to first, each with
 * whose turn it is. Nothing else: how it works and how to stay safe is one
 * short list at the foot, and reporting and blocking are on each
 * correspondence, where they are needed.
 */
export function LettersPage(): React.JSX.Element {
  const t = useT();
  const { client } = useAuth();
  const home = useApiGet<LettersHome>('/letters', { fresh: true });
  const [moment, setMoment] = useState<Moment>({ kind: 'rest' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // a bird on its way: what the window acts out, until it has
  const [scene, setScene] = useState<WindowScene | null>(null);

  const data = home.data;
  useEffect(() => {
    if (data && !scene) setScene(data.out ? { kind: 'away' } : { kind: 'home', bird: data.bird });
  }, [data, scene]);

  if (home.error && !data) return <ErrorState message={home.error} onRetry={home.reload} />;
  if (!data) return <div className="container letters-page" aria-busy="true" />;

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
    setMoment({ kind: 'sent', result: res.data });
    setScene({ kind: 'leaving', bird: data.bird });
  }

  /** Your bird has flown: theirs comes in with its letter, or the sill stays empty. */
  function flown(): void {
    if (moment.kind !== 'sent') return;
    const { result } = moment;
    if (result.kind === 'met') {
      setScene({ kind: 'arriving', bird: result.person.bird });
      setMoment({ kind: 'arrived', person: result.person, letter: result.letter, threadId: result.threadId });
    } else {
      setScene({ kind: 'away' });
      setMoment({ kind: 'waiting' });
    }
    home.reload();
  }

  async function recall(): Promise<void> {
    if (!data) return;
    setBusy(true);
    const res = await client.delete('/letters/out');
    setBusy(false);
    if (res.ok || res.error.status === 404) {
      setScene({ kind: 'arriving', bird: data.bird });
      setMoment({ kind: 'rest' });
      home.reload();
    }
  }

  const out = (data.out !== null || moment.kind === 'waiting') && moment.kind !== 'arrived';
  const canWrite = data.refusal === null && !out && data.roomForMore;

  return (
    <div className="container letters-page">
      <header className="letters-head">
        <h1 className="page-title">{t('letters.title')}</h1>
        <p className="letters-lead">{t('letters.lead')}</p>
      </header>

      <section className="letters-hero">
        {scene && <LetterWindow scene={scene} onDone={scene.kind === 'leaving' ? flown : undefined} />}
        <div className="letters-hero-text" aria-live="polite">
          {data.refusal === 'birth_month' ? (
            <>
              <p className="letters-status">{t('letters.refusal.birthMonth')}</p>
              <Link to="/app/settings" className="btn btn-primary">
                {t('letters.refusal.birthMonthAction')}
              </Link>
            </>
          ) : data.refusal === 'restricted' ? (
            <p className="letters-status">{t('letters.refusal.restricted')}</p>
          ) : moment.kind === 'sent' ? (
            <p className="letters-status">{t('letters.flying')}</p>
          ) : moment.kind === 'arrived' ? (
            <p className="letters-status letters-status--strong">{t('letters.met', { name: moment.person.name })}</p>
          ) : out ? (
            <>
              <p className="letters-status letters-status--strong">{t('letters.out.title')}</p>
              <p className="letters-status">{t('letters.out.body', { days: BIRD_OUT_DAYS })}</p>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => void recall()} disabled={busy}>
                {t('letters.recall')}
              </button>
            </>
          ) : !data.roomForMore ? (
            <p className="letters-status">{t('letters.full', { max: PEN_PALS_MAX })}</p>
          ) : moment.kind === 'writing' ? null : (
            <button type="button" className="btn btn-primary letters-write" onClick={() => setMoment({ kind: 'writing' })}>
              {t('letters.write')}
            </button>
          )}
        </div>
      </section>

      {moment.kind === 'writing' && canWrite && <LetterPaper label={t('letters.yourLetter')} busy={busy} onSend={(body) => void send(body)} error={error} />}

      {moment.kind === 'arrived' && (
        <section className="letters-arrived" aria-label={t('letters.met', { name: moment.person.name })}>
          <LetterSheet letter={moment.letter} from={moment.person.name} />
          <Link to={`/app/letters/${moment.threadId}`} className="btn btn-secondary">
            {t('letters.writeBack', { name: moment.person.name })}
          </Link>
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
          <li>{t('letters.how.ages')}</li>
          <li>{t('letters.how.turns')}</li>
          <li>{t('letters.how.safe')}</li>
        </ul>
      </details>
    </div>
  );
}

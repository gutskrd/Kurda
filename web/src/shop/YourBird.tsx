import { useCallback, useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { LETTER_BIRD_ORDER, LETTER_BIRD_PRICE, isLetterBird, type LettersHome } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import { useLocale, useT } from '../i18n/I18nProvider';
import { Button } from '../components/Button';
import { Skeleton } from '../components/Skeleton';
import { CheckIcon, ChevronIcon } from '../components/icons';
import { BirdBadge } from '../letters/LetterParts';
import { BIRD_NAMES } from '../letters/BirdPicker';
import { LETTERS_HOME_PATH } from '../letters/useLettersHome';
import { BuyConfirm } from './BuyConfirm';
import './yours.css';

/**
 * Your pen pal bird, in the Shop: the bird that carries your letters, and the
 * others it could be.
 *
 * The same choice the letters page offers under its window (letters/BirdPicker),
 * with the same words, laid out as the Shop lays out what it sells. The eight
 * birds are a row of radio buttons, the one that is yours marked with a tick;
 * picking another shows what it would cost against the Zêr there are, and
 * getting it asks first in the Shop's own dialog (BuyConfirm), which says the
 * price, the balance and, when the balance falls short, how much is missing,
 * and will not go on until there is enough. The first bird is chosen for free
 * and is simply taken, as anything free in the Shop is.
 *
 * Nothing is shown to somebody letters are not for (no account, no birth
 * month, a limit on writing), nor on a server without letters.
 */

/** What `GET /letters` holds, and the way to read it again or put a newer answer in its place. */
export interface LettersHomeState {
  data: LettersHome | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
  set: (next: LettersHome) => void;
}

/** Whether an answer is the letters page at all, rather than something an older server sent. */
function isLettersHome(value: unknown): value is LettersHome {
  const home = value as Partial<LettersHome> | null;
  return typeof home === 'object' && home !== null && isLetterBird(home.bird) && typeof home.birdChosen === 'boolean' && typeof home.zer === 'number';
}

/**
 * The letters page as the Shop needs it, asked for as the Shop opens so that
 * it arrives with the catalogue rather than after it. Only somebody signed in
 * is asked about; a server that has no letters (404), or an account that may
 * not have them (403), leaves nothing to show and nothing wrong.
 */
export function useLettersHome(): LettersHomeState {
  const { client, status } = useAuth();
  const t = useT();
  const signedIn = status === 'signedIn';
  const [data, setData] = useState<LettersHome | null>(null);
  const [loading, setLoading] = useState(signedIn);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!signedIn) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    // read as the window reads it: a plain read is an old app's, which takes the letter it would show as landed
    void client.get<LettersHome>(LETTERS_HOME_PATH).then((res) => {
      if (cancelled) return;
      setLoading(false);
      if (res.ok) setData(isLettersHome(res.data) ? res.data : null);
      else if (res.error.status === 404 || res.error.status === 403) setData(null);
      else setError(describeError(res.error, t));
    });
    return () => {
      cancelled = true;
    };
  }, [client, t, signedIn, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, loading, error, reload, set: setData };
}

/** The section's heading, with the way to the letters themselves at its end. */
function Heading({ id }: { id: string }): React.JSX.Element {
  const t = useT();
  return (
    <div className="yours-head">
      <h2 className="item-section-title" id={id}>
        {t('shop.bird.title')}
      </h2>
      <Link className="yours-link" to="/app/letters">
        {t('letters.title')}
        <ChevronIcon size={14} className="yours-link-chevron" />
      </Link>
    </div>
  );
}

export function YourBird({ home, zer, onZer }: { home: LettersHomeState; zer: number | null; onZer: (zer: number) => void }): React.JSX.Element | null {
  const { client } = useAuth();
  const t = useT();
  const locale = useLocale();
  const ids = useId().replace(/[^A-Za-z0-9_-]/g, '');
  const [picked, setPicked] = useState<number | null>(null);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  // the bird just made yours here, which takes a small bow
  const [won, setWon] = useState<number | null>(null);
  const number = (n: number): string => new Intl.NumberFormat(locale).format(n);
  const data = home.data;
  const headingId = `${ids}-bird`;
  const titleId = `${ids}-bird-title`;

  if (!data) {
    if (home.loading)
      return (
        <section className="yours" aria-labelledby={headingId} aria-busy="true">
          <Heading id={headingId} />
          <div className="yours-card">
            <span className="sr-only">{t('common.loading')}</span>
            <Skeleton line w="38%" />
            <Skeleton line w="62%" style={{ marginTop: 8 }} />
            <div className="yours-birds yours-birds--waiting">
              {LETTER_BIRD_ORDER.map((bird) => (
                <Skeleton key={bird} circle size={52} />
              ))}
            </div>
          </div>
        </section>
      );
    if (home.error)
      return (
        <section className="yours" aria-labelledby={headingId}>
          <Heading id={headingId} />
          <div className="yours-card yours-failed">
            <p>{home.error}</p>
            <Button variant="secondary" size="sm" onClick={home.reload}>
              {t('common.retry')}
            </Button>
          </div>
        </section>
      );
    return null;
  }
  // somebody who cannot write letters yet is told why on the letters page, where it can be put right
  if (data.refusal !== null) return null;

  const first = !data.birdChosen;
  // the Shop's own balance when it has one: it has seen whatever was bought here since the letters were read
  const purse = zer ?? data.zer;
  const pick = picked ?? data.bird;
  const same = !first && pick === data.bird;
  const missing = first ? 0 : Math.max(0, LETTER_BIRD_PRICE - purse);
  const name = (bird: number): string => t(BIRD_NAMES[bird]!);

  async function choose(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setFailed(null);
    const res = await client.post<LettersHome>('/letters/bird', { bird: pick });
    if (res.ok) {
      setBusy(false);
      home.set(res.data);
      onZer(res.data.zer);
      setAsking(false);
      setPicked(null);
      setWon(res.data.bird);
      return;
    }
    // spent meanwhile, somewhere else: the Zêr there are now say how many are missing, and the dialog waits
    // for them; the same bird again is no change, and there is nothing to pay or to say
    if (res.error.code === 'INSUFFICIENT_FUNDS' || res.error.code === 'LETTER_BIRD_SAME') {
      const again = await client.get<LettersHome>(LETTERS_HOME_PATH);
      setBusy(false);
      if (again.ok && isLettersHome(again.data)) {
        home.set(again.data);
        onZer(again.data.zer);
      }
      if (res.error.code === 'LETTER_BIRD_SAME') {
        setAsking(false);
        setPicked(null);
      }
      return;
    }
    setBusy(false);
    setFailed(describeError(res.error, t));
  }

  /** The first bird is free and simply taken; another asks first. */
  function get(): void {
    if (first) void choose();
    else {
      setFailed(null);
      setAsking(true);
    }
  }

  function keep(): void {
    setAsking(false);
    setPicked(null);
    setFailed(null);
  }

  const shortLine = missing > 0 ? t('letters.bird.short', { count: number(missing) }) : null;
  return (
    <section className="yours" aria-labelledby={headingId}>
      <Heading id={headingId} />
      <div className="yours-card yours-bird-card">
        <p id={titleId} className="yours-title">
          {first ? t('letters.bird.chooseTitle') : t('letters.bird.changeTitle')}
        </p>
        <p className="yours-lead">
          {first
            ? t('letters.bird.chooseLead', { price: number(LETTER_BIRD_PRICE) })
            : t('letters.bird.changeLead', { price: number(LETTER_BIRD_PRICE), zer: number(purse) })}
        </p>
        {/* native radios under one name: the arrow keys move through them, and a screen reader says each by its colour */}
        <div className="yours-birds" role="radiogroup" aria-labelledby={titleId}>
          {LETTER_BIRD_ORDER.map((bird) => {
            const mine = !first && bird === data.bird;
            return (
              <label key={bird} className={`yours-bird${bird === pick ? ' is-picked' : ''}${won === bird ? ' is-won' : ''}`}>
                <input
                  type="radio"
                  name={`${ids}-bird`}
                  className="sr-only"
                  checked={bird === pick}
                  disabled={busy}
                  onChange={() => {
                    setPicked(bird);
                    setFailed(null);
                    setWon(null);
                  }}
                />
                <BirdBadge bird={bird} size={52} />
                <span className="sr-only">{mine ? t('letters.bird.yours', { name: name(bird) }) : name(bird)}</span>
                {mine && (
                  <span className="yours-bird-mine" aria-hidden="true">
                    <CheckIcon size={11} />
                  </span>
                )}
              </label>
            );
          })}
        </div>
        <div className="yours-foot">
          {/* polite, so a bird just made yours is said once it is, and not while the page is read */}
          <p className="yours-picked" aria-live="polite">
            {same && <CheckIcon size={15} className="yours-picked-tick" />}
            <span>{same ? t('letters.bird.yours', { name: name(pick) }) : name(pick)}</span>
            {!same && shortLine && <span className="yours-short">{shortLine}</span>}
          </p>
          {!same && (
            <div className="yours-actions">
              {!first && (
                <Button variant="ghost" size="sm" onClick={keep} disabled={busy}>
                  {t('letters.bird.keep')}
                </Button>
              )}
              <Button size="sm" onClick={get} disabled={busy || missing > 0}>
                {first ? t('letters.bird.choose') : t('letters.bird.buy', { price: number(LETTER_BIRD_PRICE) })}
              </Button>
            </div>
          )}
        </div>
        {failed && !asking && (
          <p className="yours-error" role="alert">
            {failed}
          </p>
        )}
      </div>

      <BuyConfirm
        item={asking ? { name: name(pick), price: LETTER_BIRD_PRICE, currency: 'zer' } : null}
        busy={busy}
        art={<BirdBadge bird={pick} size={84} />}
        balance={purse}
        short={shortLine}
        error={failed}
        confirmLabel={t('letters.bird.buy', { price: number(LETTER_BIRD_PRICE) })}
        cancelLabel={t('letters.bird.keep')}
        onConfirm={() => void choose()}
        onCancel={keep}
      />
    </section>
  );
}

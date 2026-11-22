import { useCallback, useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { LETTER_BIRD_ORDER, LETTER_BIRD_PRICE, isLetterBird, type LettersHome } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import { useLocale, useT } from '../i18n/I18nProvider';
import { Button } from '../components/Button';
import { Skeleton, SkeletonText } from '../components/Skeleton';
import { CheckIcon, ChevronIcon } from '../components/icons';
import { BirdBadge } from '../letters/LetterParts';
import { useMediaQuery } from '../lib/useMediaQuery';
import { BIRD_NAMES } from '../letters/BirdPicker';
import { LETTERS_HOME_PATH } from '../letters/useLettersHome';
import { BuyConfirm } from './BuyConfirm';
import './yours.css';

/**
 * The pen pal bird in the Shop, the same choice as letters/BirdPicker laid out like the catalogue. The birds are
 * radios with a tick on the reader's own; picking another shows its price, and getting it confirms in BuyConfirm. The
 * first bird is free and taken at once. Nothing shows for readers who cannot use letters, or on a server without them.
 */

/** What `GET /letters` holds, with ways to reload it or replace it with a newer answer. */
interface LettersHomeState {
  data: LettersHome | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
  set: (next: LettersHome) => void;
}

/** Whether an answer is the letters page at all. */
function isLettersHome(value: unknown): value is LettersHome {
  const home = value as Partial<LettersHome> | null;
  return typeof home === 'object' && home !== null && isLetterBird(home.bird) && typeof home.birdChosen === 'boolean' && typeof home.zer === 'number';
}

/**
 * The letters page as the Shop needs it, fetched as the Shop opens so it arrives with the catalogue. Only when signed
 * in; a 404 or 403 just means nothing to show.
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
    // Read with the window's path, since a plain read counts the letter it would show as landed.
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

/** The section's heading, with a link to the letters at its end. */
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

/** The card while the letters page loads, in the card's own classes: title, a two-line lead, the eight birds, the foot. */
function BirdCardSkeleton({ birdSize }: { birdSize: number }): React.JSX.Element {
  const t = useT();
  return (
    <div className="yours-card yours-bird-card">
      <span className="sr-only">{t('common.loading')}</span>
      <p className="yours-title">
        <Skeleton line w="38%" />
      </p>
      <p className="yours-lead">
        <SkeletonText lines={2} lastWidth="56%" />
      </p>
      <div className="yours-birds" aria-hidden="true">
        {LETTER_BIRD_ORDER.map((bird) => (
          <span key={bird} className="yours-bird">
            <Skeleton circle size={birdSize} />
          </span>
        ))}
      </div>
      <div className="yours-foot">
        <span className="yours-picked">
          <Skeleton line w={96} />
        </span>
      </div>
    </div>
  );
}

export function YourBird({ home, zer, onZer }: { home: LettersHomeState; zer: number | null; onZer: (zer: number) => void }): React.JSX.Element | null {
  const { client } = useAuth();
  const t = useT();
  const locale = useLocale();
  const ids = useId().replace(/[^A-Za-z0-9_-]/g, '');
  // Four birds to a row fit the narrowest phones a little smaller, still a finger wide.
  const birdSize = useMediaQuery('(max-width: 340px)') ? 40 : 52;
  const [picked, setPicked] = useState<number | null>(null);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  // The bird just got here, which takes a small bow.
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
          <BirdCardSkeleton birdSize={birdSize} />
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
  // Somebody who cannot write letters yet is told why on the letters page.
  if (data.refusal !== null) return null;

  const first = !data.birdChosen;
  // The Shop's own balance when it has one, since it reflects purchases made after the letters were read.
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
    // Spent elsewhere meanwhile: the new balance shows the shortfall and the dialog waits. The same bird again is no
    // change, with nothing to pay.
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

  /** The first bird is free and taken at once; another confirms first. */
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
        {/* Native radios under one name, so arrow keys work and screen readers name each by its colour. */}
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
                <BirdBadge bird={bird} size={birdSize} />
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
          {/* Polite, so a new bird is announced without interrupting. */}
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

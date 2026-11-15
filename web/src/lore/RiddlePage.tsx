import { useEffect, useRef, useState } from 'react';
// Soranî riddles in a face made for Arabic script
import '@fontsource-variable/vazirmatn';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  RIDDLE_XP,
  dialectDirection,
  insertAtSelection,
  riddleXp,
  typingKeys,
  type RiddleDetail,
  type RiddleGuessResult,
  type RiddleHint,
  type RiddleState,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { Button } from '../components/Button';
import { ArrowIcon, CheckIcon, HintIcon } from '../components/icons';
import { ErrorState, Loading } from '../components/states';
import { useLocale, usePageMeta, useT } from '../i18n/I18nProvider';
import { KeyBar } from '../keyboard/KeyBar';
import { describeError } from '../lib/api';
import { haptic } from '../lib/haptics';
import { RIDDLES, answerPath, inReaderLanguage, inVariety, rememberVisitorRiddle, riddlePath, useReaderLanguage, visitorRiddle } from './api';
import { CATEGORY_KEY, DIFFICULTY_KEY } from './labels';
import { ChallengeButton, GuestNote, Translated } from './LoreParts';
import './lore.css';

type Load = { state: 'loading' } | { state: 'ready'; riddle: RiddleDetail } | { state: 'gone' } | { state: 'error'; message: string };

/** What the answer page is handed when it is reached from here: a right guess's answer and pay, or a reveal the learner confirmed. */
export type AnswerArrival = { solved: Extract<RiddleGuessResult, { correct: true }> } | { reveal: true };

/**
 * A riddle (/app/learn/riddles/:slug), open to everyone.
 *
 * The question, large, in Kurdish, with the reader's language a tap away;
 * a field to guess in, which the server judges; the hints one at a time,
 * each fetched when it is asked for; and Show the answer, which asks once
 * and then goes to the answer's own page. Nothing on this page holds a hint
 * not yet taken, the answer or why it is right — not in the markup, not in
 * a tooltip, not in anything fetched ahead.
 *
 * A signed-in learner's hints and state are the server's. A visitor's are
 * kept in the tab (api.ts), and the hints they took are fetched again, one
 * by one, when they come back to the riddle.
 */
export function RiddlePage(): React.JSX.Element {
  const { slug = '' } = useParams();
  return <RiddleLoader key={slug} slug={slug} />;
}

function RiddleLoader({ slug }: { slug: string }): React.JSX.Element {
  const t = useT();
  const { client, status } = useAuth();
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (status === 'restoring') return;
    let live = true;
    setLoad({ state: 'loading' });
    void client.get<{ riddle: RiddleDetail }>(`/riddles/${encodeURIComponent(slug)}`).then((res) => {
      if (!live) return;
      if (res.ok && res.data.riddle) setLoad({ state: 'ready', riddle: res.data.riddle });
      // not published (any more) looks the same as never published
      else if (!res.ok && res.error.status === 404) setLoad({ state: 'gone' });
      else if (!res.ok) setLoad({ state: 'error', message: describeError(res.error, t) });
    });
    return () => {
      live = false;
    };
  }, [client, slug, status, nonce, t]);

  return (
    <div className="container lore-page lore-riddle-page">
      <Link to={load.state === 'ready' ? inVariety(RIDDLES, load.riddle.dialect) : RIDDLES} className="back-link">
        <ArrowIcon size={16} />
        {t('lore.riddle.back')}
      </Link>
      {load.state === 'loading' && <Loading label={t('lore.riddle.loading')} />}
      {load.state === 'gone' && <ErrorState title={t('lore.riddle.goneTitle')} message={t('lore.riddle.gone')} />}
      {load.state === 'error' && <ErrorState message={load.message} onRetry={() => setNonce((n) => n + 1)} />}
      {load.state === 'ready' && <Riddle riddle={load.riddle} />}
    </div>
  );
}

function Riddle({ riddle }: { riddle: RiddleDetail }): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const { client, status } = useAuth();
  const signedIn = status === 'signedIn';
  const location = useLocation();
  const { lang, dir } = dialectDirection(riddle.dialect);
  usePageMeta(t('meta.riddle.title'), t('meta.riddles.description'));
  const tr = useReaderLanguage(riddle.translations, locale, riddle.dialect);
  const [showTr, setShowTr] = useState(false);
  const [state, setState] = useState<RiddleState>(() => (signedIn ? riddle.state : (visitorRiddle(riddle.slug)?.state ?? 'new')));
  const [hints, setHints] = useState<RiddleHint[]>(riddle.hintsUsed);
  const [hintBusy, setHintBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // a visitor coming back to a riddle sees again the hints they took in this tab, fetched one by one as before
  useEffect(() => {
    if (signedIn) return;
    const taken = Math.min(visitorRiddle(riddle.slug)?.hints ?? 0, riddle.hintCount);
    if (taken === 0) return;
    let live = true;
    void (async () => {
      const got: RiddleHint[] = [];
      for (let index = 0; index < taken; index++) {
        const res = await client.post<{ hint: RiddleHint }>(`/riddles/${encodeURIComponent(riddle.slug)}/hint`, { index });
        if (!res.ok) break;
        got.push(res.data.hint);
      }
      if (live) setHints(got);
    })();
    return () => {
      live = false;
    };
  }, [client, signedIn, riddle.slug, riddle.hintCount]);

  async function takeHint(): Promise<void> {
    const index = hints.length;
    if (index >= riddle.hintCount || hintBusy) return;
    setHintBusy(true);
    setProblem(null);
    const res = await client.post<{ hint: RiddleHint }>(`/riddles/${encodeURIComponent(riddle.slug)}/hint`, { index });
    setHintBusy(false);
    if (!res.ok) {
      setProblem(describeError(res.error, t));
      return;
    }
    setHints((h) => [...h.filter((x) => x.index !== res.data.hint.index), res.data.hint].sort((a, b) => a.index - b.index));
    if (state === 'new') setState('trying');
    if (!signedIn) rememberVisitorRiddle(riddle.slug, { hints: index + 1, state: 'trying' });
  }

  const done = state === 'solved' || state === 'revealed';
  // a visitor who came straight here (a friend's challenge) is told once what an account would keep; from the list they were told there
  const cameFromList = (location.state as { fromList?: boolean } | null)?.fromList === true;

  return (
    <article className="lore-riddle" aria-labelledby="lore-question">
      <p className="story-meta lore-meta">
        <span className="lore-kind" lang={locale === 'ckb' ? 'ckb' : 'ku'}>
          {t('lore.shelf.riddles.name')}
        </span>
        <span>{t(DIFFICULTY_KEY[riddle.difficulty])}</span>
        <span>{t(CATEGORY_KEY[riddle.category])}</span>
      </p>
      <h1 id="lore-question" className="lore-question lore-display" lang={lang} dir={dir}>
        {riddle.question}
      </h1>
      {tr && (
        <div className="lore-question-tr">
          <button type="button" className="link-btn lore-tr-toggle" aria-expanded={showTr} aria-controls="lore-question-translation" onClick={() => setShowTr((s) => !s)}>
            {showTr ? t('lore.hideTranslation') : t('lore.showTranslation')}
          </button>
          <div id="lore-question-translation" hidden={!showTr}>
            {showTr && <Translated locale={tr.locale}>{tr.value.question}</Translated>}
          </div>
        </div>
      )}

      {done ? (
        <section className={`lore-done is-${state}`} aria-labelledby="lore-done-title">
          <h2 id="lore-done-title" className="lore-done-title">
            {state === 'solved' && <CheckIcon size={18} />}
            {state === 'solved' ? t('lore.riddle.solvedAlready') : t('lore.riddle.revealedAlready')}
          </h2>
          <Link to={answerPath(riddle.slug)} className="btn btn-primary">
            {t('lore.riddle.seeAnswer')}
          </Link>
        </section>
      ) : (
        <>
          <GuessForm riddle={riddle} hintsTaken={hints.length} onWrong={() => state === 'new' && setState('trying')} />
          <Hints riddle={riddle} hints={hints} busy={hintBusy} onTake={() => void takeHint()} />
          {problem && (
            <p className="msg msg-error" role="alert">
              {problem}
            </p>
          )}
          <Reveal riddle={riddle} />
        </>
      )}

      <footer className="lore-riddle-foot">
        <ChallengeButton question={riddle.question} path={riddlePath(riddle.slug)} />
        {!signedIn && status !== 'restoring' && !cameFromList && <GuestNote message="lore.riddles.guest" />}
      </footer>
    </article>
  );
}

/**
 * The guess: typed in Kurdish, with the letters a keyboard may not have a
 * tap away, sent to the server, which says whether it is the answer. Wrong,
 * it says so kindly and the guess stays to be changed; right, the answer's
 * page opens on the moment it was solved.
 */
function GuessForm({ riddle, hintsTaken, onWrong }: { riddle: RiddleDetail; hintsTaken: number; onWrong: () => void }): React.JSX.Element {
  const t = useT();
  const { client, status } = useAuth();
  const signedIn = status === 'signedIn';
  const navigate = useNavigate();
  const { lang, dir } = dialectDirection(riddle.dialect);
  const [guess, setGuess] = useState('');
  const [busy, setBusy] = useState(false);
  const [wrong, setWrong] = useState(0);
  const [tried, setTried] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const field = useRef<HTMLInputElement>(null);
  const caret = useRef<number | null>(null);

  // the caret goes back after a letter the key bar added, once the field has it
  useEffect(() => {
    const at = caret.current;
    if (at === null) return;
    caret.current = null;
    field.current?.focus();
    field.current?.setSelectionRange(at, at);
  }, [guess]);

  const insert = (letter: string): void => {
    const el = field.current;
    const at = el ? { start: el.selectionStart ?? guess.length, end: el.selectionEnd ?? guess.length } : { start: guess.length, end: guess.length };
    const next = insertAtSelection(guess, at, letter);
    caret.current = next.caret;
    setGuess(next.text);
  };

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const text = guess.trim();
    if (!text || busy || text === tried) return;
    setBusy(true);
    setProblem(null);
    const res = await client.post<RiddleGuessResult>(`/riddles/${encodeURIComponent(riddle.slug)}/guess`, { guess: text });
    setBusy(false);
    if (!res.ok) {
      setProblem(describeError(res.error, t));
      return;
    }
    if (res.data.correct) {
      haptic('celebrate');
      if (!signedIn) rememberVisitorRiddle(riddle.slug, { state: 'solved' });
      const arrival: AnswerArrival = { solved: res.data };
      navigate(answerPath(riddle.slug), { state: arrival });
      return;
    }
    haptic('wrong');
    setTried(text);
    setWrong((n) => n + 1);
    onWrong();
    if (!signedIn) rememberVisitorRiddle(riddle.slug, { state: 'trying' });
    field.current?.select();
  }

  const hintsLeft = riddle.hintCount - hintsTaken;
  const verdict = wrong === 0 ? '' : wrong === 1 ? t('lore.riddle.wrong.first') : hintsLeft > 0 ? t('lore.riddle.wrong.hint') : t('lore.riddle.wrong.again');
  const full = RIDDLE_XP[riddle.difficulty];
  const half = riddleXp(riddle.difficulty, { hintsUsed: 1, guesses: 1, revealed: false });

  return (
    <form className="lore-guess" onSubmit={(e) => void submit(e)} noValidate>
      <label htmlFor="lore-guess-input" className="lore-guess-label">
        {t('lore.riddle.yourGuess')}
      </label>
      <div className="lore-guess-row">
        <input
          id="lore-guess-input"
          ref={field}
          className="input lore-guess-input"
          value={guess}
          onChange={(e) => setGuess(e.target.value)}
          lang={lang}
          dir={dir}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-describedby="lore-guess-help lore-guess-verdict"
          maxLength={240}
        />
        <Button type="submit" disabled={busy || guess.trim() === '' || guess.trim() === tried}>
          {t('lore.riddle.guess')}
        </Button>
      </div>
      <KeyBar keys={typingKeys(riddle.dialect)} onKey={insert} disabled={busy} lang={lang} dir={dir} />
      <p id="lore-guess-help" className="lore-help">
        {t('lore.riddle.help')}
      </p>
      <p id="lore-guess-verdict" className={`lore-verdict${wrong > 0 ? ' is-wrong' : ''}`} aria-live="polite">
        {verdict}
      </p>
      {problem && (
        <p className="msg msg-error" role="alert">
          {problem}
        </p>
      )}
      {signedIn && <p className="lore-pays">{hintsTaken > 0 ? t('lore.riddle.paysAfterHint', { xp: half }) : t('lore.riddle.pays', { xp: full, half })}</p>}
    </form>
  );
}

/** The hints taken, each unfolding where it is asked for, and the button for the next while there is one. */
function Hints({ riddle, hints, busy, onTake }: { riddle: RiddleDetail; hints: RiddleHint[]; busy: boolean; onTake: () => void }): React.JSX.Element | null {
  const t = useT();
  const locale = useLocale();
  const { lang, dir } = dialectDirection(riddle.dialect);
  if (riddle.hintCount === 0) return null;
  const left = riddle.hintCount - hints.length;
  return (
    <section className="lore-hints" aria-labelledby="lore-hints-title">
      <h2 id="lore-hints-title" className="sr-only">
        {t('lore.riddle.hints')}
      </h2>
      {hints.length > 0 && (
        <ol className="lore-hint-list">
          {hints.map((h) => {
            const tr = inReaderLanguage(h.translations, locale, riddle.dialect);
            return (
              <li key={h.index} className="lore-hint">
                <span className="lore-hint-n" aria-hidden="true">
                  <HintIcon size={16} />
                </span>
                <div className="lore-hint-body">
                  <p className="sr-only">{t('lore.riddle.hintN', { n: h.index + 1, total: riddle.hintCount })}</p>
                  <p className="lore-hint-text" lang={lang} dir={dir}>
                    {h.text}
                  </p>
                  {tr && <Translated locale={tr.locale}>{tr.value}</Translated>}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {left > 0 && (
        <p className="lore-hint-ask">
          <Button variant="secondary" onClick={onTake} disabled={busy}>
            <HintIcon size={18} />
            {hints.length === 0 ? t('lore.riddle.hint') : t('lore.riddle.anotherHint')}
          </Button>
          <span className="lore-hint-left">{t('lore.riddle.hintsLeft', { count: left })}</span>
        </p>
      )}
    </section>
  );
}

/** Show the answer: asked once, here, and then the answer's own page. */
function Reveal({ riddle }: { riddle: RiddleDetail }): React.JSX.Element {
  const t = useT();
  const { status } = useAuth();
  const navigate = useNavigate();
  const [asking, setAsking] = useState(false);
  const sure = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (asking) sure.current?.focus();
  }, [asking]);

  const reveal = (): void => {
    const arrival: AnswerArrival = { reveal: true };
    navigate(answerPath(riddle.slug), { state: arrival });
  };

  if (!asking) {
    return (
      <p className="lore-reveal">
        <button type="button" className="link-btn" onClick={() => setAsking(true)}>
          {t('lore.riddle.showAnswer')}
        </button>
      </p>
    );
  }
  return (
    <div className="lore-confirm" role="group" aria-labelledby="lore-confirm-text">
      <p id="lore-confirm-text">{status === 'signedIn' ? t('lore.riddle.confirm.signedIn') : t('lore.riddle.confirm')}</p>
      <div className="lore-confirm-actions">
        <button ref={sure} type="button" className="btn btn-primary" onClick={reveal}>
          {t('lore.riddle.confirm.yes')}
        </button>
        <Button variant="ghost" onClick={() => setAsking(false)}>
          {t('lore.riddle.confirm.no')}
        </Button>
      </div>
    </div>
  );
}

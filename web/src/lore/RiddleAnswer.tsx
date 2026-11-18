import { useEffect, useMemo, useRef, useState } from 'react';
// Soranî riddles in a typeface made for Arabic script.
import '@fontsource-variable/vazirmatn';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { dialectDirection, type RiddleAnswer, type RiddleCard, type RiddleDetail, type RiddleList } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { Button } from '../components/Button';
import { ArrowIcon, CheckIcon, XpIcon } from '../components/icons';
import { ErrorState, Loading } from '../components/states';
import { useLocale, usePageMeta, useT } from '../i18n/I18nProvider';
import { describeError } from '../lib/api';
import { RIDDLES, inReaderLanguage, inVariety, rememberVisitorRiddle, riddlePath, visitorRiddle } from './api';
import { traditionLine } from './labels';
import { ChallengeButton, SourceList, Translated } from './LoreParts';
import type { AnswerArrival } from './RiddlePage';
import './lore.css';

type Step =
  | { state: 'loading' }
  | { state: 'ask'; riddle: RiddleDetail }
  | { state: 'ready'; riddle: RiddleDetail; answer: RiddleAnswer; solvedNow: boolean; xp: number }
  | { state: 'gone' }
  | { state: 'error'; message: string };

/**
 * A riddle's answer on its own page (/app/learn/riddles/:slug/answer), so seeing it is always a choice. From the
 * riddle it opens on a solve (with any XP paid) or a confirmed reveal; arriving any other way it asks first, unless
 * already solved or shown. Then the answer, its explanation, origin and sources, a challenge button and the next riddle.
 */
export function RiddleAnswerPage(): React.JSX.Element {
  const { slug = '' } = useParams();
  return <AnswerLoader key={slug} slug={slug} />;
}

function AnswerLoader({ slug }: { slug: string }): React.JSX.Element {
  const t = useT();
  const { client, status } = useAuth();
  const signedIn = status === 'signedIn';
  const location = useLocation();
  const navigate = useNavigate();
  const arrival = location.state as AnswerArrival | null;
  const [step, setStep] = useState<Step>({ state: 'loading' });
  const [nonce, setNonce] = useState(0);
  // The moment plays once; returning to this page later shows only the answer.
  const moment = useRef(arrival && 'solved' in arrival ? arrival.solved : null);

  async function reveal(riddle: RiddleDetail, live: () => boolean): Promise<void> {
    const res = await client.post<{ answer: RiddleAnswer }>(`/riddles/${encodeURIComponent(riddle.slug)}/reveal`);
    if (!live()) return;
    if (!res.ok) {
      setStep({ state: 'error', message: describeError(res.error, t) });
      return;
    }
    const was = signedIn ? riddle.state : (visitorRiddle(riddle.slug)?.state ?? 'new');
    if (!signedIn && was !== 'solved') rememberVisitorRiddle(riddle.slug, { state: 'revealed' });
    setStep({ state: 'ready', riddle: { ...riddle, state: was === 'solved' ? 'solved' : 'revealed' }, answer: res.data.answer, solvedNow: false, xp: 0 });
  }

  useEffect(() => {
    if (status === 'restoring') return;
    let live = true;
    const isLive = (): boolean => live;
    setStep({ state: 'loading' });
    void client.get<{ riddle: RiddleDetail }>(`/riddles/${encodeURIComponent(slug)}`).then(async (res) => {
      if (!live) return;
      if (!res.ok) {
        setStep(res.error.status === 404 ? { state: 'gone' } : { state: 'error', message: describeError(res.error, t) });
        return;
      }
      const riddle = res.data.riddle;
      const solved = moment.current;
      if (solved) {
        // The guess was right and brought the answer, so nothing more is asked.
        setStep({ state: 'ready', riddle: { ...riddle, state: 'solved' }, answer: solved.answer, solvedNow: true, xp: solved.xp });
        // The moment belongs to this arrival; a reload or Back shows the answer without it.
        navigate('.', { replace: true, state: null });
        return;
      }
      const known = signedIn ? riddle.state : (visitorRiddle(riddle.slug)?.state ?? 'new');
      if ((arrival && 'reveal' in arrival) || known === 'solved' || known === 'revealed') await reveal(riddle, isLive);
      else setStep({ state: 'ask', riddle });
    });
    return () => {
      live = false;
    };
    // The arrival is read once with the page and kept in `moment`.
  }, [client, slug, status, nonce, t]);

  const backTo = step.state === 'ready' || step.state === 'ask' ? riddlePath(step.riddle.slug) : RIDDLES;

  return (
    <div className="container lore-page lore-answer-page">
      <Link to={backTo} className="back-link">
        <ArrowIcon size={16} />
        {t('lore.answer.back')}
      </Link>
      {step.state === 'loading' && <Loading label={t('lore.answer.loading')} />}
      {step.state === 'gone' && <ErrorState title={t('lore.riddle.goneTitle')} message={t('lore.riddle.gone')} />}
      {step.state === 'error' && <ErrorState message={step.message} onRetry={() => setNonce((n) => n + 1)} />}
      {step.state === 'ask' && (
        <AskFirst
          riddle={step.riddle}
          onYes={() => {
            setStep({ state: 'loading' });
            void reveal(step.riddle, () => true);
          }}
        />
      )}
      {step.state === 'ready' && <Answer riddle={step.riddle} answer={step.answer} solvedNow={step.solvedNow} xp={step.xp} />}
    </div>
  );
}

/** Arrived without asking: the riddle again, and a confirmation before its answer. */
function AskFirst({ riddle, onYes }: { riddle: RiddleDetail; onYes: () => void }): React.JSX.Element {
  const t = useT();
  const { status } = useAuth();
  const { lang, dir } = dialectDirection(riddle.dialect);
  usePageMeta(t('meta.riddle.title'), t('meta.riddles.description'));
  return (
    <section className="lore-ask" aria-labelledby="lore-ask-title">
      <p className="lore-eyebrow">{t('lore.answer.theRiddle')}</p>
      <p className="lore-question is-quoted lore-display" lang={lang} dir={dir}>
        {riddle.question}
      </p>
      <div className="lore-confirm">
        <h1 id="lore-ask-title" className="lore-confirm-title">
          {status === 'signedIn' ? t('lore.riddle.confirm.signedIn') : t('lore.riddle.confirm')}
        </h1>
        <div className="lore-confirm-actions">
          <Button onClick={onYes}>{t('lore.riddle.confirm.yes')}</Button>
          <Link to={riddlePath(riddle.slug)} className="btn btn-ghost">
            {t('lore.riddle.confirm.no')}
          </Link>
        </div>
      </div>
    </section>
  );
}

function Answer({ riddle, answer, solvedNow, xp }: { riddle: RiddleDetail; answer: RiddleAnswer; solvedNow: boolean; xp: number }): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const { lang, dir } = dialectDirection(riddle.dialect);
  usePageMeta(t('meta.answer.title'), t('meta.riddles.description'));
  const tr = useMemo(() => inReaderLanguage(answer.translations, locale, riddle.dialect), [answer.translations, locale, riddle.dialect]);
  const question = useMemo(() => inReaderLanguage(riddle.translations, locale, riddle.dialect), [riddle.translations, locale, riddle.dialect]);
  const heading = useRef<HTMLHeadingElement>(null);
  // The answer takes focus as it arrives, so screen readers start there.
  useEffect(() => heading.current?.focus(), []);

  return (
    <article className={`lore-answer-article${solvedNow ? ' is-solved-now' : ''}`} aria-labelledby="lore-answer-title">
      {solvedNow && (
        <div className="lore-moment" role="status">
          <span className="lore-seal" aria-hidden="true">
            <CheckIcon size={22} />
          </span>
          <span className="lore-moment-text">
            <strong>{t('lore.answer.solved')}</strong>
            {xp > 0 && (
              <span className="lore-moment-xp">
                <XpIcon size={14} />
                {t('lore.answer.xp', { xp })}
              </span>
            )}
          </span>
        </div>
      )}
      {!solvedNow && riddle.state === 'solved' && <p className="lore-was">{t('lore.answer.solvedBefore')}</p>}

      <p className="lore-eyebrow">{t('lore.answer.theRiddle')}</p>
      <p className="lore-question is-quoted lore-display" lang={lang} dir={dir}>
        {riddle.question}
      </p>
      {question && <Translated locale={question.locale}>{question.value.question}</Translated>}

      <section className="lore-answer-card" aria-labelledby="lore-answer-title">
        <h1 id="lore-answer-title" ref={heading} tabIndex={-1} className="lore-eyebrow">
          {t('lore.answer.title')}
        </h1>
        <p className="lore-answer lore-display" lang={lang} dir={dir}>
          {answer.answer}
        </p>
        {tr && <Translated locale={tr.locale} className="lore-answer-tr">{tr.value.answer}</Translated>}
      </section>

      <section className="lore-section lore-why" aria-labelledby="lore-why-title">
        <h2 id="lore-why-title" className="story-section-title">
          {t('lore.answer.why')}
        </h2>
        <p className="lore-prose" lang={lang} dir={dir}>
          {answer.explanation}
        </p>
        {tr && <Translated locale={tr.locale} className="lore-prose">{tr.value.explanation}</Translated>}
      </section>

      <section className="lore-section lore-origin" aria-labelledby="lore-origin-title">
        <h2 id="lore-origin-title" className="story-section-title">
          {t('lore.answer.origin')}
        </h2>
        <p className="lore-prose">{traditionLine('riddle', answer.tradition, answer.region, t)}</p>
        <SourceList sources={answer.sources} />
      </section>

      <NextRiddle riddle={riddle} />
    </article>
  );
}

/** The next unfinished riddle after this one in list order, wrapping around, or the list when all are done. */
function NextRiddle({ riddle }: { riddle: RiddleCard }): React.JSX.Element {
  const t = useT();
  const { client, status } = useAuth();
  const signedIn = status === 'signedIn';
  const [next, setNext] = useState<RiddleCard | null | undefined>(undefined);

  useEffect(() => {
    let live = true;
    void client.get<RiddleList>(`/riddles?dialect=${riddle.dialect}`).then((res) => {
      if (!live) return;
      if (!res.ok || !Array.isArray(res.data.riddles)) return setNext(null);
      const all = res.data.riddles;
      const at = all.findIndex((r) => r.slug === riddle.slug);
      const after = [...all.slice(at + 1), ...all.slice(0, Math.max(0, at))];
      const open = (r: RiddleCard): boolean => {
        const state = signedIn ? r.state : (visitorRiddle(r.slug)?.state ?? 'new');
        return state !== 'solved' && state !== 'revealed';
      };
      setNext(after.find(open) ?? null);
    });
    return () => {
      live = false;
    };
  }, [client, riddle.dialect, riddle.slug, signedIn]);

  return (
    <nav className="lore-next" aria-label={t('lore.answer.wayOn')}>
      {next ? (
        <Link to={riddlePath(next.slug)} state={{ fromList: true }} className="btn btn-primary btn-lg">
          {t('lore.answer.next')}
        </Link>
      ) : next === null ? (
        <p className="lore-all-done">{t('lore.answer.allDone')}</p>
      ) : null}
      <ChallengeButton question={riddle.question} path={riddlePath(riddle.slug)} />
      <Link to={inVariety(RIDDLES, riddle.dialect)} className="btn btn-ghost">
        {t('lore.answer.allRiddles')}
      </Link>
    </nav>
  );
}

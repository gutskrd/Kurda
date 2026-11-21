import { useEffect, useMemo, useState } from 'react';
// Soranî riddles in a typeface made for Arabic script.
import { Link, useSearchParams } from 'react-router-dom';
import { RIDDLE_DIFFICULTIES, dialectDirection, type RiddleCard, type RiddleDifficulty, type RiddleList, type RiddleState } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { CheckIcon, ChevronIcon } from '../components/icons';
import { ListRowsSkeleton } from '../components/skeletons';
import { EmptyState, ErrorState } from '../components/states';
import { useLocale, usePageMeta, useT } from '../i18n/I18nProvider';
import { describeError } from '../lib/api';
import { LearnHeader } from '../learn/LearnHeader';
import { dialectName } from '../learn/map';
import { inReaderLanguage, rememberTranslations, rememberedTranslations, riddlePath, useLoreDialect, visitorRiddle } from './api';
import { CATEGORY_KEY, DIFFICULTY_KEY, STATE_KEY } from './labels';
import { GuestNote, ShelfSwitch, Translated, VarietySwitch } from './LoreParts';
import './lore.css';

type Load = { state: 'loading' } | { state: 'ready'; list: RiddleList } | { state: 'error'; message: string };

/** A riddle's state for the list: the server's for an account, the tab's for a visitor. */
function stateOf(card: RiddleCard, signedIn: boolean): RiddleState {
  if (signedIn) return card.state;
  return visitorRiddle(card.slug)?.state ?? 'new';
}

/**
 * The riddles (/app/learn/riddles), Metelok, the Stories section's second shelf: the riddle of the day, then every
 * riddle of the variety, easiest first, filterable by difficulty. Each shows its question (with an optional
 * translation), difficulty, category and progress, never a hint or answer.
 */
export function RiddlesList(): React.JSX.Element {
  const t = useT();
  usePageMeta(t('meta.riddles.title'), t('meta.riddles.description'));
  return (
    <div className="container learn-page story-library lore-page">
      <LearnHeader view="stories" />
      <ShelfSwitch here="riddles" />
      <Riddles />
    </div>
  );
}

function Riddles(): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const { client, status } = useAuth();
  const signedIn = status === 'signedIn';
  const [dialect, setDialect] = useLoreDialect();
  const [params, setParams] = useSearchParams();
  const asked = params.get('difficulty');
  const difficulty = (RIDDLE_DIFFICULTIES as readonly string[]).includes(asked ?? '') ? (asked as RiddleDifficulty) : null;
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [nonce, setNonce] = useState(0);
  const [translations, setTranslations] = useState(rememberedTranslations);

  useEffect(() => {
    // Fetched once the session is known, so the learner's states come with the list.
    if (status === 'restoring') return;
    let live = true;
    setLoad({ state: 'loading' });
    void client.get<RiddleList>(`/riddles?dialect=${dialect}`).then((res) => {
      if (!live) return;
      if (res.ok && Array.isArray(res.data.riddles)) setLoad({ state: 'ready', list: res.data });
      else if (!res.ok) setLoad({ state: 'error', message: describeError(res.error, t) });
    });
    return () => {
      live = false;
    };
  }, [client, dialect, status, nonce, t]);

  const choose = (next: RiddleDifficulty | null): void =>
    setParams(
      (p) => {
        const out = new URLSearchParams(p);
        if (next) out.set('difficulty', next);
        else out.delete('difficulty');
        return out;
      },
      { replace: true },
    );

  const toggleTranslations = (): void => {
    setTranslations((on) => {
      rememberTranslations(!on);
      return !on;
    });
  };

  const list = load.state === 'ready' ? load.list : null;
  const daily = list?.daily ? (list.riddles.find((r) => r.slug === list.daily) ?? null) : null;
  const counts = useMemo(() => {
    const out: Record<RiddleDifficulty, number> = { easy: 0, medium: 0, hard: 0 };
    for (const r of list?.riddles ?? []) out[r.difficulty] += 1;
    return out;
  }, [list]);
  const shown = (list?.riddles ?? []).filter((r) => !difficulty || r.difficulty === difficulty);
  // Offer the toggle only when some question has a translation to show.
  const translatable = (list?.riddles ?? []).some((r) => inReaderLanguage(r.translations, locale, r.dialect) !== null);

  return (
    <>
      <header className="lore-head">
        <p className="lore-lede">{t('lore.riddles.lede')}</p>
        <div className="lore-tools">
          <VarietySwitch value={dialect} onChange={setDialect} />
          {translatable && (
            <button type="button" className={`story-chip lore-toggle${translations ? ' is-on' : ''}`} aria-pressed={translations} onClick={toggleTranslations}>
              {t('lore.showTranslations')}
            </button>
          )}
        </div>
      </header>

      {load.state === 'error' && <ErrorState title={t('lore.riddles.loadFailed')} message={load.message} onRetry={() => setNonce((n) => n + 1)} />}
      {load.state === 'loading' && <ListRowsSkeleton count={5} label="lore.riddles.loading" />}
      {list && list.total === 0 && <EmptyState title={t('lore.riddles.empty', { variety: dialectName(dialect) })} />}

      {list && list.total > 0 && (
        <>
          {daily && <DailyRiddle card={daily} signedIn={signedIn} translations={translations} />}

          {signedIn ? (
            <SolvedCount solved={list.solved} total={list.total} />
          ) : (
            status !== 'restoring' && <GuestNote message="lore.riddles.guest" />
          )}

          <section className="lore-section" aria-labelledby="lore-riddles-all">
            <h2 id="lore-riddles-all" className="story-section-title">
              {t('lore.riddles.all')}
            </h2>
            <fieldset className="lore-filter">
              <legend className="sr-only">{t('lore.difficulty')}</legend>
              <FilterChip on={difficulty === null} onPick={() => choose(null)} label={t('lore.difficulty.any')} count={list.total} />
              {RIDDLE_DIFFICULTIES.filter((d) => counts[d] > 0).map((d) => (
                <FilterChip key={d} on={difficulty === d} onPick={() => choose(d)} label={t(DIFFICULTY_KEY[d])} count={counts[d]} />
              ))}
            </fieldset>
            <ol className="lore-list">
              {shown.map((r) => (
                <li key={r.slug}>
                  <RiddleRow card={r} signedIn={signedIn} translations={translations} today={r.slug === list.daily} />
                </li>
              ))}
            </ol>
          </section>
        </>
      )}
    </>
  );
}

/** One difficulty filter choice: a radio drawn as a chip, with its riddle count. */
function FilterChip({ on, onPick, label, count }: { on: boolean; onPick: () => void; label: string; count: number }): React.JSX.Element {
  const locale = useLocale();
  return (
    <label className={`story-chip lore-filter-chip${on ? ' is-on' : ''}`}>
      <input type="radio" name="lore-difficulty" checked={on} onChange={onPick} />
      <span>{label}</span>
      <span className="story-chip-count">{count.toLocaleString(locale)}</span>
    </label>
  );
}

/** "Solved: 3 of 12", with a filling hairline. */
function SolvedCount({ solved, total }: { solved: number; total: number }): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const share = total > 0 ? Math.min(1, solved / total) : 0;
  return (
    <p
      className="lore-solved-count"
      role="progressbar"
      aria-label={t('lore.riddles.solvedLabel')}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={solved}
      aria-valuetext={t('lore.riddles.solved', { solved: solved.toLocaleString(locale), total: total.toLocaleString(locale) })}
    >
      <span className="lore-solved-text" aria-hidden="true">
        {t('lore.riddles.solved', { solved: solved.toLocaleString(locale), total: total.toLocaleString(locale) })}
      </span>
      <span className="lore-solved-bar" aria-hidden="true">
        <span style={{ width: `${share * 100}%` }} />
      </span>
    </p>
  );
}

/** The riddle of the day, set larger than the rest, with a link to it. */
function DailyRiddle({ card, signedIn, translations }: { card: RiddleCard; signedIn: boolean; translations: boolean }): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const { lang, dir } = dialectDirection(card.dialect);
  const tr = translations ? inReaderLanguage(card.translations, locale, card.dialect) : null;
  const state = stateOf(card, signedIn);
  return (
    <section className="lore-daily" aria-labelledby="lore-daily-title">
      <h2 id="lore-daily-title" className="lore-eyebrow">
        {t('lore.riddles.daily')}
      </h2>
      <p className="lore-daily-text lore-display" lang={lang} dir={dir}>
        {card.question}
      </p>
      {tr && <Translated locale={tr.locale}>{tr.value.question}</Translated>}
      <p className="story-meta lore-meta">
        <span>{t(DIFFICULTY_KEY[card.difficulty])}</span>
        <span>{t(CATEGORY_KEY[card.category])}</span>
        {state !== 'new' && <StateMark state={state} />}
      </p>
      <p className="lore-daily-go">
        <Link to={riddlePath(card.slug)} state={{ fromList: true }} className="btn btn-primary">
          {state === 'solved' || state === 'revealed' ? t('lore.riddles.openAgain') : state === 'trying' ? t('lore.riddles.keepGoing') : t('lore.riddles.solveIt')}
        </Link>
      </p>
    </section>
  );
}

function StateMark({ state }: { state: Exclude<RiddleState, 'new'> }): React.JSX.Element {
  const t = useT();
  return (
    <span className={`lore-state is-${state}`}>
      {state === 'solved' && <CheckIcon size={13} />}
      {t(STATE_KEY[state])}
    </span>
  );
}

/** A riddle in the list: its question, then its details and progress; the whole row links to it. */
function RiddleRow({ card, signedIn, translations, today }: { card: RiddleCard; signedIn: boolean; translations: boolean; today: boolean }): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const { lang, dir } = dialectDirection(card.dialect);
  const tr = translations ? inReaderLanguage(card.translations, locale, card.dialect) : null;
  const state = stateOf(card, signedIn);
  return (
    <Link to={riddlePath(card.slug)} state={{ fromList: true }} className={`lore-row is-${state}`}>
      <span className="lore-row-text">
        <span className="lore-row-question lore-display" lang={lang} dir={dir}>
          {card.question}
        </span>
        {tr && (
          <span className="lore-row-translation" lang={tr.locale} dir="auto">
            {tr.value.question}
          </span>
        )}
        <span className="story-meta lore-meta">
          <span>{t(DIFFICULTY_KEY[card.difficulty])}</span>
          <span>{t(CATEGORY_KEY[card.category])}</span>
          {today && <span>{t('lore.riddles.today')}</span>}
          {state !== 'new' && <StateMark state={state} />}
        </span>
      </span>
      <ChevronIcon size={16} className="lore-row-go" />
    </Link>
  );
}

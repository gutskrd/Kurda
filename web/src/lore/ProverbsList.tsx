import { useEffect, useState } from 'react';
// Soranî proverbs in a typeface made for Arabic script.
import { Link, useSearchParams } from 'react-router-dom';
import { PROVERB_ROUND_ITEMS, dialectDirection, isProverbTheme, type ProverbList, type ProverbView } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { ChevronIcon } from '../components/icons';
import { LoreListSkeleton } from '../components/skeletons';
import { EmptyState, ErrorState } from '../components/states';
import { useLocale, usePageMeta, useT } from '../i18n/I18nProvider';
import { describeError } from '../lib/api';
import { LearnHeader } from '../learn/LearnHeader';
import { dialectName } from '../learn/map';
import { PROVERB_ROUND, inReaderLanguage, inVariety, proverbPath, useLoreDialect } from './api';
import { THEME_KEY, TRADITION_TAG_KEY } from './labels';
import { ShelfSwitch, Translated, VarietySwitch } from './LoreParts';
import { useArrival } from '../lib/motion';
import './lore.css';

type Load = { state: 'loading' } | { state: 'ready'; list: ProverbList } | { state: 'error'; message: string };

/**
 * The proverbs (/app/learn/proverbs), Gotinên pêşiyan, the Stories section's third shelf: the proverb of the day, then
 * every proverb of the variety with its translation and origin, filterable by theme, and the round at the foot. The
 * whole variety is fetched once and filtered here, since there are only a few dozen.
 */
export function ProverbsList(): React.JSX.Element {
  const t = useT();
  usePageMeta(t('meta.proverbs.title'), t('meta.proverbs.description'));
  return (
    <div className="container learn-page story-library lore-page">
      <LearnHeader view="stories" />
      <ShelfSwitch here="proverbs" />
      <Proverbs />
    </div>
  );
}

function Proverbs(): React.JSX.Element {
  const t = useT();
  const { client, status } = useAuth();
  const [dialect, setDialect] = useLoreDialect();
  const [params, setParams] = useSearchParams();
  const asked = params.get('theme');
  const theme = isProverbTheme(asked) ? asked : null;
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (status === 'restoring') return;
    let live = true;
    setLoad({ state: 'loading' });
    void client.get<ProverbList>(`/proverbs?dialect=${dialect}`).then((res) => {
      if (!live) return;
      if (res.ok && Array.isArray(res.data.proverbs)) setLoad({ state: 'ready', list: res.data });
      else if (!res.ok) setLoad({ state: 'error', message: describeError(res.error, t) });
    });
    return () => {
      live = false;
    };
  }, [client, dialect, status, nonce, t]);

  const choose = (next: string | null): void =>
    setParams(
      (p) => {
        const out = new URLSearchParams(p);
        if (next) out.set('theme', next);
        else out.delete('theme');
        return out;
      },
      { replace: true },
    );

  const list = load.state === 'ready' ? load.list : null;
  const today = list?.today ? (list.proverbs.find((p) => p.slug === list.today) ?? null) : null;
  const shown = (list?.proverbs ?? []).filter((p) => !theme || p.themes.includes(theme));
  // The first screenful rises in once, as the phone's does (styles/motion.css).
  const arriving = useArrival(shown.length > 0, 'proverbs');

  return (
    <>
      <header className="lore-head">
        <p className="lore-lede">{t('lore.proverbs.lede')}</p>
        <div className="lore-tools">
          <VarietySwitch value={dialect} onChange={setDialect} />
        </div>
      </header>

      {load.state === 'error' && <ErrorState title={t('lore.proverbs.loadFailed')} message={load.message} onRetry={() => setNonce((n) => n + 1)} />}
      {load.state === 'loading' && <LoreListSkeleton kind="proverbs" label="lore.proverbs.loading" />}
      {list && list.proverbs.length === 0 && <EmptyState title={t('lore.proverbs.empty', { variety: dialectName(dialect) })} />}

      {list && list.proverbs.length > 0 && (
        <>
          {today && <ProverbOfTheDay proverb={today} />}

          <section className="lore-section" aria-labelledby="lore-proverbs-all">
            <h2 id="lore-proverbs-all" className="story-section-title">
              {t('lore.proverbs.all')}
            </h2>
            {list.themes.length > 1 && (
              <fieldset className="lore-filter">
                <legend className="sr-only">{t('lore.proverbs.themes')}</legend>
                <label className={`story-chip lore-filter-chip${theme === null ? ' is-on' : ''}`}>
                  <input type="radio" name="lore-theme" checked={theme === null} onChange={() => choose(null)} />
                  <span>{t('lore.proverbs.anyTheme')}</span>
                </label>
                {list.themes.map((th) => (
                  <label key={th} className={`story-chip lore-filter-chip${theme === th ? ' is-on' : ''}`}>
                    <input type="radio" name="lore-theme" checked={theme === th} onChange={() => choose(th)} />
                    <span>{t(THEME_KEY[th])}</span>
                  </label>
                ))}
              </fieldset>
            )}
            {shown.length === 0 ? (
              <p className="lore-none">{t('lore.proverbs.noneInTheme')}</p>
            ) : (
              <ul className={arriving ? 'lore-list rise-in' : 'lore-list'}>
                {shown.map((p) => (
                  <li key={p.slug}>
                    <ProverbRow proverb={p} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <RoundInvite dialect={dialect} count={list.proverbs.length} />
        </>
      )}
    </>
  );
}

function ProverbOfTheDay({ proverb }: { proverb: ProverbView }): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const { lang, dir } = dialectDirection(proverb.dialect);
  const tr = inReaderLanguage(proverb.translations, locale, proverb.dialect);
  return (
    <section className="lore-daily" aria-labelledby="lore-today-title">
      <h2 id="lore-today-title" className="lore-eyebrow">
        {t('lore.proverbs.today')}
      </h2>
      <p className="lore-daily-text lore-display lore-verse" lang={lang} dir={dir}>
        {proverb.text}
      </p>
      {tr && <Translated locale={tr.locale}>{tr.value.translation}</Translated>}
      {tr && <p className="lore-daily-meaning" lang={tr.locale} dir="auto">{tr.value.meaning}</p>}
      <p className="lore-daily-go">
        <Link to={proverbPath(proverb.slug)} className="btn btn-secondary">
          {t('lore.proverbs.readMore')}
        </Link>
      </p>
    </section>
  );
}

/** A proverb in the list: the Kurdish, its translation and its origin. */
function ProverbRow({ proverb }: { proverb: ProverbView }): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const { lang, dir } = dialectDirection(proverb.dialect);
  const tr = inReaderLanguage(proverb.translations, locale, proverb.dialect);
  return (
    <Link to={proverbPath(proverb.slug)} className="lore-row">
      <span className="lore-row-text">
        <span className="lore-row-question lore-display" lang={lang} dir={dir}>
          {proverb.text}
        </span>
        {tr && (
          <span className="lore-row-translation" lang={tr.locale} dir="auto">
            {tr.value.translation}
          </span>
        )}
        <span className="story-meta lore-meta">
          <span>{t(TRADITION_TAG_KEY[proverb.tradition])}</span>
          {proverb.region && <span dir="auto">{proverb.region}</span>}
          {proverb.themes.map((th) => (
            <span key={th}>{t(THEME_KEY[th])}</span>
          ))}
        </span>
      </span>
      <ChevronIcon size={16} className="lore-row-go" />
    </Link>
  );
}

/** The proverb round, offered once there are enough proverbs for one. */
function RoundInvite({ dialect, count }: { dialect: ProverbView['dialect']; count: number }): React.JSX.Element | null {
  const t = useT();
  // A round is five proverbs, each beside two others.
  if (count < PROVERB_ROUND_ITEMS) return null;
  return (
    <section className="lore-round-invite" aria-labelledby="lore-round-title">
      <h2 id="lore-round-title" className="story-section-title">
        {t('lore.round.title')}
      </h2>
      <p className="lore-prose">{t('lore.round.invite')}</p>
      <Link to={inVariety(PROVERB_ROUND, dialect)} className="btn btn-secondary">
        {t('lore.round.play')}
      </Link>
    </section>
  );
}

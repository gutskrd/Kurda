import { useEffect, useState } from 'react';
// Soranî proverbs in a face made for Arabic script
import '@fontsource-variable/vazirmatn';
import { Link, useParams } from 'react-router-dom';
import { dialectDirection, type ProverbView } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { ArrowIcon } from '../components/icons';
import { ErrorState, Loading } from '../components/states';
import { useLocale, usePageMeta, useT } from '../i18n/I18nProvider';
import { describeError } from '../lib/api';
import { dialectName } from '../learn/map';
import { PROVERBS, PROVERB_ROUND, inVariety, useReaderLanguage } from './api';
import { THEME_KEY, traditionLine } from './labels';
import { SourceList, Translated } from './LoreParts';
import './lore.css';

type Load = { state: 'loading' } | { state: 'ready'; proverb: ProverbView } | { state: 'gone' } | { state: 'error'; message: string };

/**
 * A proverb (/app/learn/proverbs/:slug), open to everyone and paying
 * nothing: the proverb set like a line of verse, its translation and its
 * word-for-word sense, what it means and why, a little scene where somebody
 * would say it, its background, the other ways it is said, a saying with the
 * same sense in the reader's own language where there truly is one, and
 * where it was found. One column, each part only where it has something.
 */
export function ProverbPage(): React.JSX.Element {
  const { slug = '' } = useParams();
  return <ProverbLoader key={slug} slug={slug} />;
}

function ProverbLoader({ slug }: { slug: string }): React.JSX.Element {
  const t = useT();
  const { client, status } = useAuth();
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (status === 'restoring') return;
    let live = true;
    setLoad({ state: 'loading' });
    void client.get<{ proverb: ProverbView }>(`/proverbs/${encodeURIComponent(slug)}`).then((res) => {
      if (!live) return;
      if (res.ok && res.data.proverb) setLoad({ state: 'ready', proverb: res.data.proverb });
      else if (!res.ok && res.error.status === 404) setLoad({ state: 'gone' });
      else if (!res.ok) setLoad({ state: 'error', message: describeError(res.error, t) });
    });
    return () => {
      live = false;
    };
  }, [client, slug, status, nonce, t]);

  return (
    <div className="container lore-page lore-proverb-page">
      <Link to={load.state === 'ready' ? inVariety(PROVERBS, load.proverb.dialect) : PROVERBS} className="back-link">
        <ArrowIcon size={16} />
        {t('lore.proverb.back')}
      </Link>
      {load.state === 'loading' && <Loading label={t('lore.proverb.loading')} />}
      {load.state === 'gone' && <ErrorState title={t('lore.proverb.goneTitle')} message={t('lore.proverb.gone')} />}
      {load.state === 'error' && <ErrorState message={load.message} onRetry={() => setNonce((n) => n + 1)} />}
      {load.state === 'ready' && <Proverb proverb={load.proverb} />}
    </div>
  );
}

function Proverb({ proverb }: { proverb: ProverbView }): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const { lang, dir } = dialectDirection(proverb.dialect);
  usePageMeta(t('meta.proverb.title'), t('meta.proverbs.description'));
  const tr = useReaderLanguage(proverb.translations, locale, proverb.dialect);
  const said = tr?.value;
  // the language what is said about it is in: the reader's, or the English it fell back to
  const sl = tr?.locale ?? 'en';

  return (
    <article className="lore-proverb" aria-labelledby="lore-proverb-text">
      <p className="story-meta lore-meta">
        <span className="lore-kind" lang={locale === 'ckb' ? 'ckb' : 'ku'}>
          {t('lore.shelf.proverbs.name')}
        </span>
        <span>{dialectName(proverb.dialect)}</span>
      </p>

      <h1 id="lore-proverb-text" className="lore-proverb-text lore-display lore-verse" lang={lang} dir={dir}>
        {proverb.text}
      </h1>
      {tr && said && (
        <Translated locale={tr.locale} className="lore-proverb-tr">
          {said.translation}
        </Translated>
      )}
      {said?.literal && (
        <p className="lore-literal" lang={sl} dir="auto">
          <span className="lore-label">{t('lore.proverb.literal')}</span> {said.literal}
        </p>
      )}

      {said && (
        <section className="lore-section" aria-labelledby="lore-meaning-title">
          <h2 id="lore-meaning-title" className="story-section-title">
            {t('lore.proverb.meaning')}
          </h2>
          <p className="lore-meaning" lang={sl} dir="auto">
            {said.meaning}
          </p>
          <p className="lore-prose" lang={sl} dir="auto">
            {said.explanation}
          </p>
        </section>
      )}

      {(proverb.exampleKu || said?.example) && (
        <section className="lore-section lore-scene" aria-labelledby="lore-scene-title">
          <h2 id="lore-scene-title" className="story-section-title">
            {t('lore.proverb.scene')}
          </h2>
          {proverb.exampleKu && (
            <p className="lore-scene-ku" lang={lang} dir={dir}>
              {proverb.exampleKu}
            </p>
          )}
          {said?.example && <Translated locale={sl} className="lore-prose">{said.example}</Translated>}
        </section>
      )}

      {said?.context && (
        <section className="lore-section" aria-labelledby="lore-context-title">
          <h2 id="lore-context-title" className="story-section-title">
            {t('lore.proverb.context')}
          </h2>
          <p className="lore-prose" lang={sl} dir="auto">
            {said.context}
          </p>
        </section>
      )}

      {said?.equivalent && (
        <section className="lore-section" aria-labelledby="lore-equivalent-title">
          <h2 id="lore-equivalent-title" className="story-section-title">
            {t('lore.proverb.equivalent')}
          </h2>
          <p className="lore-equivalent lore-display" lang={sl} dir="auto">
            {said.equivalent}
          </p>
        </section>
      )}

      {proverb.variants.length > 0 && (
        <section className="lore-section" aria-labelledby="lore-variants-title">
          <h2 id="lore-variants-title" className="story-section-title">
            {t('lore.proverb.variants')}
          </h2>
          <ul className="lore-variants">
            {proverb.variants.map((v, i) => {
              const k = dialectDirection(v.dialect);
              return (
                <li key={i} className="lore-variant">
                  <span className="lore-variant-text lore-display" lang={k.lang} dir={k.dir}>
                    {v.text}
                  </span>
                  <span className="story-meta lore-meta">
                    <span>{dialectName(v.dialect)}</span>
                    {v.region && <span dir="auto">{v.region}</span>}
                  </span>
                  {v.note && (
                    <span className="lore-variant-note" dir="auto">
                      {v.note}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="lore-section" aria-labelledby="lore-from-title">
        <h2 id="lore-from-title" className="story-section-title">
          {t('lore.proverb.origin')}
        </h2>
        <p className="lore-prose">{traditionLine('proverb', proverb.tradition, proverb.region, t)}</p>
        <SourceList sources={proverb.sources} />
      </section>

      {proverb.themes.length > 0 && (
        <nav className="lore-section lore-themes" aria-label={t('lore.proverbs.themes')}>
          {proverb.themes.map((th) => (
            <Link key={th} to={`${inVariety(PROVERBS, proverb.dialect)}&theme=${th}`} className="story-chip">
              {t(THEME_KEY[th])}
            </Link>
          ))}
        </nav>
      )}

      <p className="lore-next">
        <Link to={inVariety(PROVERB_ROUND, proverb.dialect)} className="btn btn-secondary">
          {t('lore.round.play')}
        </Link>
        <Link to={inVariety(PROVERBS, proverb.dialect)} className="btn btn-ghost">
          {t('lore.proverb.all')}
        </Link>
      </p>
    </article>
  );
}

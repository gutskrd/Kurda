import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { LinkButton } from '../components/Button';
import { DocPage, type DocSection } from '../components/DocPage';
import { useT } from '../i18n/I18nProvider';
import { LIMITS, PRINCIPLES } from '../teaching/principles';
import { SOURCES, SOURCE_ORDER, authorList, locator, shortCite, type SourceId } from '../teaching/sources';

/*
 * How Hevalo teaches, and why — with the studies to check it against.
 *
 * The owner asked for the site to say that Hevalo is built on learning science,
 * and for that to be true. So every principle here is told in three parts that
 * do not lean on each other: what the research found, said no more strongly
 * than the study does; what Hevalo does about it, which is only what the code
 * does; and the studies themselves, linked. Then a section of what we do not
 * claim, which is the part a careful reader looks for first.
 *
 * No "proven", no percentages of improvement, no "learn twice as fast": the
 * research does not license any of that for Kurdish, and the page says so.
 *
 * See teaching/principles.ts for the words and teaching/sources.ts for the
 * references, which stay in the language they were published in.
 */

/** A study named in passing, linked to where it can be read. Not translated: see sources.ts. */
function Ref({ id }: { id: SourceId }): React.JSX.Element {
  const s = SOURCES[id];
  return (
    <li lang="en" dir="ltr">
      <a className="doc-link" href={s.url} target="_blank" rel="noreferrer noopener">
        {shortCite(s)}
      </a>
      <span className="teach-ref-title"> · {s.title}</span>
    </li>
  );
}

/** A study in full, as a reference list gives it: authors (year). Title. Journal, volume(issue), pages. */
function Reference({ id }: { id: SourceId }): React.JSX.Element {
  const s = SOURCES[id];
  return (
    <li id={`source-${id}`} lang="en" dir="ltr">
      {authorList(s)} ({s.year}).{' '}
      <a className="doc-link" href={s.url} target="_blank" rel="noreferrer noopener">
        {s.title}
      </a>
      . <cite>{s.venue}</cite>
      {locator(s)}.
    </li>
  );
}

export function HowHevaloTeaches(): React.JSX.Element {
  const t = useT();
  const { hash } = useLocation();

  /*
   * The front page links to a principle by its anchor. The layout scrolls to
   * an anchor when the address changes, but this page is fetched the first time
   * somebody opens it, so on that first visit the section is not there yet when
   * the layout looks. It looks again once the page is.
   */
  useEffect(() => {
    if (hash) document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView();
  }, [hash]);

  const sections: DocSection[] = [
    ...PRINCIPLES.map(
      (p): DocSection => ({
        id: p.id,
        title: p.title,
        body: (
          <>
            <h3 className="teach-label">{t('teach.found')}</h3>
            {p.found.map((k) => (
              <p key={k}>{t(k)}</p>
            ))}
            <h3 className="teach-label">{t('teach.does')}</h3>
            <ul className="doc-list">
              {p.does.map((k) => (
                <li key={k}>{t(k)}</li>
              ))}
            </ul>
            <h3 className="teach-label">{t('teach.read')}</h3>
            <ul className="teach-refs">
              {p.sources.map((id) => (
                <Ref key={id} id={id} />
              ))}
            </ul>
          </>
        ),
      }),
    ),
    {
      id: 'limits',
      title: 'teach.limits.title',
      body: (
        <ul className="doc-list">
          {LIMITS.map((k) => (
            <li key={k}>{t(k)}</li>
          ))}
        </ul>
      ),
    },
    {
      id: 'sources',
      title: 'teach.sources.title',
      body: (
        <>
          <p>{t('teach.sources.lead')}</p>
          <ul className="teach-sources">
            {SOURCE_ORDER.map((id) => (
              <Reference key={id} id={id} />
            ))}
          </ul>
        </>
      ),
    },
  ];

  return (
    <DocPage
      kicker="teach.kicker"
      title="teach.title"
      lead="teach.lead"
      metaTitle="meta.teach.title"
      metaDescription="meta.teach.description"
      beforeSections={
        <nav className="teach-contents" aria-labelledby="teach-contents">
          <h2 id="teach-contents" className="teach-label">
            {t('teach.contents')}
          </h2>
          <ol>
            {sections.map((s) => (
              <li key={s.id}>
                <a className="doc-link" href={`#${s.id}`}>
                  {t(s.title)}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      }
      sections={sections}
    >
      <div className="lp-actions doc-foot">
        <LinkButton to="/register" size="lg">
          {t('landing.hero.start')}
        </LinkButton>
        <LinkButton to="/faq" variant="secondary" size="lg">
          {t('faq.all')}
        </LinkButton>
      </div>
    </DocPage>
  );
}

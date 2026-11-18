import type { ReactNode } from 'react';
import { usePageMeta, useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { ZAGROSIAN_URL } from '../brand/zagrosian';

/** A page of plain words (About, the FAQ, How Hevalo teaches, Privacy, Terms): a claim, then short sections. */
export interface DocSection {
  title: MessageKey;
  /** A paragraph by key, or anything else the section needs. */
  body: MessageKey | ReactNode;
  /** An anchor for a section linked to directly. */
  id?: string;
}

export function DocPage({
  kicker,
  title,
  lead,
  metaTitle,
  metaDescription,
  sections,
  beforeSections,
  children,
}: {
  kicker: MessageKey;
  title: MessageKey;
  lead: MessageKey;
  metaTitle: MessageKey;
  metaDescription: MessageKey;
  sections: ReadonlyArray<DocSection>;
  /** What comes between the opening and the sections, such as a list of them. */
  beforeSections?: ReactNode;
  children?: ReactNode;
}): React.JSX.Element {
  const t = useT();
  usePageMeta(t(metaTitle), t(metaDescription));
  return (
    <article className="container doc">
      <header className="doc-head">
        <p className="lp-kicker">{t(kicker)}</p>
        <h1 className="lp-h2">{t(title)}</h1>
        <p className="lp-lead">{t(lead)}</p>
      </header>
      {beforeSections}
      <div className="doc-body">
        {sections.map((s) => (
          <section className="doc-section" key={s.title} id={s.id}>
            <h2>{t(s.title)}</h2>
            <div>{typeof s.body === 'string' ? <p>{t(s.body as MessageKey)}</p> : s.body}</div>
          </section>
        ))}
        {children}
      </div>
    </article>
  );
}

/** Who is behind Hevalo, with the company's address; closes all three pages. */
export function MadeBy({ inline = false }: { inline?: boolean }): React.JSX.Element {
  const t = useT();
  return (
    <p className={inline ? undefined : 'doc-foot muted'}>
      {t('about.makerBody')}{' '}
      <a className="doc-link" href={ZAGROSIAN_URL} target="_blank" rel="noreferrer noopener">
        zagrosian.com
      </a>
    </p>
  );
}

import { Link } from 'react-router-dom';
import { useT } from '../i18n/I18nProvider';
import type { FaqEntry } from '../landing/faq';

/**
 * Questions that open to their answers.
 *
 * `<details>` rather than a disclosure built from buttons and state: it opens
 * with Enter and Space, announces itself as expandable, works before (and
 * without) any script, and every answer is in the page for a search engine to
 * read whether it is open or not.
 *
 * With `structuredData` it also writes the list as schema.org FAQPage — in the
 * reader's language, because it is built from the same translated strings. A
 * data block, never executed, so the CSP's `script-src 'self'` does not apply.
 */
export function FaqList({
  entries,
  structuredData = false,
}: {
  entries: ReadonlyArray<FaqEntry>;
  structuredData?: boolean;
}): React.JSX.Element {
  const t = useT();
  return (
    <>
      <div className="faq">
        {entries.map((e) => (
          <details className="faq-item" key={e.id} id={`faq-${e.id}`}>
            <summary className="faq-q">
              <span>{t(e.q)}</span>
              <span className="faq-icon" aria-hidden />
            </summary>
            <div className="faq-a">
              <p>{t(e.a)}</p>
              {e.link &&
                (e.link.external ? (
                  <a className="doc-link" href={e.link.to} target="_blank" rel="noreferrer noopener">
                    {t(e.link.label)}
                  </a>
                ) : (
                  <Link className="doc-link" to={e.link.to}>
                    {t(e.link.label)}
                  </Link>
                ))}
            </div>
          </details>
        ))}
      </div>
      {structuredData && (
        <script type="application/ld+json">
          {JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: entries.map((e) => ({
              '@type': 'Question',
              name: t(e.q),
              acceptedAnswer: { '@type': 'Answer', text: t(e.a) },
            })),
          })}
        </script>
      )}
    </>
  );
}

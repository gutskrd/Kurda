import { Link } from 'react-router-dom';
import { useT } from '../i18n/I18nProvider';
import type { FaqEntry } from '../landing/faq';

/**
 * Questions that open to their answers, as `<details>`: keyboard and screen-reader support built in, working without
 * script, and every answer readable by search engines. `structuredData` also writes the list as schema.org FAQPage in the
 * reader's language; a data block is never executed, so the CSP's `script-src 'self'` does not apply.
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
              {/* On its own line, so its touch reach extends above and below its words (styles/reach.css). */}
              {e.link &&
                (e.link.external ? (
                  <a className="doc-link reach-line" href={e.link.to} target="_blank" rel="noreferrer noopener">
                    {t(e.link.label)}
                  </a>
                ) : (
                  <Link className="doc-link reach-line" to={e.link.to}>
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

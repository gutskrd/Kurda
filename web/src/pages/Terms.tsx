import { Link } from 'react-router-dom';
import { DocPage, MadeBy, type DocSection } from '../components/DocPage';
import { ContactPoints, ProviderIdentityBlock } from '../copyright/ProviderDetails';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';

/*
 * The rules, in plain words.
 *
 * Registering already says "you agree to the Hevalo Terms", and until this page
 * there were no terms anywhere to read. These describe what the product
 * actually does — the moderation tools that can warn, mute and ban
 * (api/src/admin), currencies that only exist inside the app (api/src/wallet),
 * deletion from Settings, asking again when the rules change — rather than
 * borrowing somebody else's.
 *
 * They also say what the law asks a host of other people's posts to say
 * (contract-3 §C): who provides Hevalo and how to reach them (Art. 3:15d BW;
 * DSA Arts 11–12), the promise a poster makes and the narrow licence they
 * give, notices and counter-notices (DSA Arts 16–17, DMCA §512), the
 * repeat-infringer policy (§512(i)), how decisions are made (DSA Art. 14) and
 * the law the terms are under — and, first, the same rules in a few short
 * lines, since many of the people reading them are teenagers (Art. 14(3)).
 */

/** The rules in a few lines, for someone who will not read the rest. */
const SUMMARY: MessageKey[] = [
  'terms.summary.kind',
  'terms.summary.own',
  'terms.summary.yours',
  'terms.summary.rules',
  'terms.summary.zer',
  'terms.summary.leave',
];

export function Terms(): React.JSX.Element {
  const t = useT();
  const sections: ReadonlyArray<DocSection> = [
    {
      id: 'provider',
      title: 'terms.provider.title',
      body: (
        <>
          <p>{t('terms.provider.lead')}</p>
          <ProviderIdentityBlock />
        </>
      ),
    },
    { title: 'terms.account.title', body: 'terms.account.body' },
    { title: 'terms.people.title', body: 'terms.people.body' },
    { title: 'terms.content.title', body: 'terms.content.body' },
    { id: 'your-promise', title: 'terms.warranty.title', body: 'terms.warranty.body' },
    { id: 'licence', title: 'terms.licence.title', body: 'terms.licence.body' },
    {
      title: 'terms.moderation.title',
      body: (
        <>
          <p>{t('terms.moderation.body')}</p>
          <p>{t('terms.moderationHow')}</p>
        </>
      ),
    },
    {
      id: 'copyright',
      title: 'terms.notices.title',
      body: (
        <>
          <p>{t('terms.notices.body')}</p>
          <p>
            <Link className="doc-link" to="/copyright">
              {t('terms.notices.link')}
            </Link>
          </p>
        </>
      ),
    },
    { id: 'repeat-infringers', title: 'terms.repeat.title', body: 'terms.repeat.body' },
    { title: 'terms.currency.title', body: 'terms.currency.body' },
    { id: 'shop-items', title: 'terms.shopArt.title', body: 'terms.shopArt.body' },
    {
      id: 'contact',
      title: 'terms.contact.title',
      body: (
        <>
          <p>{t('terms.contact.lead')}</p>
          <ContactPoints />
        </>
      ),
    },
    { id: 'law', title: 'terms.law.title', body: 'terms.law.body' },
    { title: 'terms.changes.title', body: 'terms.changes.body' },
    { title: 'terms.leaving.title', body: 'terms.leaving.body' },
  ];

  return (
    <DocPage
      kicker="terms.kicker"
      title="terms.title"
      lead="terms.lead"
      metaTitle="meta.terms.title"
      metaDescription="meta.terms.description"
      beforeSections={
        <section className="cr-summary" aria-labelledby="terms-summary">
          <h2 id="terms-summary">{t('terms.summary.title')}</h2>
          <ul className="doc-list">
            {SUMMARY.map((k) => (
              <li key={k}>{t(k)}</li>
            ))}
          </ul>
        </section>
      }
      sections={sections}
    >
      <MadeBy />
    </DocPage>
  );
}

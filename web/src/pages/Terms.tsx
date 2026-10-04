import { DocPage, MadeBy, type DocSection } from '../components/DocPage';

/*
 * The rules, in plain words.
 *
 * Registering already says "you agree to the Hevalo Terms", and until this page
 * there were no terms anywhere to read. These describe what the product
 * actually does — the moderation tools that can warn, mute and ban
 * (api/src/admin), currencies that only exist inside the app (api/src/wallet),
 * deletion from Settings, asking again when the rules change — rather than
 * borrowing somebody else's.
 */
const SECTIONS: ReadonlyArray<DocSection> = [
  { title: 'terms.account.title', body: 'terms.account.body' },
  { title: 'terms.people.title', body: 'terms.people.body' },
  { title: 'terms.content.title', body: 'terms.content.body' },
  { title: 'terms.moderation.title', body: 'terms.moderation.body' },
  { title: 'terms.currency.title', body: 'terms.currency.body' },
  { title: 'terms.changes.title', body: 'terms.changes.body' },
  { title: 'terms.leaving.title', body: 'terms.leaving.body' },
];

export function Terms(): React.JSX.Element {
  return (
    <DocPage
      kicker="terms.kicker"
      title="terms.title"
      lead="terms.lead"
      metaTitle="meta.terms.title"
      metaDescription="meta.terms.description"
      sections={SECTIONS}
    >
      <MadeBy />
    </DocPage>
  );
}

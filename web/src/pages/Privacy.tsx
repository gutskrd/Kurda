import { DocPage, MadeBy, type DocSection } from '../components/DocPage';

/*
 * What Hevalo keeps, in plain words.
 *
 * Every sentence here is something the product already does, and each one can
 * be traced to where it is done: the collected data and the permissions are the
 * App Store answers in docs/app-store/privacy.md; profile visibility and
 * blocking are Settings; the hashed phone number is phone verification; the
 * export, the deletion and its 14-day grace are api/src/gdpr; asking again after
 * a material change is the consent version in api/src/gdpr/consent.ts. If one of
 * those changes, the sentence about it has to change with it.
 */
const SECTIONS: ReadonlyArray<DocSection> = [
  { title: 'privacy.collect.title', body: 'privacy.collect.body' },
  { title: 'privacy.why.title', body: 'privacy.why.body' },
  { title: 'privacy.visibility.title', body: 'privacy.visibility.body' },
  { title: 'privacy.safety.title', body: 'privacy.safety.body' },
  { title: 'privacy.permissions.title', body: 'privacy.permissions.body' },
  { title: 'privacy.payments.title', body: 'privacy.payments.body' },
  { title: 'privacy.control.title', body: 'privacy.control.body' },
  { title: 'privacy.changes.title', body: 'privacy.changes.body' },
];

export function Privacy(): React.JSX.Element {
  return (
    <DocPage
      kicker="privacy.kicker"
      title="privacy.title"
      lead="privacy.lead"
      metaTitle="meta.privacy.title"
      metaDescription="meta.privacy.description"
      sections={SECTIONS}
    >
      <MadeBy />
    </DocPage>
  );
}

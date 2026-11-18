import { DocPage, MadeBy, type DocSection } from '../components/DocPage';
import { ProviderIdentityBlock } from '../copyright/ProviderDetails';
import { useT } from '../i18n/I18nProvider';

/*
 * What Hevalo keeps, in plain words. Each sentence matches something the product does, and must change with it: data and
 * permissions (docs/app-store/privacy.md), visibility and blocking (Settings), the hashed phone number (phone
 * verification), export and deletion with its 14-day grace (api/src/gdpr), and re-consent (api/src/gdpr/consent.ts). It
 * opens with the controller and how to reach them, as the GDPR requires, from the same record as Terms and About.
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

function Controller(): React.JSX.Element {
  const t = useT();
  return (
    <>
      <p>{t('privacy.controller.body')}</p>
      <ProviderIdentityBlock />
    </>
  );
}

const CONTROLLER: DocSection = { id: 'controller', title: 'privacy.controller.title', body: <Controller /> };

export function Privacy(): React.JSX.Element {
  return (
    <DocPage
      kicker="privacy.kicker"
      title="privacy.title"
      lead="privacy.lead"
      metaTitle="meta.privacy.title"
      metaDescription="meta.privacy.description"
      sections={[CONTROLLER, ...SECTIONS]}
    >
      <MadeBy />
    </DocPage>
  );
}

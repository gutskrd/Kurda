import { DocPage, MadeBy, type DocSection } from '../components/DocPage';
import { ProviderIdentityBlock } from '../copyright/ProviderDetails';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';

/*
 * What Hevalo keeps, in plain words. Each sentence matches something the product does, and must change with it: data and
 * permissions (docs/app-store/privacy.md), what the age decides (api/src/users/age.ts), visibility and blocking
 * (Settings), the hashed phone number (phone verification), how pictures are checked and how long a refused one is
 * kept (shared picture-review.ts, api/src/moderation), when staff may read a letter or private message and that each
 * reading is recorded (shared message-access.ts, api/src/message-access), how a banned person is kept from returning
 * and what the suspension screen still offers (shared account-hold.ts), the security log's retention
 * (api/src/security/log.ts), export and deletion with its 14-day grace (api/src/gdpr), re-consent
 * (api/src/gdpr/consent.ts), and what a child profile holds and how long (api/src/family, docs/privacy/children.md). It
 * opens with the controller and how to reach them, as the GDPR requires, from the same record as Terms and About.
 */
const SECTIONS: ReadonlyArray<DocSection> = [
  { title: 'privacy.collect.title', body: 'privacy.collect.body' },
  { title: 'privacy.why.title', body: <Paragraphs keys={['privacy.why.body', 'privacy.why.basis']} /> },
  { title: 'privacy.visibility.title', body: 'privacy.visibility.body' },
  { title: 'privacy.safety.title', body: <Paragraphs keys={['privacy.safety.body', 'privacy.safety.messages', 'privacy.safety.returns']} /> },
  {
    id: 'children',
    title: 'privacy.children.title',
    body: <Paragraphs keys={['privacy.children.teens', 'privacy.children.profiles', 'privacy.children.use', 'privacy.children.parents']} />,
  },
  { id: 'processors', title: 'privacy.processors.title', body: 'privacy.processors.body' },
  { title: 'privacy.permissions.title', body: 'privacy.permissions.body' },
  { title: 'privacy.payments.title', body: 'privacy.payments.body' },
  { id: 'retention', title: 'privacy.retention.title', body: 'privacy.retention.body' },
  { id: 'rights', title: 'privacy.control.title', body: 'privacy.control.body' },
  { title: 'privacy.changes.title', body: 'privacy.changes.body' },
];

/** A section of several paragraphs, in order. */
function Paragraphs({ keys }: { keys: ReadonlyArray<MessageKey> }): React.JSX.Element {
  const t = useT();
  return (
    <>
      {keys.map((key) => (
        <p key={key}>{t(key)}</p>
      ))}
    </>
  );
}

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

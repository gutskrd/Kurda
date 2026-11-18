import { Link } from 'react-router-dom';
import { DocPage } from '../components/DocPage';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { NoticeForm } from './NoticeForm';
import { CounterNotices } from './CounterNotices';
import { ContactPoints, DmcaAgent, dmcaAgentRegistered } from './ProviderDetails';
import './copyright.css';

/** What happens to a notice, step by step, matching the API (api/src/copyright). */
const STEPS: MessageKey[] = [
  'copyright.how.step1',
  'copyright.how.step2',
  'copyright.how.step3',
  'copyright.how.step4',
];

/**
 * /copyright, for rights holders whose work was posted without permission and for people whose post was taken down.
 * Open to everyone, since hosting law (DSA Art. 16, DMCA §512(c)) expects anyone to be able to send a notice. The
 * notice form comes first, then how it is handled, the counter-notice and the designated agent.
 */
export function CopyrightPage(): React.JSX.Element {
  const t = useT();
  return (
    <DocPage
      kicker="copyright.kicker"
      title="copyright.title"
      lead="copyright.lead"
      metaTitle="meta.copyright.title"
      metaDescription="meta.copyright.description"
      sections={[
        {
          id: 'notice',
          title: 'copyright.notice.title',
          body: (
            <>
              <p>{t('copyright.notice.lead')}</p>
              <NoticeForm />
            </>
          ),
        },
        {
          id: 'how',
          title: 'copyright.how.title',
          body: (
            <ol className="cr-steps">
              {STEPS.map((k) => (
                <li key={k}>{t(k)}</li>
              ))}
            </ol>
          ),
        },
        {
          id: 'counter',
          title: 'copyright.counter.title',
          body: (
            <>
              <p>{t('copyright.counter.lead')}</p>
              <p>{t('copyright.counter.how')}</p>
              <CounterNotices />
            </>
          ),
        },
        {
          id: 'repeat',
          title: 'copyright.repeat.title',
          body: 'copyright.repeat.body',
        },
        // The US designated agent, only once registered, so the page never shows placeholders.
        ...(dmcaAgentRegistered()
          ? [
              {
                id: 'agent',
                title: 'copyright.agent.title' as const,
                body: (
                  <>
                    <p>{t('copyright.agent.lead')}</p>
                    <DmcaAgent />
                  </>
                ),
              },
            ]
          : []),
        {
          id: 'contact',
          title: 'copyright.contact.title',
          body: (
            <>
              <ContactPoints />
              <p>
                {t('copyright.contact.more')}{' '}
                <Link className="doc-link" to="/terms">
                  {t('footer.terms')}
                </Link>
              </p>
            </>
          ),
        },
      ]}
    />
  );
}

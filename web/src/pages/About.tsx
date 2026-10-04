import { LinkButton } from '../components/Button';
import { DocPage, MadeBy } from '../components/DocPage';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';

/*
 * What Hevalo is, what it does today, and what it does not do yet.
 *
 * The two lists are the point of the page. A visitor who has just read the
 * front page should be able to tell, without asking, which of those things
 * they can use this afternoon — and the lessons are not one of them yet.
 */
const NOW: MessageKey[] = [
  'about.now.games',
  'about.now.social',
  'about.now.progress',
  'about.now.community',
  'about.now.dictionary',
  'about.now.languages',
];

const NEXT: MessageKey[] = ['about.next.apps', 'about.next.varieties'];

export function About(): React.JSX.Element {
  const t = useT();
  return (
    <DocPage
      kicker="about.kicker"
      title="about.title"
      lead="about.lead"
      metaTitle="meta.about.title"
      metaDescription="meta.about.description"
      sections={[
        { title: 'about.nameTitle', body: 'about.nameBody' },
        {
          title: 'about.nowTitle',
          body: (
            <>
              <p>{t('about.nowLead')}</p>
              <ul className="doc-list">
                {NOW.map((k) => (
                  <li key={k}>{t(k)}</li>
                ))}
              </ul>
            </>
          ),
        },
        {
          title: 'about.nextTitle',
          body: (
            <ul className="doc-list doc-list--soon">
              {NEXT.map((k) => (
                <li key={k}>{t(k)}</li>
              ))}
            </ul>
          ),
        },
        { title: 'about.makerTitle', body: <MadeBy inline /> },
      ]}
    >
      <div className="lp-actions doc-foot">
        <LinkButton to="/register" size="lg">
          {t('landing.hero.start')}
        </LinkButton>
        <LinkButton to="/app/games" variant="secondary" size="lg">
          {t('landing.hero.play')}
        </LinkButton>
      </div>
    </DocPage>
  );
}

import { Link } from 'react-router-dom';
import { LinkButton } from '../components/Button';
import { DocPage, MadeBy } from '../components/DocPage';
import { ContactPoints, ProviderIdentityBlock } from '../copyright/ProviderDetails';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';

/* What Hevalo is, what it does today and what it does not do yet; the two lists say what a visitor can use this afternoon. */
const NOW: MessageKey[] = [
  'about.now.lessons',
  'about.now.games',
  'about.now.social',
  'about.now.progress',
  'about.now.community',
  'about.now.dictionary',
  'about.now.languages',
];

const NEXT: MessageKey[] = ['about.next.apps', 'about.next.varieties'];

/** Whose work Hevalo uses and under which licence: fonts (OFL), icons (MIT), emoji (Apache 2.0); the shop art and stickers are Hevalo's own. */
const CREDITS: MessageKey[] = ['about.credits.fonts', 'about.credits.icons', 'about.credits.emoji'];

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
          title: 'teach.title',
          body: (
            <p>
              {t('about.teachBody')}{' '}
              <Link className="doc-link" to="/how-hevalo-teaches">
                {t('footer.teach')}
              </Link>
            </p>
          ),
        },
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
        {
          title: 'about.creditsTitle',
          body: (
            <>
              <p>{t('about.creditsLead')}</p>
              <ul className="doc-list">
                {CREDITS.map((k) => (
                  <li key={k}>{t(k)}</li>
                ))}
              </ul>
              <p>{t('about.credits.art')}</p>
            </>
          ),
        },
        { title: 'about.makerTitle', body: <MadeBy inline /> },
        // Who provides Hevalo and how to reach them, from shared/src/provider.ts.
        {
          id: 'provider',
          title: 'about.providerTitle',
          body: (
            <>
              <ProviderIdentityBlock />
              <ContactPoints />
              <p>
                {t('about.copyrightNote')}{' '}
                <Link className="doc-link" to="/copyright">
                  {t('footer.copyright')}
                </Link>
              </p>
            </>
          ),
        },
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

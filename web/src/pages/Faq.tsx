import { LinkButton } from '../components/Button';
import { DocPage } from '../components/DocPage';
import { FaqList } from '../components/FaqList';
import { useT } from '../i18n/I18nProvider';
import { FAQ } from '../landing/faq';

/** Every question, on a page of its own — the front page carries the first six. */
export function Faq(): React.JSX.Element {
  const t = useT();
  return (
    <DocPage
      kicker="faq.kicker"
      title="faq.title"
      lead="faq.lead"
      metaTitle="meta.faq.title"
      metaDescription="meta.faq.description"
      sections={[]}
    >
      <FaqList entries={FAQ} structuredData />
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

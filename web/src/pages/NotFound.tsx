import { LinkButton } from '../components/Button';
import { useT } from '../i18n/I18nProvider';
import { StateArt } from '../components/states';

export function NotFound(): React.JSX.Element {
  const t = useT();
  return (
    <div className="container" style={{ padding: '72px 24px 96px', textAlign: 'center' }}>
      {/* Hevalo puzzled at the page that is not there, as over any page that could not be shown. */}
      <StateArt puzzled />
      <span className="eyebrow">404</span>
      <h1 className="display" style={{ marginTop: 12, fontSize: 'var(--text-title)' }}>
        {t('notFound.title')}
      </h1>
      <p className="lead" style={{ margin: '16px auto 30px', maxWidth: '44ch' }}>
        {t('notFound.body')}
      </p>
      <LinkButton to="/" size="lg">
        {t('notFound.backHome')}
      </LinkButton>
    </div>
  );
}

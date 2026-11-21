import { LinkButton } from '../components/Button';
import { useT } from '../i18n/I18nProvider';

export function NotFound(): React.JSX.Element {
  const t = useT();
  return (
    <div className="container" style={{ padding: '96px 24px', textAlign: 'center' }}>
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

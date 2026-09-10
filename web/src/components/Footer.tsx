import { Link } from 'react-router-dom';
import { Brand } from './Brand';
import { useT } from '../i18n/I18nProvider';

export function Footer(): React.JSX.Element {
  const t = useT();
  const year = new Date().getFullYear();
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div style={{ maxWidth: 280 }}>
            <Brand />
            <p className="muted" style={{ marginTop: 12, fontSize: '0.92rem' }}>
              {t('footer.tagline')}
            </p>
            {/*
              Left in Kurmancî in every language on purpose: it is the app's own
              line, the way a masthead keeps its motto. Translating it would
              turn the one Kurdish sentence on a German screen into German.
            */}
            <p className="kurdish" style={{ marginTop: 10 }}>
              Jiyan bi kurdî xweştire.
            </p>
          </div>

          <div className="footer-col">
            <h4>{t('nav.learn')}</h4>
            <Link to="/learn">{t('footer.lessons')}</Link>
            <Link to="/app/civak">{t('nav.civak')}</Link>
            <Link to="/games">{t('nav.games')}</Link>
          </div>

          <div className="footer-col">
            <h4>{t('footer.community')}</h4>
            <Link to="/rankings">{t('nav.rankings')}</Link>
            <Link to="/register">{t('footer.join')}</Link>
            <Link to="/login">{t('nav.login')}</Link>
          </div>

          <div className="footer-col">
            <h4>{t('footer.app')}</h4>
            <a href="https://apps.apple.com/" target="_blank" rel="noreferrer noopener">
              {t('footer.iosSoon')}
            </a>
            <a href="https://play.google.com/" target="_blank" rel="noreferrer noopener">
              {t('footer.androidSoon')}
            </a>
          </div>
        </div>

        <div className="footer-bottom">
          <span>© {year} MyKurda</span>
          <span className="muted">{t('footer.madeWithCare')}</span>
        </div>
      </div>
    </footer>
  );
}

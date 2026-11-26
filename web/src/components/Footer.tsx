import { Link } from 'react-router-dom';
import { PROVIDER } from '@kurda/shared';
import { Brand } from './Brand';
import { ZagrosianCredit } from './ZagrosianCredit';
import { useLocale, useT } from '../i18n/I18nProvider';
import { publishedDictionary } from '../layouts/navLinks';
import { AppSoonButton } from '../landing/AppSoon';

/**
 * The foot of the public pages. Until the apps are published, their entries open the card that says they are coming
 * (landing/AppSoon), as the front page's download buttons do. The bottom bar shows the registered business and its KvK
 * number on every public page, as Dutch law requires, and links to the full details on the About page.
 */
export function Footer(): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const year = new Date().getFullYear();
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div className="footer-about">
            <Brand />
            <p className="muted" style={{ marginTop: 12, fontSize: 'var(--text)' }}>
              {t('footer.tagline')}
            </p>
            {/* Kurmancî in every language on purpose: it is the app's own motto line. */}
            <p className="kurdish" lang="ku" style={{ marginTop: 10 }}>
              Jiyan bi kurdî xweştire.
            </p>
          </div>

          <nav className="footer-col" aria-labelledby="footer-explore">
            <h2 className="footer-heading" id="footer-explore">
              {t('footer.explore')}
            </h2>
            <Link to="/#learn">{t('nav.learn')}</Link>
            <Link to="/app/games">{t('nav.games')}</Link>
            <Link to="/app">{t('nav.community')}</Link>
            {/* A plain anchor: the published dictionary is static files outside this app, so the router has no route for it. */}
            <a href={publishedDictionary(locale)}>{t('nav.dictionary')}</a>
            <Link to="/app/alphabet">{t('footer.alphabet')}</Link>
            <Link to="/app/rankings">{t('nav.rankings')}</Link>
          </nav>

          <nav className="footer-col" aria-labelledby="footer-company">
            <h2 className="footer-heading" id="footer-company">
              {t('footer.company')}
            </h2>
            <Link to="/about">{t('nav.about')}</Link>
            {/* Also in the published dictionary's footer (web/scripts/ferheng-pages.ts). */}
            <Link to="/how-hevalo-teaches">{t('footer.teach')}</Link>
            <Link to="/faq">{t('footer.faq')}</Link>
            <Link to="/privacy">{t('footer.privacy')}</Link>
            <Link to="/terms">{t('footer.terms')}</Link>
            <Link to="/copyright">{t('footer.copyright')}</Link>
          </nav>

          <div className="footer-col">
            <h2 className="footer-heading">{t('footer.app')}</h2>
            <AppSoonButton platform="ios" look="line">
              {t('footer.iosSoon')}
            </AppSoonButton>
            <AppSoonButton platform="android" look="line">
              {t('footer.androidSoon')}
            </AppSoonButton>
          </div>
        </div>

        <div className="footer-bottom">
          {/* The two quiet lines stay together on the left, leaving the right end to the imprint. */}
          <span className="footer-bottom-left">
            <span>© {year} Hevalo</span>
            <span className="muted">{t('footer.madeWithCare')}</span>
            <Link className="footer-imprint" to="/about#provider">
              {t('footer.imprint', { name: PROVIDER.legalName, kvk: PROVIDER.kvk })}
            </Link>
          </span>
          <ZagrosianCredit />
        </div>
      </div>
    </footer>
  );
}

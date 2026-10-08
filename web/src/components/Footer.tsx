import { Link } from 'react-router-dom';
import { Brand } from './Brand';
import { ZagrosianCredit } from './ZagrosianCredit';
import { useLocale, useT } from '../i18n/I18nProvider';
import { publishedDictionary } from '../layouts/navLinks';

/**
 * The foot of the public pages.
 *
 * Two of its links used to go nowhere: `/learn` and `/rankings` are not routes,
 * only `/app/learn` and `/app/rankings` are, so both drew "Page not found". And
 * the two store links opened the App Store's and Google Play's front pages under
 * the words "coming soon" — a link that promises an app and delivers a
 * storefront. Until the apps are in the stores, the column says so in plain
 * text and links nowhere.
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
            <p className="muted" style={{ marginTop: 12, fontSize: '0.92rem' }}>
              {t('footer.tagline')}
            </p>
            {/*
              Left in Kurmancî in every language on purpose: it is the app's own
              line, the way a masthead keeps its motto. Translating it would
              turn the one Kurdish sentence on a German screen into German.
            */}
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
            {/*
              A real anchor, not a <Link>: the published dictionary is thousands
              of generated files served straight off the edge, outside this app
              entirely. A client-side transition would hand the path to a router
              that has no route for it and show "Page not found" over a page
              that exists.
            */}
            <a href={publishedDictionary(locale)}>{t('nav.dictionary')}</a>
            <Link to="/app/alphabet">{t('footer.alphabet')}</Link>
            <Link to="/app/rankings">{t('nav.rankings')}</Link>
          </nav>

          <nav className="footer-col" aria-labelledby="footer-company">
            <h2 className="footer-heading" id="footer-company">
              {t('footer.company')}
            </h2>
            <Link to="/about">{t('nav.about')}</Link>
            {/* also in the published dictionary's footer (web/scripts/ferheng-pages.ts) */}
            <Link to="/how-hevalo-teaches">{t('footer.teach')}</Link>
            <Link to="/faq">{t('footer.faq')}</Link>
            <Link to="/privacy">{t('footer.privacy')}</Link>
            <Link to="/terms">{t('footer.terms')}</Link>
          </nav>

          <div className="footer-col">
            <h2 className="footer-heading">{t('footer.app')}</h2>
            <span className="footer-soon">{t('footer.iosSoon')}</span>
            <span className="footer-soon">{t('footer.androidSoon')}</span>
          </div>
        </div>

        <div className="footer-bottom">
          {/* the two quiet lines travel together on the left, so the imprint
              has the right-hand end of the bar to itself */}
          <span className="footer-bottom-left">
            <span>© {year} Hevalo</span>
            <span className="muted">{t('footer.madeWithCare')}</span>
          </span>
          <ZagrosianCredit />
        </div>
      </div>
    </footer>
  );
}

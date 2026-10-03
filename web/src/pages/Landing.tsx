import { useEffect } from 'react';
import { LinkButton } from '../components/Button';
import { BookIcon, FeatherIcon, GameIcon, TrophyIcon, FlameIcon, CoinIcon } from '../components/icons';
import { seasonalLogo } from '../brand/season';
import { warmApi } from '../lib/warmup';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';

const FEATURES: ReadonlyArray<{ icon: React.ReactNode; titleKey: MessageKey; bodyKey: MessageKey }> = [
  { icon: <BookIcon />, titleKey: 'landing.feature.lessons', bodyKey: 'landing.feature.lessonsBody' },
  { icon: <FeatherIcon />, titleKey: 'landing.feature.library', bodyKey: 'landing.feature.libraryBody' },
  { icon: <GameIcon />, titleKey: 'landing.feature.play', bodyKey: 'landing.feature.playBody' },
  { icon: <TrophyIcon />, titleKey: 'landing.feature.rankings', bodyKey: 'landing.feature.rankingsBody' },
  { icon: <FlameIcon />, titleKey: 'landing.feature.streaks', bodyKey: 'landing.feature.streaksBody' },
  { icon: <CoinIcon />, titleKey: 'landing.feature.zer', bodyKey: 'landing.feature.zerBody' },
];

export function Landing(): React.JSX.Element {
  const t = useT();
  // warm the API early so sign-in later doesn't pay the cold-start penalty
  useEffect(() => {
    warmApi();
  }, []);
  return (
    <>
      <section className="hero">
        <div className="container hero-grid">
          <div className="hero-inner">
            <span className="eyebrow">{t('landing.eyebrow')}</span>
            {/*
              One sentence, not two halves with a <br> between them. The line
              break was a typographic choice made for one English sentence, and
              every other language breaks in a different place — or not at all.
            */}
            <h1 className="display">{t('landing.headline')}</h1>
            <p className="lead">{t('landing.lead')}</p>
            <div className="hero-actions">
              <LinkButton to="/register" size="lg">
                {t('landing.startFree')}
              </LinkButton>
              <LinkButton to="/stories" variant="secondary" size="lg">
                {t('landing.exploreStories')}
              </LinkButton>
            </div>
            <p className="hero-note">{t('landing.noCreditCard')}</p>
          </div>

          {/*
            The deer, at the size a product icon is shown at.

            The page was words from the top of the screen to the bottom of it —
            an eyebrow, a headline, a sentence, two buttons and a line of fine
            print — and the thing the whole product is called after appeared
            nowhere on it but 30px wide in the corner of the nav.

            Decorative, so `alt=""`: the brand is already named in the bar above
            and in the headline, and a screen reader that announced the deer
            here would be saying Hevalo three times before the first sentence.

            `seasonalLogo()` is the same one the bar uses, so the scarf arrives
            in December in both places at once.
          */}
          <div className="hero-art">
            <img src={seasonalLogo()} alt="" width={512} height={512} fetchPriority="high" />
          </div>
        </div>
      </section>

      <hr className="divider" />

      <section className="section">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">{t('landing.everythingTitle')}</span>
            <h2 className="h-section">{t('landing.everythingSub')}</h2>
            <p>{t('landing.sameProduct')}</p>
          </div>
          <div className="grid grid-3">
            {FEATURES.map((f) => (
              <article className="feature" key={f.titleKey}>
                <div className="feature-icon">{f.icon}</div>
                <h3>{t(f.titleKey)}</h3>
                <p>{t(f.bodyKey)}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="cta">
            <span className="eyebrow">{t('landing.letsBegin')}</span>
            <h2 className="h-section">{t('landing.readyTitle')}</h2>
            <p>{t('landing.readyBody')}</p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <LinkButton to="/register" size="lg">
                {t('auth.register.title')}
              </LinkButton>
              <LinkButton to="/login" variant="secondary" size="lg">
                {t('landing.haveOne')}
              </LinkButton>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

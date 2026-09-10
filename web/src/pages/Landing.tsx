import { useEffect } from 'react';
import { LinkButton } from '../components/Button';
import { BookIcon, FeatherIcon, GameIcon, TrophyIcon, SparkIcon, CoinIcon } from '../components/icons';
import { warmApi } from '../lib/warmup';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';

const FEATURES: ReadonlyArray<{ icon: React.ReactNode; titleKey: MessageKey; bodyKey: MessageKey }> = [
  { icon: <BookIcon />, titleKey: 'landing.feature.lessons', bodyKey: 'landing.feature.lessonsBody' },
  { icon: <FeatherIcon />, titleKey: 'landing.feature.library', bodyKey: 'landing.feature.libraryBody' },
  { icon: <GameIcon />, titleKey: 'landing.feature.play', bodyKey: 'landing.feature.playBody' },
  { icon: <TrophyIcon />, titleKey: 'landing.feature.rankings', bodyKey: 'landing.feature.rankingsBody' },
  { icon: <SparkIcon />, titleKey: 'landing.feature.streaks', bodyKey: 'landing.feature.streaksBody' },
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
        <div className="container hero-inner">
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

import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { COUCH_WAYS, dialectDirection, impostorCategoriesInOrder, impostorCategoryTone, impostorWayTone, meaningIn } from '@kurda/shared';
import { LinkButton } from '../components/Button';
import { ChevronIcon, ImpostorIcon, PlayIcon, UsersIcon } from '../components/icons';
import { Loading } from '../components/states';
import { useGameDialect } from '../games/soloRounds';
import { useLocale, useT } from '../i18n/I18nProvider';
import { usePartyOffer } from '../party/offer';
import { InviteForm } from '../play/InviteSheet';
import { CategoryArt, EmblemArt, WayArt } from './art';
import { useImpostorCategories } from './categories';
import { WAY_KEY, WAY_NOTE } from './ways';
import './start.css';

const PATH = '/app/games/impostor';
const STEPS = ['games.impostor.how.card', 'games.impostor.how.clues', 'games.impostor.how.vote'] as const;

/**
 * Impostor's start page, in decision order: "Play on this phone" first, then the ways to play and categories (each
 * opening the setup with that choice), how a round goes, and playing with friends elsewhere. Without approved word
 * cards it says so instead. Categories are in the learner's own Kurdish where offered.
 */
export function ImpostorStart(): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const offer = usePartyOffer('impostor');
  const preferred = useGameDialect();
  const dialect = (offer?.find((o) => o.dialect === preferred) ?? offer?.[0])?.dialect ?? null;
  const couch = useImpostorCategories(dialect);
  if (offer === null) return <Loading />;
  if (dialect === null) {
    return (
      <div className="state party-not-offered">
        <ImpostorIcon size={32} />
        <p>{t('games.impostor.notOffered')}</p>
        <Link to="/app/games" className="btn btn-secondary">
          {t('games.back')}
        </Link>
      </div>
    );
  }
  const categories = impostorCategoriesInOrder(couch?.difficulties[0]?.categories ?? []);
  const script = dialectDirection(dialect);
  return (
    <div className="imp-start">
      <section className="imp-hero" aria-labelledby="imp-hero-tagline">
        <div className="imp-hero-art">
          <EmblemArt emblem="cards" size={184} />
        </div>
        <p className="imp-hero-meta">{t('games.impostor.hero.meta')}</p>
        <h2 id="imp-hero-tagline" className="imp-hero-tagline">
          {t('games.impostor.hero.tagline')}
        </h2>
        <div className="imp-hero-actions">
          <LinkButton to={`${PATH}?couch=1`} size="lg" block className="imp-hero-play">
            <PlayIcon size={18} />
            {t('games.couch.open')}
          </LinkButton>
          <a href="#party-friends" className="btn btn-secondary btn-block imp-hero-friends">
            <UsersIcon size={18} />
            {t('games.party.withFriends')}
          </a>
        </div>
      </section>

      <section className="imp-shelf" aria-labelledby="imp-ways-title">
        <h2 id="imp-ways-title" className="imp-shelf-title">
          {t('games.impostor.ways')}
        </h2>
        <ul className="imp-ways">
          {COUCH_WAYS.map((way) => (
            <li key={way}>
              <Link to={`${PATH}?couch=1&way=${way}`} className="imp-way" style={{ '--tone': impostorWayTone(way) } as CSSProperties}>
                <span className="imp-way-art">
                  <WayArt way={way} size={64} />
                </span>
                <span className="imp-way-text">
                  <span className="imp-way-name">{t(WAY_KEY[way])}</span>
                  <span className="imp-way-note">{t(WAY_NOTE[way])}</span>
                </span>
                <span className="imp-way-go" aria-hidden="true">
                  <ChevronIcon size={18} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {categories.length > 0 ? (
        <section className="imp-shelf" aria-labelledby="imp-cats-title">
          <h2 id="imp-cats-title" className="imp-shelf-title">
            {t('games.impostor.categories')}
          </h2>
          <ul className="imp-cat-strip">
            {categories.map((c) => (
              <li key={c.slug}>
                <Link
                  to={`${PATH}?couch=1&category=${c.slug}`}
                  className={`imp-cat${c.ku.length > 9 ? ' is-long' : ''}`}
                  style={{ '--tone': impostorCategoryTone(c.slug) } as CSSProperties}
                >
                  <span className="imp-cat-art">
                    <CategoryArt category={c.slug} size={52} />
                  </span>
                  <span className="imp-cat-name" lang={script.lang}>
                    {c.ku}
                  </span>
                  <span className="imp-cat-meaning">{meaningIn(c.meanings, locale)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="imp-panel" aria-labelledby="party-how-title">
        <h2 id="party-how-title" className="imp-shelf-title">
          {t('games.party.howTitle')}
        </h2>
        <p className="imp-panel-lead">{t('games.impostor.intro')}</p>
        <ol className="party-steps">
          {STEPS.map((key, i) => (
            <li key={key} className="party-step">
              <span className="party-step-n" aria-hidden="true">
                {i + 1}
              </span>
              <span>{t(key)}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="imp-panel" id="party-friends-panel" aria-labelledby="party-friends">
        <h2 id="party-friends" className="imp-shelf-title">
          {t('games.party.withFriends')}
        </h2>
        <p className="muted">{t('games.impostor.withFriendsBlurb')}</p>
        <InviteForm target={{ kind: 'new', game: 'impostor' }} lockGame heading={false} />
      </section>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { LinkButton } from '../components/Button';
import { ArrowIcon } from '../components/icons';
import { warmApi } from '../lib/warmup';
import { usePageMeta, useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import {
  FriendsBoardMock,
  InviteMock,
  Ku,
  LeagueChipMock,
  PostMock,
  ProgressMock,
  RaceMini,
  RhymeMini,
  StoriesMini,
  WordCardMock,
  WordleMini,
} from '../landing/mocks';
import { Phone3D, PhoneShowcase, type PhoneScreen } from '../landing/Phone3D';
import { BattleScreen, LessonScreen, PathScreen, StoriesScreen } from '../landing/screens';
import { HEVAL, HOW_ARE_YOU } from '../landing/samples';
import { HOME_FAQ } from '../landing/faq';
import { FaqList } from '../components/FaqList';
import { useStoriesAvailable } from '../stories/catalogue';

/*
 * The front page, ordered by a newcomer's questions: what it is (the hero, with the app on a phone), whether it is for
 * them (heritage learners), friends, games, lessons, how it teaches, progress, community, and the FAQ. Sections show the
 * product (landing/mocks.tsx) rather than list it, headings say one concrete thing in plain words, and nothing promises
 * what is not there: no user counts, reviews or credentials, and the phone apps are said to be not yet in the stores.
 */

/**
 * Sections rise into view once as they arrive. The page arms itself (`lp-armed`, which hides unarrived sections) only
 * with an IntersectionObserver and motion allowed, so crawlers, previews and full-page screenshots always see everything.
 */
function useReveal(): React.RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root || typeof IntersectionObserver === 'undefined') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add('is-in');
          io.unobserve(e.target);
        }
      },
      { rootMargin: '0px 0px -8% 0px' },
    );
    root.querySelectorAll('.lp-reveal').forEach((el) => io.observe(el));
    root.classList.add('lp-armed');
    return () => {
      io.disconnect();
      root.classList.remove('lp-armed');
    };
  }, []);
  return ref;
}

/** A section's opening: the claim, a supporting sentence, and a question above it where one helps. */
function SectionHead({
  id,
  kicker,
  title,
  lead,
  center = false,
  children,
}: {
  id: string;
  kicker?: MessageKey;
  title: MessageKey;
  lead?: MessageKey;
  center?: boolean;
  children?: React.ReactNode;
}): React.JSX.Element {
  const t = useT();
  return (
    <header className={`lp-head lp-reveal${center ? ' lp-head--center' : ''}`}>
      {kicker && <p className="lp-kicker">{t(kicker)}</p>}
      {children}
      <h2 id={id} className="lp-h2">
        {t(title)}
      </h2>
      {lead && <p className="lp-lead">{t(lead)}</p>}
    </header>
  );
}

/** Learn a word, challenge a friend, keep each other going. */
const TOGETHER: ReadonlyArray<{ title: MessageKey; body: MessageKey; visual: React.ReactNode }> = [
  { title: 'landing.together.step1', body: 'landing.together.step1Body', visual: <WordCardMock /> },
  { title: 'landing.together.step2', body: 'landing.together.step2Body', visual: <InviteMock /> },
  { title: 'landing.together.step3', body: 'landing.together.step3Body', visual: <FriendsBoardMock /> },
];

/**
 * The four games, each linked to where it is played. Every game needs an account, so the note under the tiles says so
 * before a visitor clicks, as the Games page does.
 */
const GAMES: ReadonlyArray<{
  id: string;
  name: MessageKey;
  body: MessageKey;
  href: string;
  tags: MessageKey[];
  visual: React.ReactNode;
}> = [
  {
    id: 'wordle',
    name: 'games.wordle.name',
    body: 'landing.play.wordle',
    href: '/app/games/peyvok',
    tags: ['landing.play.tag.solo', 'landing.play.tag.friend'],
    visual: <WordleMini />,
  },
  {
    id: 'rhyme',
    name: 'games.rhyme.name',
    body: 'landing.play.rhyme',
    href: '/app/games/rhyme',
    tags: ['landing.play.tag.solo', 'landing.play.tag.friend'],
    visual: <RhymeMini />,
  },
  {
    id: 'race',
    name: 'games.race.name',
    body: 'landing.play.race',
    href: '/app/games/race',
    tags: ['landing.play.tag.solo'],
    visual: <RaceMini />,
  },
  {
    id: 'stories',
    name: 'games.stories.name',
    body: 'landing.play.stories',
    href: '/app/learn/stories',
    tags: ['landing.play.tag.read', 'landing.play.tag.solo', 'landing.play.tag.friend'],
    visual: <StoriesMini />,
  },
];

/** Whether the games section is near the screen, so the stories check is only made for visitors who scroll that far. */
function useNearScreen(ref: React.RefObject<HTMLElement | null>): boolean {
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: '400px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return near;
}

const LEARN_POINTS: MessageKey[] = [
  'landing.learn.point1',
  'landing.learn.hear',
  'landing.learn.point2',
  'landing.learn.point3',
  'landing.learn.point4',
];

/** Four principles from "How Hevalo teaches", each linking to its section there under the same title. */
const SCIENCE: ReadonlyArray<{ id: string; title: MessageKey; body: MessageKey }> = [
  { id: 'retrieval', title: 'teach.retrieval.title', body: 'landing.science.retrieval' },
  { id: 'spacing', title: 'teach.spacing.title', body: 'landing.science.spacing' },
  { id: 'feedback', title: 'teach.feedback.title', body: 'landing.science.feedback' },
  { id: 'voices', title: 'teach.voices.title', body: 'landing.science.voices' },
];

/** Learn, earn, customise, play, and round again. */
const LOOP: ReadonlyArray<{ title: MessageKey; body: MessageKey }> = [
  { title: 'landing.progress.learn', body: 'landing.progress.learnBody' },
  { title: 'landing.progress.earn', body: 'landing.progress.earnBody' },
  { title: 'landing.progress.customize', body: 'landing.progress.customizeBody' },
  { title: 'landing.progress.play', body: 'landing.progress.playBody' },
];

export function Landing(): React.JSX.Element {
  const t = useT();
  usePageMeta(t('meta.home.title'), t('app.description'));
  const revealRoot = useReveal();
  const gamesRef = useRef<HTMLElement>(null);
  const stories = useStoriesAvailable(useNearScreen(gamesRef));
  // The hero phone shows the path, a game with a friend, and the stories in turn.
  const heroScreens: PhoneScreen[] = [
    { id: 'path', label: t('learn.view.lessons'), screen: <PathScreen /> },
    { id: 'battle', label: t('nav.games'), screen: <BattleScreen /> },
    { id: 'stories', label: t('learn.view.stories'), screen: <StoriesScreen /> },
  ];
  // Warm the API early so a later sign-in does not pay the cold start.
  useEffect(() => {
    warmApi();
  }, []);

  return (
    <div className="lp" ref={revealRoot}>
      {/* ---- hero ---------------------------------------------------------- */}
      <section className="lp-hero" aria-labelledby="lp-hero-title">
        <div className="container lp-hero-grid">
          <div className="lp-hero-copy">
            {/* Two sentences, two keys, so each translates with its own word order; the second is set softer. */}
            <h1 id="lp-hero-title" className="lp-display">
              <span>{t('landing.hero.title1')}</span> <span className="lp-display-soft">{t('landing.hero.title2')}</span>
            </h1>
            <p className="lp-lead lp-hero-lead">{t('landing.hero.lead')}</p>
            <div className="lp-actions">
              <LinkButton to="/register" size="lg">
                {t('landing.hero.start')}
                <ArrowIcon className="lp-arrow" />
              </LinkButton>
              <LinkButton to="/app/games" variant="secondary" size="lg">
                {t('landing.hero.play')}
              </LinkButton>
            </div>
            <p className="lp-note">{t('landing.hero.note')}</p>
          </div>

          <div className="lp-hero-visual">
            <div className="lp-glow" aria-hidden />
            <PhoneShowcase screens={heroScreens} label={t('landing.screens.label')} />
            <LeagueChipMock />
          </div>
        </div>
      </section>

      {/* ---- is it for me: those who grew up hearing it ------------------- */}
      <section className="lp-section lp-heritage" aria-labelledby="lp-heritage">
        <div className="container container-narrow">
          <figure className="lp-phrase lp-reveal" aria-hidden>
            <Ku className="lp-phrase-ku">{HOW_ARE_YOU}</Ku>
            <figcaption>{t('landing.gloss.howAreYou')}</figcaption>
          </figure>
          <SectionHead id="lp-heritage" kicker="landing.heritage.kicker" title="landing.heritage.title" center />
          <div className="lp-prose lp-reveal">
            <p>{t('landing.heritage.body1')}</p>
            <p>{t('landing.heritage.body2')}</p>
          </div>
        </div>
      </section>

      {/* ---- together: the social loop ------------------------------------ */}
      <section className="lp-section" aria-labelledby="lp-together">
        <div className="container">
          <SectionHead id="lp-together" title="landing.together.title" lead="landing.together.lead" />
          <ol className="lp-steps">
            {TOGETHER.map((s, i) => (
              <li className="lp-step lp-reveal" key={s.title}>
                <div className="lp-step-visual">{s.visual}</div>
                <span className="lp-step-n" aria-hidden>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <h3 className="lp-h3">{t(s.title)}</h3>
                <p className="lp-body">{t(s.body)}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---- play ----------------------------------------------------------- */}
      <section id="games" className="lp-section" aria-labelledby="lp-play" ref={gamesRef}>
        <div className="container">
          <SectionHead id="lp-play" title="landing.play.title" lead="landing.play.lead" />
          <div className="game-grid">
            {GAMES.map((g) => (
              <article className={`game-tile game-tile--${g.id} lp-reveal`} key={g.id}>
                <div className="game-tile-visual">{g.visual}</div>
                <div className="game-tile-text">
                  <h3>
                    {/* The whole tile is the link; the name is its label. */}
                    <Link to={g.href} className="game-stretch">
                      {t(g.name)}
                    </Link>
                  </h3>
                  <p>{t(g.body)}</p>
                  <ul className="game-tags">
                    {g.id === 'stories' && stories === 'none' ? (
                      <li>{t('stories.comingSoon')}</li>
                    ) : (
                      g.tags.map((tag) => <li key={tag}>{t(tag)}</li>)
                    )}
                  </ul>
                </div>
              </article>
            ))}
          </div>
          <div className="lp-section-foot">
            <LinkButton to="/app/games" variant="secondary">
              {t('landing.play.cta')}
            </LinkButton>
            <p className="lp-note">{t('landing.play.guestNote')}</p>
          </div>
        </div>
      </section>

      {/* ---- learn ---------------------------------------------------------- */}
      <section id="learn" className="lp-section lp-section--split" aria-labelledby="lp-learn">
        <div className="container lp-split">
          <div className="lp-split-visual lp-reveal">
            <Phone3D pose="right">
              <LessonScreen />
            </Phone3D>
          </div>
          <div className="lp-split-copy">
            <SectionHead id="lp-learn" title="landing.learn.title" lead="landing.learn.lead">
              <p className="lp-status">{t('landing.status.app')}</p>
            </SectionHead>
            <ul className="lp-points">
              {LEARN_POINTS.map((p) => (
                <li key={p}>{t(p)}</li>
              ))}
            </ul>
            {/* Lessons need an account; the alphabet is open to everyone. */}
            <Link to="/app/alphabet" className="doc-link reach-line lp-alphabet">
              {t('alphabet.link')}
            </Link>
          </div>
        </div>
      </section>

      {/* ---- how it teaches ------------------------------------------------- */}
      <section id="how-it-teaches" className="lp-section" aria-labelledby="lp-science">
        <div className="container">
          <SectionHead id="lp-science" title="landing.science.title" lead="landing.science.lead" />
          <div className="lp-columns">
            {SCIENCE.map((p) => (
              <div className="lp-column lp-principle lp-reveal" key={p.id}>
                <h3 className="lp-h3">
                  {/* The whole card is the link; the principle is its label. */}
                  <Link to={`/how-hevalo-teaches#${p.id}`} className="lp-principle-link">
                    {t(p.title)}
                  </Link>
                </h3>
                <p className="lp-body">{t(p.body)}</p>
              </div>
            ))}
          </div>
          <div className="lp-section-foot">
            <LinkButton to="/how-hevalo-teaches" variant="secondary">
              {t('landing.science.cta')}
            </LinkButton>
          </div>
        </div>
      </section>

      {/* ---- progress ------------------------------------------------------- */}
      <section className="lp-section lp-section--split" aria-labelledby="lp-progress">
        <div className="container lp-split lp-split--reverse">
          <div className="lp-split-copy">
            <SectionHead id="lp-progress" title="landing.progress.title" lead="landing.progress.lead" />
            <ol className="lp-loop">
              {LOOP.map((s) => (
                <li key={s.title}>
                  <span className="lp-loop-title">{t(s.title)}</span>
                  <span className="lp-loop-body">{t(s.body)}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="lp-split-visual lp-reveal">
            <ProgressMock />
          </div>
        </div>
      </section>

      {/* ---- community ------------------------------------------------------ */}
      <section className="lp-section lp-section--split" aria-labelledby="lp-community">
        <div className="container lp-split">
          <div className="lp-split-visual lp-reveal">
            <PostMock />
          </div>
          <div className="lp-split-copy">
            <SectionHead id="lp-community" title="landing.community.title" lead="landing.community.lead" />
            <div className="lp-actions">
              <LinkButton to="/app" variant="secondary">
                {t('landing.community.cta')}
              </LinkButton>
            </div>
          </div>
        </div>
      </section>

      {/* ---- questions ------------------------------------------------------ */}
      <section id="faq" className="lp-section" aria-labelledby="lp-faq">
        <div className="container lp-faq-grid">
          <div>
            <SectionHead id="lp-faq" title="faq.title" lead="faq.lead" />
            <Link to="/faq" className="doc-link reach-line lp-faq-all">
              {t('faq.all')}
            </Link>
          </div>
          <div className="lp-reveal">
            <FaqList entries={HOME_FAQ} />
          </div>
        </div>
      </section>

      {/* ---- the last word -------------------------------------------------- */}
      <section className="lp-section lp-final" aria-labelledby="lp-final">
        <div className="container">
          <div className="lp-final-inner lp-reveal">
            <h2 id="lp-final" className="lp-h2">
              {t('landing.final.title')}
            </h2>
            <p className="lp-final-word" aria-hidden>
              <Ku>{HEVAL}</Ku>
              <span>{t('landing.gloss.heval')}</span>
            </p>
            <p className="lp-lead">{t('landing.final.body')}</p>
            <div className="lp-actions lp-actions--center">
              <LinkButton to="/register" size="lg">
                {t('footer.join')}
                <ArrowIcon className="lp-arrow" />
              </LinkButton>
              <LinkButton to="/login" variant="ghost" size="lg">
                {t('landing.final.login')}
              </LinkButton>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

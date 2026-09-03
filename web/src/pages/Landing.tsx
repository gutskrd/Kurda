import { useEffect } from 'react';
import { LinkButton } from '../components/Button';
import { BookIcon, FeatherIcon, GameIcon, TrophyIcon, SparkIcon, CoinIcon } from '../components/icons';
import { warmApi } from '../lib/warmup';

const FEATURES = [
  { icon: <BookIcon />, title: 'Structured lessons', body: 'A clear path through Kurdish — vocabulary, grammar and listening, one confident step at a time.' },
  { icon: <FeatherIcon />, title: 'Stories & poems', body: 'Read and listen to a living library of Kurdish literature, written and narrated by the community.' },
  { icon: <GameIcon />, title: 'Play to learn', body: 'Wordle, rhyme battles and quizzes turn practice into something you actually look forward to.' },
  { icon: <TrophyIcon />, title: 'Rankings & leagues', body: 'Climb the leaderboards and compete in seasons — friendly pressure that keeps you coming back.' },
  { icon: <SparkIcon />, title: 'Streaks & goals', body: 'Daily goals and streaks build the habit. Small, steady effort compounds into real fluency.' },
  { icon: <CoinIcon />, title: 'Earn Zêr', body: 'Collect Zêr as you learn and spend it in the shop — rewards that make progress feel tangible.' },
];

export function Landing(): React.JSX.Element {
  // warm the API early so sign-in later doesn't pay the cold-start penalty
  useEffect(() => {
    warmApi();
  }, []);
  return (
    <>
      <section className="hero">
        <div className="container hero-inner">
          <span className="eyebrow">Fêrbûna Kurdî · Learn Kurdish</span>
          <h1 className="display">
            Learn Kurdish, <br />
            beautifully.
          </h1>
          <p className="lead">
            MyKurda brings lessons, stories, poems and play into one calm, focused place — designed
            to make the Kurdish language feel close, and keep you coming back.
          </p>
          <div className="hero-actions">
            <LinkButton to="/register" size="lg">
              Start learning — free
            </LinkButton>
            <LinkButton to="/stories" variant="secondary" size="lg">
              Explore stories
            </LinkButton>
          </div>
          <p className="hero-note">No credit card. Works in your browser and on iOS &amp; Android.</p>
        </div>
      </section>

      <hr className="divider" />

      <section className="section">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">Everything in one place</span>
            <h2 className="h-section">A complete way to learn — not just flashcards.</h2>
            <p>
              The same product you’ll find on mobile, shaped for the browser: more room to read, to
              compare, to explore at your own pace.
            </p>
          </div>
          <div className="grid grid-3">
            {FEATURES.map((f) => (
              <article className="feature" key={f.title}>
                <div className="feature-icon">{f.icon}</div>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="cta">
            <span className="eyebrow">Bila em dest pê bikin</span>
            <h2 className="h-section">Ready to begin?</h2>
            <p>Create a free account and pick up where curiosity leaves off. It takes under a minute.</p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <LinkButton to="/register" size="lg">
                Create your account
              </LinkButton>
              <LinkButton to="/login" variant="secondary" size="lg">
                I already have one
              </LinkButton>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

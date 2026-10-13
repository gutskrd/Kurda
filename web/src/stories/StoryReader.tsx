import { useCallback, useEffect, useState } from 'react';
// Soranî in a face made for Arabic script (fetched only when a story page is opened)
import '@fontsource-variable/vazirmatn';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  storyTextDirection,
  type StoryDetail,
  type StoryGameMode,
  type StoryGameSummary,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { Button } from '../components/Button';
import { ErrorState, Loading } from '../components/states';
import { ArrowIcon, HeadphonesIcon } from '../components/icons';
import { describeError } from '../lib/api';
import { useT } from '../i18n/I18nProvider';
import { dialectName } from '../learn/map';
import { STORIES_HUB, createGame, gamePath, storyError } from './api';
import { rememberTextSize, rememberedExtraTime, rememberedSolo, rememberedTextSize, soloCountFor } from './prefs';
import { StoryPlayerBar, TextSizeControl } from './ReaderControls';
import { LENGTH_KEY, SetupSheet } from './SetupSheet';
import { StoryText, StoryWords } from './StoryText';
import { useStoryAudio } from './useStoryAudio';

type Load = { state: 'loading' } | { state: 'ready'; story: StoryDetail } | { state: 'gone' } | { state: 'error'; message: string };

/**
 * A story to read (/app/games/stories/:slug) — open to everyone, signed in
 * or not; the quiz after it needs an account.
 *
 * Read at your own size (remembered on this device), with the glossary's
 * words marked and listed, a Listen button on every paragraph that has been
 * recorded, and — when every sentence has been — the whole story read aloud
 * with the sentence being read marked as it goes.
 */
export function StoryReader(): React.JSX.Element {
  const { slug = '' } = useParams();
  return <ReaderPage key={slug} slug={slug} />;
}

function ReaderPage({ slug }: { slug: string }): React.JSX.Element {
  const t = useT();
  const { client } = useAuth();
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let live = true;
    setLoad({ state: 'loading' });
    void client.get<StoryDetail>(`/stories/${encodeURIComponent(slug)}`).then((res) => {
      if (!live) return;
      if (res.ok) setLoad({ state: 'ready', story: res.data });
      // unpublished — to be fixed, or taken down — looks the same as never published
      else if (res.error.status === 404) setLoad({ state: 'gone' });
      else setLoad({ state: 'error', message: describeError(res.error, t) });
    });
    return () => {
      live = false;
    };
  }, [client, slug, nonce, t]);

  return (
    <div className="container story-page">
      <Link to={STORIES_HUB} className="back-link">
        <ArrowIcon size={16} />
        {t('stories.reader.back')}
      </Link>
      {load.state === 'loading' && <Loading label={t('stories.reader.loading')} />}
      {load.state === 'gone' && <ErrorState title={t('stories.reader.goneTitle')} message={t('stories.reader.updating')} />}
      {load.state === 'error' && (
        <ErrorState message={load.message} onRetry={() => setNonce((n) => n + 1)} />
      )}
      {load.state === 'ready' && <ReadStory story={load.story} />}
    </div>
  );
}

function ReadStory({ story }: { story: StoryDetail }): React.JSX.Element {
  const t = useT();
  const [size, setSize] = useState(rememberedTextSize);
  const audio = useStoryAudio(story.paragraphs, story.audio);
  const { lang, dir } = storyTextDirection(story.dialect);

  const changeSize = useCallback((next: number) => {
    setSize(next);
    rememberTextSize(next);
  }, []);

  return (
    <article className="story-article" aria-labelledby="story-title">
      <header className="story-head">
        <p className="story-meta">
          <span>{dialectName(story.dialect)}</span>
          <span>{t('stories.level.n', { level: story.level })}</span>
          <span>{t(LENGTH_KEY[story.length])}</span>
          <span>{t('stories.minutes', { count: story.readingMinutes })}</span>
          {story.fullyNarrated && (
            <span className="story-narrated">
              <HeadphonesIcon size={14} />
              {t('stories.narrated')}
            </span>
          )}
        </p>
        <h1 id="story-title" className="story-title" lang={lang} dir={dir}>
          {story.title}
        </h1>
        {story.summary && (
          <p className="story-summary" lang={lang} dir={dir}>
            {story.summary}
          </p>
        )}
      </header>

      <div className="story-tools">
        <TextSizeControl step={size} onChange={changeSize} />
        {story.fullyNarrated && <StoryPlayerBar audio={audio} />}
      </div>

      <StoryText paragraphs={story.paragraphs} glossary={story.glossary} dialect={story.dialect} textSize={size} audio={audio} />
      <StoryWords glossary={story.glossary} dialect={story.dialect} />
      <QuizPanel story={story} />
    </article>
  );
}

/**
 * After the story: the quiz on it. "Quiz yourself" starts at once with the
 * settings this device remembers (the length's usual count, no timer, the
 * text in view, unless changed in "Quiz settings"); an unfinished quiz on the
 * same story is offered to go back to first, rather than replaced unasked.
 */
function QuizPanel({ story }: { story: StoryDetail }): React.JSX.Element {
  const t = useT();
  const { client, status } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [unfinished, setUnfinished] = useState<StoryGameSummary | null>(null);
  const [setup, setSetup] = useState<StoryGameMode | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signedIn = status === 'signedIn';

  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    void client.get<{ games: StoryGameSummary[] }>('/story-games/active').then((r) => {
      if (!live || !r.ok) return;
      setUnfinished((r.data.games ?? []).find((g) => g.mode === 'solo' && g.storyId === story.id) ?? null);
    });
    return () => {
      live = false;
    };
  }, [client, signedIn, story.id]);

  async function quizYourself(): Promise<void> {
    setBusy(true);
    setError(null);
    const solo = rememberedSolo();
    const res = await createGame(client, {
      mode: 'solo',
      storyId: story.id,
      questionCount: soloCountFor(story.length, solo.questionCount),
      timerSeconds: solo.timerSeconds,
      textDuring: solo.textDuring,
      access: 'friends',
      skipReading: true,
      extraTime: rememberedExtraTime(),
    });
    setBusy(false);
    if (res.ok) navigate(gamePath(res.data.id));
    else setError(storyError(res.error, t));
  }

  if (!signedIn) {
    return (
      <section className="story-quiz" aria-labelledby="story-quiz-title">
        <h2 id="story-quiz-title" className="story-section-title">
          {t('stories.reader.quizTitle')}
        </h2>
        <p className="muted">{t('stories.reader.signIn')}</p>
        <div className="story-quiz-actions">
          <Link to="/register" className="btn btn-primary" state={{ from: location.pathname }}>
            {t('auth.login.createAccount')}
          </Link>
          <Link to="/login" className="btn btn-secondary" state={{ from: location.pathname }}>
            {t('nav.login')}
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="story-quiz" aria-labelledby="story-quiz-title">
      <h2 id="story-quiz-title" className="story-section-title">
        {t('stories.reader.quizTitle')}
      </h2>
      {unfinished ? (
        <>
          <p className="muted">{t('stories.unfinished')}</p>
          <div className="story-quiz-actions">
            <Button size="lg" onClick={() => navigate(gamePath(unfinished.id))}>
              {t('stories.continue')}
            </Button>
            <Button size="lg" variant="secondary" disabled={busy} onClick={() => void quizYourself()}>
              {t('stories.startAgain')}
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="muted">{t('stories.reader.quizBody')}</p>
          <div className="story-quiz-actions">
            <Button size="lg" disabled={busy} onClick={() => void quizYourself()}>
              {t('stories.quizYourself')}
            </Button>
            <Button size="lg" variant="secondary" onClick={() => setSetup('duo')}>
              {t('stories.mode.duo')}
            </Button>
            <Button size="lg" variant="secondary" onClick={() => setSetup('group')}>
              {t('stories.mode.group')}
            </Button>
          </div>
          <button type="button" className="link-btn story-quiz-settings" onClick={() => setSetup('solo')}>
            {t('stories.quizSettings')}
          </button>
        </>
      )}
      {error && (
        <p className="msg msg-error" role="alert">
          {error}
        </p>
      )}
      {setup && (
        <SetupSheet
          open
          onClose={() => setSetup(null)}
          dialect={story.dialect}
          initialMode={setup}
          story={story}
          skipReading
        />
      )}
    </section>
  );
}

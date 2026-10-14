import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  storyTextDirection,
  type StoryDetail,
  type StoryGameReviewItem,
  type StoryGameStanding,
  type StoryGameView,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { CheckIcon, CloseIcon } from '../components/icons';
import { useT } from '../i18n/I18nProvider';
import { STORIES_HUB, createGame, gamePath, readerPath, storyError } from './api';
import { Evidence, playerName, type Announce } from './GameParts';
import { rememberedExtraTime, rememberedEnglish, showEnglishFor } from './prefs';

/**
 * The end of a game (contract §A1): how it went, whether it counted, and
 * every question again — the missed ones first, with the story's own words
 * for each answer.
 *
 * Standings never shame: a podium only from four players; a duo is two
 * scores and a total, without places; three players are listed by seat,
 * with your own place said to you alone. Rank never changes XP.
 *
 * `again` is "Play again" from the play layer (a pair rematch, or the host's
 * next round), so every game plays again the same way.
 */
export function GameResults({
  view,
  story,
  announce,
  again,
}: {
  view: StoryGameView;
  story: StoryDetail | null;
  announce: Announce;
  again?: React.ReactNode;
}): React.JSX.Element {
  const t = useT();
  const heading = useRef<HTMLHeadingElement>(null);
  const results = view.results;
  const me = results?.me ?? null;

  useEffect(() => {
    heading.current?.focus();
    if (me) announce(t('stories.results.score', { correct: me.correct, total: me.total }));
    // once, when the results arrive
  }, [Boolean(results)]);

  return (
    <section className="sg-results" aria-labelledby="sg-results-title">
      <h2 id="sg-results-title" ref={heading} tabIndex={-1} className="sg-results-title">
        {me ? t('stories.results.score', { correct: me.correct, total: me.total }) : t('stories.results.title')}
      </h2>

      {me && (
        <div className="sg-reward">
          {/* dir: "+15 XP" reads the same in a right-to-left page, not "XP 15+" */}
          {me.xp > 0 && (
            <span className="sg-xp" dir="ltr">
              +{me.xp} XP
            </span>
          )}
          <p className={me.learningCounted ? 'sg-counted' : 'sg-not-counted'}>
            {me.learningCounted ? (
              <>
                <CheckIcon size={16} />
                {t('stories.results.counted')}
              </>
            ) : (
              t('stories.results.notCounted')
            )}
          </p>
        </div>
      )}

      {results && view.mode !== 'solo' && <Standings view={view} standings={results.standings} />}

      <div className="sg-results-actions">
        {view.mode === 'solo' ? <TryAgain view={view} /> : again}
        <Link to={readerPath(view.settings.storySlug)} className="btn btn-secondary">
          {t('stories.results.readAgain')}
        </Link>
        <Link to={STORIES_HUB} className="btn btn-ghost">
          {t('stories.backToStories')}
        </Link>
      </div>

      {results && results.review.length > 0 && <Review view={view} items={results.review} story={story} />}
    </section>
  );
}

function Standings({ view, standings }: { view: StoryGameView; standings: StoryGameStanding[] }): React.JSX.Element | null {
  const t = useT();
  const total = view.settings.questionCount;
  if (standings.length < 2) return null;

  if (standings.length === 2) {
    // a duo: two scores and what they made together — no winner named
    const [a, b] = [...standings].sort((x, y) => Number(y.isMe) - Number(x.isMe));
    return (
      <div className="sg-standings is-duo">
        <h3 className="sr-only">{t('stories.results.standings')}</h3>
        <p className="sg-duo">
          {[a!, b!].map((s) => (
            <span key={s.seat} className="sg-duo-player">
              <Avatar url={s.avatarUrl} glyphSize={16} />
              <span>
                {playerName({ seat: s.seat, name: s.name, isMe: s.isMe }, t)} {s.correct}/{total}
              </span>
            </span>
          ))}
        </p>
        <p className="sg-together">{t('stories.results.together', { correct: a!.correct + b!.correct, total: total * 2 })}</p>
      </div>
    );
  }

  const mine = standings.find((s) => s.isMe);
  if (standings.length === 3) {
    // three: by seat, so the list says nothing the scores do not
    return (
      <div className="sg-standings">
        <h3 className="sg-panel-title">{t('stories.results.standings')}</h3>
        <ol className="sg-board" role="list">
          {[...standings].sort((x, y) => x.seat - y.seat).map((s) => (
            <BoardRow key={s.seat} s={s} total={total} />
          ))}
        </ol>
        {mine && <p className="sg-place">{t('stories.results.yourPlace', { place: mine.place })}</p>}
      </div>
    );
  }

  const podium = standings.filter((s) => s.place <= 3);
  return (
    <div className="sg-standings">
      <h3 className="sg-panel-title">{t('stories.results.standings')}</h3>
      <ol className="sg-podium" role="list">
        {podium.map((s) => (
          <li key={s.seat} className={`sg-podium-step is-${Math.min(s.place, 3)}`}>
            <span className="sg-podium-place">{s.place}</span>
            <Avatar url={s.avatarUrl} glyphSize={18} />
            <span className="sg-podium-name">{playerName({ seat: s.seat, name: s.name, isMe: s.isMe }, t)}</span>
            <span className="sg-podium-score">
              {s.correct}/{total}
            </span>
          </li>
        ))}
      </ol>
      {mine && <p className="sg-place">{t('stories.results.yourPlace', { place: mine.place })}</p>}
    </div>
  );
}

function BoardRow({ s, total }: { s: StoryGameStanding; total: number }): React.JSX.Element {
  const t = useT();
  return (
    <li className={`sg-board-row${s.isMe ? ' is-me' : ''}`}>
      <Avatar url={s.avatarUrl} glyphSize={16} />
      <span className="sg-board-name">{playerName({ seat: s.seat, name: s.name, isMe: s.isMe }, t)}</span>
      <span className="sg-board-score">
        {s.correct}/{total}
      </span>
    </li>
  );
}

/** Every question again, the missed ones first and open; the rest folded. */
function Review({ view, items, story }: { view: StoryGameView; items: StoryGameReviewItem[]; story: StoryDetail | null }): React.JSX.Element {
  const t = useT();
  const english = showEnglishFor(view.settings.level, rememberedEnglish());
  const { lang, dir } = storyTextDirection(view.settings.dialect);
  const missed = (i: StoryGameReviewItem) => i.myChoice !== i.correctIndex;
  const ordered = [...items].sort((a, b) => Number(missed(b)) - Number(missed(a)) || a.index - b.index);
  return (
    <section className="sg-review" aria-labelledby="sg-review-title">
      <h3 id="sg-review-title" className="sg-panel-title">
        {t('stories.results.review')}
      </h3>
      {ordered.map((item) => {
        const wrong = missed(item);
        return (
          <details key={item.index} className={`sg-review-item${wrong ? ' is-missed' : ''}`} open={wrong}>
            <summary>
              <span className={`sg-review-mark${wrong ? ' is-wrong' : ' is-right'}`}>
                {wrong ? <CloseIcon size={14} /> : <CheckIcon size={14} />}
                <span className="sr-only">{wrong ? t('stories.results.missed') : t('stories.game.right')}</span>
              </span>
              <span className="sg-review-n">{t('stories.status.question', { index: item.index + 1, total: items.length })}</span>
              <span className="sg-review-prompt" lang={lang} dir={dir}>
                {item.prompt}
              </span>
            </summary>
            {item.promptEn && english && (
              <p className="sg-prompt-en" lang="en" dir="ltr">
                {item.promptEn}
              </p>
            )}
            <dl className="sg-review-answers">
              {wrong && (
                <div>
                  <dt>{t('stories.game.yourAnswer')}</dt>
                  <dd lang={item.myChoice === null ? undefined : lang} dir={item.myChoice === null ? undefined : dir}>
                    {item.myChoice === null ? t('stories.game.noAnswer') : item.options[item.myChoice]}
                  </dd>
                </div>
              )}
              <div>
                <dt>{t('stories.game.rightAnswer')}</dt>
                <dd lang={lang} dir={dir}>
                  {item.options[item.correctIndex]}
                </dd>
              </div>
            </dl>
            {item.explanation && (
              <p className="sg-explain" lang={lang} dir={dir}>
                {item.explanation}
              </p>
            )}
            {item.explanationEn && english && (
              <p className="sg-explain-en" lang="en" dir="ltr">
                {item.explanationEn}
              </p>
            )}
            <Evidence story={story} paragraph={item.evidenceParagraph} sentence={item.evidenceSentence} />
          </details>
        );
      })}
    </section>
  );
}

/** A solo quiz again on the same story, with the same settings. */
function TryAgain({ view }: { view: StoryGameView }): React.JSX.Element {
  const t = useT();
  const { client } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Button
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void createGame(client, {
            mode: 'solo',
            storyId: view.settings.storyId,
            questionCount: view.settings.questionCount,
            timerSeconds: view.settings.timerSeconds,
            textDuring: view.settings.textDuring,
            access: 'friends',
            skipReading: true,
            extraTime: rememberedExtraTime(),
          }).then((res) => {
            setBusy(false);
            if (res.ok) navigate(gamePath(res.data.id));
            else setError(storyError(res.error, t));
          });
        }}
      >
        {t('stories.results.tryAgain')}
      </Button>
      {error && (
        <p className="msg msg-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

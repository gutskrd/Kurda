/**
 * What each screen looks like before it has anything to say.
 *
 * Every one of these is built from the real component's own class names, with
 * `Skeleton` boxes standing in for the words and the pictures. That is the
 * whole point, and it is not decoration: the padding, the gaps, the grid, the
 * avatar size and — through `line` — the line height all come from the same
 * stylesheet rules the finished screen uses, so the placeholder cannot be a
 * different height from the thing that replaces it.
 *
 * The first draft of this file picked heights by hand and measured 72px short
 * on a feed card, which meant every card jumped the moment it arrived. Numbers
 * chosen here are only for things that genuinely have a fixed size — an avatar,
 * a thumbnail, a button. Everything made of text takes its height from the
 * element it sits in.
 *
 * Where a screen's shape is genuinely not known in advance — restoring a
 * session, waiting for an opponent, connecting to a match — there is no
 * skeleton here and the spinner stays. A skeleton is a promise about what is
 * about to appear, and the app should not make one it cannot keep.
 *
 * Most of these take an optional `label`: the message a screen reader hears
 * while the boxes are on screen. It defaults to a plain "Loading…", but a
 * screen that has something more useful to say — "Loading the wall", "Loading
 * your saved posts" — passes its own key, so the announcement names the thing
 * being waited for rather than the fact of waiting.
 */
import { Skeleton, SkeletonRegion, SkeletonText } from './Skeleton';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';

/** Repeat a row `n` times. */
function times(n: number, render: (i: number) => React.ReactNode): React.ReactNode[] {
  return Array.from({ length: n }, (_, i) => render(i));
}

/** The avatar every list and card starts with, at whatever size its CSS says. */
function AvatarBox({ className = 'friend-avatar' }: { className?: string }): React.JSX.Element {
  return (
    <span className="avatar-wrap">
      <Skeleton className={className} circle />
    </span>
  );
}

/**
 * A feed card.
 *
 * The picture is the one thing a card may or may not have, and it is by far the
 * tallest — so guessing wrong about it moves everything below it. Only every
 * third card gets one here, which is roughly how the wall reads, and it is the
 * same three every time so a reload does not reshuffle the page.
 */
export function FeedSkeleton({
  count = 4,
  label,
}: {
  count?: number;
  label?: MessageKey;
}): React.JSX.Element {
  const t = useT();
  return (
    <SkeletonRegion label={t(label ?? 'common.loading')} className="feed">
      {times(count, (i) => (
        <article className="fcard" key={i}>
          <header className="fcard-head">
            <span className="fcard-who">
              <AvatarBox />
              <span className="fcard-who-text">
                <span className="fcard-name">
                  <Skeleton line w={110} />
                </span>
                <span className="fcard-when">
                  <Skeleton line w={64} />
                </span>
              </span>
            </span>
            <span className="fcard-kind">
              <Skeleton line w={44} />
            </span>
          </header>

          <span className="fcard-body">
            <h2 className="fcard-title">
              <Skeleton line w="72%" />
            </h2>
            {i % 3 === 1 && <Skeleton h={190} radius="var(--r-lg)" style={{ marginBottom: 12 }} />}
            <p className="fcard-text">
              <SkeletonText lines={2} lastWidth="48%" />
            </p>
          </span>

          <footer className="fcard-actions">
            {times(3, (j) => (
              <span className="fcard-act" key={j}>
                <Skeleton line w={30} />
              </span>
            ))}
          </footer>
        </article>
      ))}
    </SkeletonRegion>
  );
}

/** A list of people: friends, a blocklist, who to gift to. */
export function FriendListSkeleton({
  count = 6,
  label,
}: {
  count?: number;
  label?: MessageKey;
}): React.JSX.Element {
  const t = useT();
  return (
    <SkeletonRegion label={t(label ?? 'common.loading')}>
      {times(count, (i) => (
        <div className="friend-row" key={i}>
          <span className="friend-id">
            <AvatarBox />
            <span className="friend-name">
              <Skeleton line w={128} />
            </span>
            <span className="friend-handle">
              <Skeleton line w={86} />
            </span>
          </span>
          <Skeleton w={78} h={38} radius="var(--r-sm)" />
        </div>
      ))}
    </SkeletonRegion>
  );
}

/** The leaderboard. Rank, name, score — three columns that never vary. */
export function RankingsSkeleton({ count = 10 }: { count?: number }): React.JSX.Element {
  const t = useT();
  return (
    <SkeletonRegion label={t('common.loading')} className="post-list">
      {times(count, (i) => (
        <div className="rank-row" key={i}>
          <span className="rank-pos">
            <Skeleton line w={22} />
          </span>
          <span className="rank-name">
            <Skeleton line w="46%" />
          </span>
          <span className="rank-score">
            <Skeleton line w={70} />
          </span>
        </div>
      ))}
    </SkeletonRegion>
  );
}

/** The conversation list down the side of Messages. */
export function ConversationsSkeleton({ count = 6 }: { count?: number }): React.JSX.Element {
  const t = useT();
  return (
    <SkeletonRegion label={t('common.loading')}>
      {times(count, (i) => (
        <div className="chat-convo" key={i}>
          <AvatarBox />
          <span className="chat-convo-body">
            <span className="chat-convo-top">
              <span className="chat-convo-name">
                <Skeleton line w={104} />
              </span>
            </span>
            <span className="chat-convo-last">
              <Skeleton line w="80%" />
            </span>
          </span>
        </div>
      ))}
    </SkeletonRegion>
  );
}

/**
 * A chat thread.
 *
 * Bubbles alternate sides and vary in width, because a column of identical
 * centred bars looks like a form, not a conversation. It is the same pattern
 * every time so the thread does not appear to shuffle while it loads.
 */
export function ThreadSkeleton(): React.JSX.Element {
  const t = useT();
  const runs = [
    { mine: false, widths: ['62%', '38%'] },
    { mine: true, widths: ['48%'] },
    { mine: false, widths: ['74%'] },
    { mine: true, widths: ['56%', '30%'] },
  ];
  return (
    <SkeletonRegion label={t('common.loading')}>
      {runs.map((run, i) => (
        <div className={`chat-run${run.mine ? ' mine' : ''}`} key={i}>
          {!run.mine && <AvatarBox className="chat-run-avatar" />}
          <div className="chat-run-body">
            <span className="chat-run-author">
              <Skeleton line w={78} />
            </span>
            {run.widths.map((w, j) => (
              <div className="bubble" key={j} style={{ width: w }}>
                <Skeleton line w="100%" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </SkeletonRegion>
  );
}

/** The shop and the cosmetics shelf: a grid of tiles with a caption and a price. */
export function TileGridSkeleton({
  count = 8,
  label,
}: {
  count?: number;
  label?: MessageKey;
}): React.JSX.Element {
  const t = useT();
  return (
    <SkeletonRegion label={t(label ?? 'common.loading')} className="shop-grid">
      {times(count, (i) => (
        <figure className="shop-tile" key={i}>
          <Skeleton className="shop-thumb" />
          <figcaption className="shop-name">
            <Skeleton line w="70%" />
          </figcaption>
          <Skeleton w={96} h={30} radius="var(--r-sm)" />
        </figure>
      ))}
    </SkeletonRegion>
  );
}

/** Comments under a post. */
export function CommentsSkeleton({ count = 3 }: { count?: number }): React.JSX.Element {
  const t = useT();
  return (
    <SkeletonRegion label={t('common.loading')}>
      <ul className="comment-list">
        {times(count, (i) => (
          <li className="comment" key={i}>
            <span className="byline byline-sm">
              <AvatarBox />
              <span className="byline-name">
                <Skeleton line w={96} />
              </span>
            </span>
            <div className="comment-body">
              <SkeletonText lines={2} lastWidth="54%" />
            </div>
          </li>
        ))}
      </ul>
    </SkeletonRegion>
  );
}

/**
 * The mini profile card.
 *
 * This one matters more than most: it opens over the page you were reading, at
 * a size the modal has already committed to, so a card that changes height on
 * arrival shoves the whole overlay about.
 */
export function ProfileCardSkeleton(): React.JSX.Element {
  const t = useT();
  return (
    <SkeletonRegion label={t('profile.loading')}>
      <article className="pcard pcard-modal">
        <div className="pcard-photo-wrap">
          <Skeleton className="pcard-photo" />
        </div>
        <div className="pcard-plate">
          <div className="pcard-name-row">
            <div className="pcard-name">
              <Skeleton line w="52%" />
            </div>
          </div>
          <div className="pcard-handle">
            <Skeleton line w={92} />
          </div>
          <Skeleton h={8} radius={999} style={{ marginTop: 14 }} />
          <p className="pcard-bio">
            <SkeletonText lines={2} lastWidth="44%" />
          </p>
          <dl className="pcard-rows">
            {times(2, (i) => (
              <div className="pcard-row" key={i}>
                <dt>
                  <Skeleton line w={54} />
                </dt>
                <dd>
                  <Skeleton line w={72} />
                </dd>
              </div>
            ))}
          </dl>
          <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>
            <Skeleton h={36} radius="var(--r-sm)" />
            <Skeleton h={36} radius="var(--r-sm)" />
          </div>
        </div>
        <div className="pcard-foot">
          <span className="pcard-label">
            <Skeleton line w={130} />
          </span>
          <span className="pcard-logo">
            <Skeleton line w={94} />
          </span>
        </div>
      </article>
    </SkeletonRegion>
  );
}

/**
 * The full profile page.
 *
 * Deliberately without the artwork layer: whether somebody has a background is
 * not known until their profile arrives, and painting a dark panel that then
 * turns into a photograph is a worse flash than the plain page turning into one.
 */
export function FullProfileSkeleton({ label }: { label?: MessageKey }): React.JSX.Element {
  const t = useT();
  return (
    <SkeletonRegion label={t(label ?? 'profile.loading')} className="mkp-page">
      <div className="mkp-wrap">
        <header className="mkp-head">
          <span className="mkp-avatar">
            <Skeleton className="mkp-avatar-img" circle />
          </span>
          <div className="mkp-id-text">
            <div className="mkp-name">
              <Skeleton line w={190} />
            </div>
            <div className="mkp-sub">
              <Skeleton line w={110} />
            </div>
          </div>
          <div className="mkp-level-col">
            <div className="mkp-level-line">
              <Skeleton line w={104} />
            </div>
            <Skeleton h={64} radius="var(--r-lg)" style={{ marginTop: 12 }} />
          </div>
        </header>

        <div className="mkp-body">
          <main className="mkp-main">
            {times(2, (i) => (
              <div className="mkp-showcase-block" key={i}>
                <div className="mkp-showcase-label">
                  <Skeleton line w={92} />
                </div>
                <div className="mkp-showcase">
                  <p className="mkp-bio">
                    <SkeletonText lines={i === 0 ? 3 : 1} lastWidth="58%" />
                  </p>
                </div>
              </div>
            ))}
          </main>
          <aside className="mkp-side">
            <div className="mkp-online">
              <div className="mkp-online-title">
                <Skeleton line w={140} />
              </div>
              <div className="mkp-online-sub">
                <Skeleton line w={96} />
              </div>
              {times(3, (i) => (
                <div className="mkp-info-row" key={i}>
                  <span className="l">
                    <Skeleton line w={62} />
                  </span>
                  <span className="n">
                    <Skeleton line w={44} />
                  </span>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </div>
    </SkeletonRegion>
  );
}

/** A stack of settings cards: heading, help line, controls. */
export function CardStackSkeleton({
  count = 3,
  label,
}: {
  count?: number;
  label?: MessageKey;
}): React.JSX.Element {
  const t = useT();
  return (
    <SkeletonRegion label={t(label ?? 'common.loading')}>
      {times(count, (i) => (
        <section className="card" style={{ marginTop: i === 0 ? 0 : 20 }} key={i}>
          <h2 className="friend-heading" style={{ marginTop: 0 }}>
            <Skeleton line w={172} />
          </h2>
          <p className="muted" style={{ fontSize: '0.92rem', marginBottom: 14 }}>
            <Skeleton line w="86%" />
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Skeleton w={128} h={38} radius="var(--r-sm)" />
            <Skeleton w={104} h={38} radius="var(--r-sm)" />
          </div>
        </section>
      ))}
    </SkeletonRegion>
  );
}

/** A single library post or picture: badges, title, byline, body. */
export function PostSkeleton({ withImage = false }: { withImage?: boolean }): React.JSX.Element {
  const t = useT();
  return (
    <SkeletonRegion label={t('common.loading')}>
      <article className="post-full">
        <div className="post-meta">
          <span className="badge">
            <Skeleton line w={52} />
          </span>
          <span className="badge">
            <Skeleton line w={38} />
          </span>
        </div>
        <h1 className="page-title">
          <Skeleton line w="76%" />
        </h1>
        <div className="byline">
          <AvatarBox />
          <span className="byline-name">
            <Skeleton line w={128} />
          </span>
        </div>
        {withImage && <Skeleton h={320} radius="var(--r-lg)" style={{ marginTop: 22 }} />}
        <div style={{ marginTop: 22 }}>
          <SkeletonText lines={6} lastWidth="40%" />
        </div>
      </article>
    </SkeletonRegion>
  );
}

/** The course list on Learn: two columns of cards. */
export function CourseGridSkeleton({ count = 4 }: { count?: number }): React.JSX.Element {
  const t = useT();
  return (
    <SkeletonRegion label={t('common.loading')} className="grid grid-2">
      {times(count, (i) => (
        <article className="feature" key={i}>
          <div className="feature-icon">
            <Skeleton circle size={26} />
          </div>
          <h3>
            <Skeleton line w="58%" />
          </h3>
          <p>
            <SkeletonText lines={2} lastWidth="52%" />
          </p>
        </article>
      ))}
    </SkeletonRegion>
  );
}

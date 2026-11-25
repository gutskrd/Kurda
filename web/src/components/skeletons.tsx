/**
 * Loading placeholders for each screen, built from the real components' class names with `Skeleton` boxes for words
 * and pictures, so padding, gaps and line heights come from the same rules and nothing jumps when content arrives. Only
 * things with a fixed size (avatars, thumbnails, buttons) get numbers here. Screens whose shape is not known in advance
 * keep a spinner. `label` is the key a screen reader hears, defaulting to "Loading…".
 */
import { Fragment } from 'react';
import { PATH_GEOMETRY, openingStops } from '@kurda/shared';
import { Skeleton, SkeletonButton, SkeletonRegion, SkeletonText } from './Skeleton';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';

/** Repeats a row `n` times. */
function times(n: number, render: (i: number) => React.ReactNode): React.ReactNode[] {
  return Array.from({ length: n }, (_, i) => render(i));
}

/** The avatar a list or card starts with, sized by its CSS. */
function AvatarBox({ className = 'friend-avatar' }: { className?: string }): React.JSX.Element {
  return (
    <span className="avatar-wrap">
      <Skeleton className={className} circle />
    </span>
  );
}

/**
 * Posts on the wall. Every third has a picture, the tallest part of a post, roughly as the wall reads, and always the
 * same three so a reload does not reshuffle the page.
 */
export function FeedSkeleton({
  count = 4,
  label,
  className,
}: {
  count?: number;
  label?: MessageKey;
  /** The list's own class beside `feed`, where the real list has one (a profile's activity). */
  className?: string;
}): React.JSX.Element {
  const t = useT();
  return (
    <SkeletonRegion label={t(label ?? 'common.loading')} className={className ? `feed ${className}` : 'feed'}>
      <FeedCards count={count} />
    </SkeletonRegion>
  );
}

/** The posts alone, for a placeholder already inside a loading region (a profile's activity). */
function FeedCards({ count }: { count: number }): React.JSX.Element {
  return (
    <>
      {times(count, (i) => (
        <FeedPostBox key={i} picture={i % 3 === 1} />
      ))}
    </>
  );
}

/** One post in the wall's order (feed/FeedCard): who and when, the words, a picture on some, the pills. */
function FeedPostBox({ picture }: { picture: boolean }): React.JSX.Element {
  return (
    <article className={picture ? 'fcard fcard-image has-pics' : 'fcard'}>
      <header className="fcard-head">
        <span className="fcard-who">
          <AvatarBox />
          <span className="fcard-name">
            <Skeleton line w={96} />
          </span>
        </span>
        <span className="fcard-meta">
          <Skeleton line w={72} />
        </span>
      </header>

      <span className="fcard-body">
        <h2 className="fcard-title">
          <Skeleton line w="72%" />
        </h2>
        {!picture && (
          <p className="fcard-text">
            <SkeletonText lines={3} lastWidth="48%" />
          </p>
        )}
      </span>

      {picture && (
        <div className="fcard-media">
          <div className="fcard-pics">
            <Skeleton className="pp-grid" radius="var(--r-lg)" style={{ height: 'auto', aspectRatio: '16 / 10' }} />
          </div>
        </div>
      )}

      <footer className="fcard-actions">
        {/* Sized by feed.css, so they grow with the real pills on a touch screen. */}
        {times(2, (j) => (
          <Skeleton key={`pill-${j}`} className="fcard-act-box" />
        ))}
        {times(2, (j) => (
          <Skeleton key={`round-${j}`} className={j === 0 ? 'fcard-act-box is-round fcard-share' : 'fcard-act-box is-round'} />
        ))}
      </footer>
    </article>
  );
}

/**
 * The Friends page's people: a face, a name and a handle, then a request's Accept and Decline, or for `friends` the
 * game button and ⋯ (pages/Friends).
 */
export function FriendListSkeleton({ count = 6, friends = false, label }: { count?: number; friends?: boolean; label?: MessageKey }): React.JSX.Element {
  const t = useT();
  return (
    <SkeletonRegion label={t(label ?? 'common.loading')} className="post-list">
      {times(count, (i) => (
        <div className="friend-row" key={i}>
          <span className="friend-id">
            <AvatarBox />
            <span className="friend-name">
              <Skeleton line w={[72, 88, 64, 96, 80, 70][i % 6]} />
            </span>
            <span className="friend-handle">
              <Skeleton line w={[64, 80, 56, 72, 68, 60][i % 6]} />
            </span>
          </span>
          {friends ? (
            <>
              <Skeleton className="friend-play" size={44} circle />
              {/* The ⋯ keeps its own ring and surface, with the grey inside it. */}
              <span className="user-actions-btn">
                <Skeleton w="100%" h="100%" radius="inherit" />
              </span>
            </>
          ) : (
            <span className="friend-actions">
              <SkeletonButton size="sm" w={84} />
              <SkeletonButton size="sm" w={64} />
            </span>
          )}
        </div>
      ))}
    </SkeletonRegion>
  );
}

/** Blocked people, as Settings lists them. */
export function BlocklistSkeleton({ count = 3, label }: { count?: number; label?: MessageKey }): React.JSX.Element {
  const t = useT();
  return (
    <SkeletonRegion label={t(label ?? 'common.loading')}>
      <ul className="blocklist">
        {times(count, (i) => (
          <li className="blocklist-row" key={i}>
            <AvatarBox />
            <span className="blocklist-who">
              <span className="blocklist-name">
                <Skeleton line w={[84, 64, 96][i % 3]} />
              </span>
              <span className="blocklist-meta">
                <Skeleton line w={[148, 128, 160][i % 3]} />
              </span>
            </span>
            <SkeletonButton size="sm" w={84} />
          </li>
        ))}
      </ul>
    </SkeletonRegion>
  );
}

/** Signed-in devices, as Settings lists them; every row but the first (this device) has Sign out. */
export function DeviceListSkeleton({ count = 2, label }: { count?: number; label?: MessageKey }): React.JSX.Element {
  const t = useT();
  return (
    <SkeletonRegion label={t(label ?? 'common.loading')}>
      <ul className="device-list">
        {times(count, (i) => (
          <li className={`device-row${i === 0 ? '' : ' has-action'}`} key={i}>
            <Skeleton className="device-icon" />
            <span className="device-who">
              <span className="device-name">
                <Skeleton line w={[136, 112, 124][i % 3]} />
              </span>
              <span className="device-meta">
                <Skeleton line w={[148, 128, 112][i % 3]} />
              </span>
            </span>
            {i > 0 && <SkeletonButton size="sm" w={84} />}
          </li>
        ))}
      </ul>
    </SkeletonRegion>
  );
}

/** Friends to send something to (a gift, a post), as the picker lists them. */
export function PickFriendSkeleton({ count = 4, label }: { count?: number; label?: MessageKey }): React.JSX.Element {
  const t = useT();
  return (
    <SkeletonRegion label={t(label ?? 'common.loading')}>
      <ul className="gift-friends">
        {times(count, (i) => (
          <li key={i}>
            <span className="gift-friend">
              <AvatarBox />
              <span className="gift-friend-name">
                <Skeleton line w={[88, 64, 104, 72][i % 4]} />
              </span>
            </span>
          </li>
        ))}
      </ul>
    </SkeletonRegion>
  );
}

/** Rows of the shared list (shell.css `.list`), such as Search's people and words. */
export function ListRowsSkeleton({
  count = 5,
  avatar = false,
  label,
}: {
  count?: number;
  avatar?: boolean;
  label?: MessageKey;
}): React.JSX.Element {
  const t = useT();
  const titles = ['42%', '30%', '36%', '26%', '40%', '32%'];
  const subs = ['64%', '48%', '56%', '40%', '60%', '44%'];
  return (
    <SkeletonRegion label={t(label ?? 'common.loading')}>
      <ul className="list">
        {times(count, (i) => (
          <li className="list-row" key={i}>
            <span className="list-row-main">
              {avatar && <AvatarBox />}
              <span className="list-row-text">
                <span className="list-row-title">
                  <Skeleton line w={titles[i % titles.length]} />
                </span>
                <span className="list-row-sub">
                  <Skeleton line w={subs[i % subs.length]} />
                </span>
              </span>
              {!avatar && <span className="list-row-go" style={{ width: 16 }} />}
            </span>
          </li>
        ))}
      </ul>
    </SkeletonRegion>
  );
}

/** The leaderboard: rank, name, score. */
export function RankingsSkeleton({ count = 10 }: { count?: number }): React.JSX.Element {
  const t = useT();
  return (
    <SkeletonRegion label={t('common.loading')} className="rank-list">
      {times(count, (i) => (
        <div className="rank-row" key={i}>
          <span className="rank-pos">
            <Skeleton line w={16} />
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

/** The week's league card, in the card's own classes so it matches at every width. */
export function LeagueCardSkeleton({ rows = 30 }: { rows?: number }): React.JSX.Element {
  return (
    <div className="league-page league-now skeleton-late" aria-hidden="true">
      <div className="league-week-head">
        <h2 className="league-week-title">
          <Skeleton line w={176} />
        </h2>
        <p className="league-week-meaning">
          <Skeleton line w={60} />
        </p>
        <p className="league-week-left">
          <Skeleton line w={96} />
        </p>
      </div>
      <ol className="league-ladder">
        {times(6, (i) => (
          <li key={i} className={`league-ladder-step${i === 1 ? ' is-here' : ''}`}>
            <Skeleton circle className={i === 1 ? 'league-skel-here' : 'league-skel-step'} />
          </li>
        ))}
      </ol>
      <hr className="league-week-rule" />
      <div className="league-goal-row">
        <Skeleton circle className="league-skel-ring" />
        <div className="league-goal-text">
          {/* The status line's own grey box, empty. */}
          <p className="league-status is-plain">
            <span style={{ visibility: 'hidden' }}>{'\u00a0'}</span>
          </p>
          <p className="league-goal-group">
            <Skeleton line w={140} />
          </p>
        </div>
      </div>
      <ol className="rank-list">
        {times(rows, (i) => (
          <Fragment key={i}>
            {/* The lines under the promotion places and over the relegation ones. */}
            {(i === 5 || i === rows - 5) && (
              <li className="league-divider">
                <Skeleton line w={160} />
              </li>
            )}
            <li className="rank-row">
              <span className="rank-pos">
                <Skeleton line w={16} />
              </span>
              <span className="rank-name">
                <Skeleton line w={['40%', '32%', '46%', '28%', '38%', '34%'][i % 6]} />
              </span>
              <span className="rank-score">
                <Skeleton line w={56} />
              </span>
            </li>
          </Fragment>
        ))}
      </ol>
    </div>
  );
}

/** The conversation list down the side of Messages, enough rows to fill a tall column. */
export function ConversationsSkeleton({ count = 8 }: { count?: number }): React.JSX.Element {
  const t = useT();
  const names = [104, 72, 88, 96, 64, 110, 80, 92];
  return (
    <SkeletonRegion label={t('common.loading')} className="chat-skel-list">
      {times(count, (i) => (
        <div className="chat-convo" key={i}>
          <AvatarBox />
          <span className="chat-convo-body">
            <span className="chat-convo-top">
              <span className="chat-convo-name">
                <Skeleton line w={names[i % names.length]} />
              </span>
              <span className="chat-convo-when">
                <Skeleton line w={22} />
              </span>
            </span>
            <span className="chat-convo-bottom">
              <span className="chat-convo-last">
                <Skeleton line w={['76%', '58%', '68%', '50%'][i % 4]} />
              </span>
            </span>
          </span>
        </div>
      ))}
    </SkeletonRegion>
  );
}

/**
 * A chat thread: the day's divider, then bursts alternating sides, each bubble one line tall in grey. Always the same
 * pattern, so the thread does not seem to shuffle while it loads.
 */
export function ThreadSkeleton(): React.JSX.Element {
  const t = useT();
  const runs = [
    { mine: false, widths: [188, 132] },
    { mine: true, widths: [216] },
    { mine: false, widths: [248] },
    { mine: true, widths: [176, 104] },
    { mine: false, widths: [160] },
  ];
  return (
    <SkeletonRegion label={t('common.loading')} className="chat-skel-thread">
      <div className="chat-day">
        <span>
          <Skeleton line w={44} />
        </span>
      </div>
      {runs.map((run, i) => (
        <div className={`chat-run${run.mine ? ' mine' : ''}`} key={i}>
          {!run.mine && (
            <span className="chat-run-avatar">
              <AvatarBox />
            </span>
          )}
          <div className="chat-run-body">
            <span className="chat-run-author">
              <Skeleton line w={run.mine ? 24 : 40} />
            </span>
            {run.widths.map((w, j) => (
              <div className="bubble skeleton" aria-hidden="true" key={j} style={{ width: w, height: 'auto' }}>
                {'\u00a0'}
              </div>
            ))}
            <div className="chat-run-meta">
              <Skeleton line w={48} />
            </div>
          </div>
        </div>
      ))}
    </SkeletonRegion>
  );
}

/** The Shop below its heading; ten tiles are a screenful on a wide screen and on a phone. */
export function ShopSkeleton({ count = 10, label }: { count?: number; label?: MessageKey }): React.JSX.Element {
  const t = useT();
  return (
    <SkeletonRegion label={t(label ?? 'common.loading')}>
      <div className="item-tabs">
        {times(4, (i) => (
          <span className="item-tab" key={i}>
            <Skeleton line w={[24, 92, 44, 36][i]} />
            <Skeleton line w={18} />
          </span>
        ))}
      </div>
      <div className="item-toolbar">
        <div className="item-search">
          <div className="input item-search-input" />
        </div>
        <div className="item-sort">
          <span className="item-sort-label">
            <Skeleton line w={30} />
          </span>
          <div className="input item-sort-select" style={{ width: 120 }} />
        </div>
        <span className="item-toggles">
          {times(2, (i) => (
            <span className="item-toggle" key={i}>
              <Skeleton w={18} h={18} radius={4} />
              <Skeleton line w={i === 0 ? 112 : 36} />
            </span>
          ))}
        </span>
      </div>
      <div className="item-results">
        <p className="item-results-count">
          <Skeleton line w={64} />
        </p>
      </div>
      <div className="item-section">
        <div className="item-section-title">
          <Skeleton line w={104} />
          <span className="item-section-count">
            <Skeleton line w={16} />
          </span>
        </div>
        <div className="shop-grid">
          {times(count, (i) => (
            <figure className="shop-tile" key={i}>
              <Skeleton className="shop-thumb shop-thumb-background" style={{ height: 'auto' }} />
              <figcaption className="shop-caption">
                <span className="shop-name">
                  <Skeleton line w="64%" />
                </span>
                <span className="shop-desc">
                  <Skeleton line w="80%" />
                </span>
              </figcaption>
              <div className="shop-actions">
                <span className="shop-price">
                  <Skeleton line w={64} />
                </span>
                {/* Buy takes the room the gift button leaves, as on a real tile. */}
                <Skeleton className="skeleton-btn skeleton-btn-sm" style={{ flex: '1 1 auto', width: 'auto' }} />
                <Skeleton className="shop-gift-btn" />
              </div>
            </figure>
          ))}
        </div>
      </div>
    </SkeletonRegion>
  );
}

/** One story card: its cover, a title, a line of summary and the facts, in the card's own classes. */
function StoryCardBox({ title }: { title: string }): React.JSX.Element {
  return (
    <div className="story-card">
      <span className="story-card-link">
        <Skeleton className="story-cover story-card-cover" radius="0" />
        <span className="story-card-body">
          <span className="story-card-title">
            <Skeleton line w={title} />
          </span>
          <span className="story-card-summary">
            <Skeleton line w="86%" />
          </span>
          <span className="story-card-meta">
            <Skeleton line w={148} />
          </span>
        </span>
      </span>
    </div>
  );
}

/** Stories a search or filter found, in the results' own grid. */
export function StoryListSkeleton({ count = 6, label }: { count?: number; label?: MessageKey }): React.JSX.Element {
  const t = useT();
  const titles = ['48%', '36%', '56%', '40%', '44%', '30%', '52%', '38%'];
  return (
    <SkeletonRegion label={t(label ?? 'common.loading')}>
      <ul className="story-grid">
        {times(count, (i) => (
          <li key={i}>
            <StoryCardBox title={titles[i % titles.length]!} />
          </li>
        ))}
      </ul>
    </SkeletonRegion>
  );
}

/** The library's shelves: two rows of cards under a heading each. */
export function StoryLibrarySkeleton({ label }: { label?: MessageKey }): React.JSX.Element {
  const t = useT();
  const titles = ['48%', '36%', '56%', '40%'];
  return (
    <SkeletonRegion label={t(label ?? 'common.loading')}>
      {times(2, (row) => (
        <div className="story-shelf" key={row}>
          <h2 className="story-section-title">
            <Skeleton line w={row === 0 ? 112 : 136} />
          </h2>
          <ul className="story-shelf-row">
            {times(4, (i) => (
              <li key={i}>
                <StoryCardBox title={titles[(i + row) % titles.length]!} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </SkeletonRegion>
  );
}

/** Dictionary rows while a first search is on its way. */
export function DictRowsSkeleton({ count = 6 }: { count?: number }): React.JSX.Element {
  const t = useT();
  return (
    <SkeletonRegion label={t('common.loading')}>
      <ul className="dict-list">
        {times(count, (i) => (
          <li className="dict-row" key={i}>
            <span className="dict-row-main">
              <span className="dict-row-word">
                <Skeleton line w={[72, 96, 64, 110, 80, 88][i % 6]} />
              </span>
              <span className="dict-row-def">
                <Skeleton line w={['52%', '38%', '60%', '44%', '34%', '48%'][i % 6]} />
              </span>
            </span>
          </li>
        ))}
      </ul>
    </SkeletonRegion>
  );
}

/** One dictionary entry: the headword with its variety, the save button, and two senses. */
export function EntrySkeleton(): React.JSX.Element {
  const t = useT();
  return (
    <SkeletonRegion label={t('common.loading')}>
      <article className="dict-entry">
        <header className="dict-entry-head">
          <div>
            <h2 className="dict-headword">
              <Skeleton line w={140} />
            </h2>
            <span className="badge">
              <Skeleton line w={56} />
            </span>
          </div>
          <div className="dict-entry-actions">
            <SkeletonButton size="sm" w={88} />
          </div>
        </header>
        <ol className="dict-senses">
          {times(2, (i) => (
            <li className="dict-sense" key={i}>
              <span className="dict-pos">
                <Skeleton line w={28} />
              </span>
              <p className="dict-def">
                <Skeleton line w={i === 0 ? '64%' : '48%'} />
              </p>
            </li>
          ))}
        </ol>
      </article>
    </SkeletonRegion>
  );
}

/** Badges below the heading: the showcase's three slots, then the first family's medals; eight fill two rows on a desk. */
export function BadgesSkeleton({ count = 8 }: { count?: number }): React.JSX.Element {
  const t = useT();
  return (
    <SkeletonRegion label={t('common.loading')}>
      <div className="badges-top">
        <section className="badges-showcase">
          <div className="badges-showcase-head">
            <h2 className="badges-section-title">
              <Skeleton line w={112} />
            </h2>
            <SkeletonButton size="sm" w={92} />
          </div>
          <ol className="badges-showcase-slots">
            {times(3, (i) => (
              <li className="badges-slot" key={i} />
            ))}
          </ol>
          <p className="badges-showcase-help">
            <SkeletonText lines={2} lastWidth="40%" />
          </p>
        </section>
        <dl className="badges-stats">
          {times(3, (i) => (
            <div className="badges-stat" key={i}>
              <dt>
                <Skeleton line w={[64, 72, 88][i]} />
              </dt>
              <dd>
                <Skeleton line w={[44, 40, 56][i]} />
              </dd>
              {i === 2 && <span className="badges-stat-bar" />}
            </div>
          ))}
        </dl>
      </div>
      <section className="badges-family">
        <h2 className="badges-section-title">
          <Skeleton line w={96} />
        </h2>
        <ul className="badges-grid">
          {times(count, (i) => (
            <li key={i}>
              <div className="badge-tile">
                <span className="badge-tile-art">
                  <Skeleton size={96} circle />
                </span>
                <span className="badge-tile-name">
                  <Skeleton line w={[64, 80, 56, 72][i % 4]} />
                </span>
                <span className="badge-tile-meaning">
                  <Skeleton line w={[48, 56, 40, 52][i % 4]} />
                </span>
                <span className="badge-pips">
                  {times(4, (j) => (
                    <span className="badge-pip" key={j} />
                  ))}
                </span>
                <span className="badge-tile-progress">
                  <span className="badge-bar" />
                  <span className="badge-tile-progress-text">
                    <Skeleton line w={56} />
                  </span>
                </span>
              </div>
            </li>
          ))}
        </ul>
      </section>
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
            <div className="byline byline-sm">
              <span className="byline-who">
                <AvatarBox />
                <span className="byline-text">
                  <span className="byline-name">
                    <Skeleton line w={[88, 72, 96][i % 3]} />
                  </span>
                  <span className="byline-when">
                    <Skeleton line w={52} />
                  </span>
                </span>
              </span>
            </div>
            <div className="comment-body">
              <SkeletonText lines={i === 1 ? 2 : 1} lastWidth={i === 1 ? '54%' : '68%'} />
            </div>
            <div className="comment-actions">
              <Skeleton line w={36} />
            </div>
          </li>
        ))}
      </ul>
    </SkeletonRegion>
  );
}

/** The mini profile card, which opens over the page at a committed size, so it must not change height on arrival. */
export function ProfileCardSkeleton(): React.JSX.Element {
  const t = useT();
  return (
    <SkeletonRegion label={t('profile.loading')}>
      <article className="pc-modal">
        <div className="pc">
          <Skeleton className="pc-banner" radius={0} />
          <div className="pc-body">
            <div className="pc-id">
              <span className="pc-face">
                <Skeleton className="pc-face-img" circle />
              </span>
              <div className="pc-names">
                <div className="pc-name-row">
                  <span className="pc-name">
                    <Skeleton line w={140} />
                  </span>
                </div>
                <div className="pc-handle">
                  <Skeleton line w={92} />
                </div>
              </div>
            </div>
            <div className="pcard-level">
              <span className="pcard-level-badge">
                <Skeleton line w={56} />
              </span>
              <div className="pcard-level-track" />
              <span className="pcard-level-next">
                <Skeleton line w={104} />
              </span>
            </div>
            <p className="pc-bio">
              <SkeletonText lines={2} lastWidth="44%" />
            </p>
            <dl className="pc-stats">
              {times(2, (i) => (
                <div className="pc-stat" key={i}>
                  <dt>
                    <Skeleton line w={54} />
                  </dt>
                  <dd>
                    <Skeleton line w={72} />
                  </dd>
                </div>
              ))}
            </dl>
            {/* One full-width button: Message, Add friend or Accept. */}
            <div className="pc-actions">
              <SkeletonButton size="sm" w="100%" />
            </div>
          </div>
        </div>
        <div className="profile-actions">
          <SkeletonButton size="sm" w={136} />
        </div>
      </article>
    </SkeletonRegion>
  );
}

/** The top of a full profile in ProfileHead's own classes. Your own has more about lines and an unwritten bio. */
function ProfileHeadSkeleton({ own }: { own: boolean }): React.JSX.Element {
  return (
    <div className="ph">
      <div className="ph-banner">
        <Skeleton fill />
      </div>
      <div className="ph-top">
        <span className="ph-face">
          <Skeleton className="ph-face-img" circle />
        </span>
        <div className="ph-stats">
          <ul className="mkp-facts">
            {[44, 24, 48].map((label, i) => (
              <li key={i}>
                <span className="mkp-fact">
                  <span className="mkp-fact-label">
                    <Skeleton line w={label} />
                  </span>
                  <span className="mkp-fact-value">
                    <Skeleton line w={[20, 40, 16][i]} />
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="ph-names">
        <div className="ph-name-row">
          <span className="ph-name">
            <Skeleton line w={own ? 96 : 180} />
          </span>
          <Skeleton className="ph-level" circle />
        </div>
        <div className="ph-handle">
          <Skeleton line w={64} />
          {/* the badge row beside the handle: a pill of a few small pictures, as most profiles show */}
          <Skeleton w={96} h={36} radius="var(--r-pill)" />
        </div>
      </div>
      <ul className="mkp-about">
        <li className="mkp-country">
          <Skeleton line w={own ? 96 : 112} />
        </li>
        {own && (
          <>
            <li>
              <Skeleton line w={104} />
            </li>
            <li>
              <Skeleton line w={240} />
            </li>
          </>
        )}
      </ul>
      {own ? (
        <span className="mkp-bio-add">
          <Skeleton line w={212} />
        </span>
      ) : (
        <p className="mkp-bio">
          <SkeletonText lines={2} lastWidth="58%" />
        </p>
      )}
      {own ? (
        <span className="mkp-yours-row">
          <span className="mkp-yours-row-text">
            <span className="mkp-yours-title">
              <Skeleton line w={104} />
            </span>
            <span className="mkp-yours-note">
              <Skeleton line w={136} />
            </span>
          </span>
        </span>
      ) : (
        <span className="mkp-friends-line">
          <span className="mkp-friends-faces">
            <Skeleton circle />
          </span>
          <span className="mkp-friends-said">
            <span className="mkp-friends-count">
              <Skeleton line w={72} />
            </span>
            <span className="mkp-friends-names">
              <Skeleton line w={48} />
            </span>
          </span>
        </span>
      )}
      <div className="ph-actions">
        <div className="pc-acts">
          <SkeletonButton size="sm" w="100%" />
          <SkeletonButton size="sm" w="100%" />
        </div>
      </div>
    </div>
  );
}

/** Two rows of a profile tab's grid (ProfileActivity): post tiles, or game covers with their captions. */
export function ProfileGridSkeleton({ games = false }: { games?: boolean }): React.JSX.Element {
  return (
    <div className="pg-grid skeleton-late" aria-hidden="true">
      {times(6, (i) =>
        games ? (
          <span key={i} className="pg-tile is-game">
            <Skeleton className="gp-art" />
            <span className="pg-tile-foot is-game">
              <span className="pg-tile-game">
                <Skeleton line w={['72%', '56%', '64%'][i % 3]} />
              </span>
              <span>
                <Skeleton line w="40%" />
              </span>
            </span>
          </span>
        ) : (
          <span key={i} className="pg-tile">
            <Skeleton fill />
          </span>
        ),
      )}
    </div>
  );
}

/** The full profile page (FullProfile): the head, the highlights, and the tabs over the first rows of the grid. */
export function FullProfileSkeleton({ label, own = false }: { label?: MessageKey; own?: boolean }): React.JSX.Element {
  const t = useT();
  return (
    <SkeletonRegion label={t(label ?? 'profile.loading')} className="mkp-page">
      <div className="mkp-wrap">
        <ProfileHeadSkeleton own={own} />
        <div className="pg">
          <div className="pg-tabs" style={{ '--n': 5, '--at': 0 } as React.CSSProperties}>
            {times(5, (i) => (
              <span className="pg-tab" key={i}>
                <Skeleton w={24} h={24} radius="var(--r-sm)" />
              </span>
            ))}
            <span className="pg-ink" />
          </div>
          <ProfileGridSkeleton />
        </div>
      </div>
    </SkeletonRegion>
  );
}

/** Editing your profile (pages/ProfileEdit) while it loads: the picture card, then the details form and its Save. */
export function ProfileEditSkeleton({ label }: { label: MessageKey }): React.JSX.Element {
  const t = useT();
  // A field's box at its own height and corner (ui.css `.input`); the bio's is taller, as the form sets it.
  const field = (labelWidth: number, hint: string, box = 46) => (
    <div className="field">
      <span className="field-label">
        <Skeleton line w={labelWidth} />
      </span>
      <Skeleton className="input" h={box} radius="var(--r-md)" />
      <span className="field-hint">
        <Skeleton line w={hint} />
      </span>
    </div>
  );
  return (
    <SkeletonRegion label={t(label)}>
      <section className="card">
        <h2 className="friend-heading" style={{ marginTop: 0 }}>
          <Skeleton line w={124} />
        </h2>
        <div className="edit-photo-row">
          <span className="hero-avatar-wrap">
            <Skeleton className="pcard-avatar" circle />
          </span>
          <div className="edit-photo-actions">
            <SkeletonButton size="sm" w={132} />
          </div>
        </div>
      </section>
      <section className="card" style={{ marginTop: 24 }}>
        <h2 className="friend-heading" style={{ marginTop: 0 }}>
          <Skeleton line w={72} />
        </h2>
        {field(96, '82%')}
        {field(32, '64%', 96)}
        {field(56, '76%')}
        <SkeletonButton w={148} />
      </section>
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
          <p className="muted" style={{ fontSize: 'var(--text)', marginBottom: 14 }}>
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

/** A post's byline as PostAuthor draws it. */
function BylineBox(): React.JSX.Element {
  return (
    <div className="byline byline-md">
      <span className="byline-who">
        <AvatarBox />
        <span className="byline-text">
          <span className="byline-name">
            <Skeleton line w={96} />
          </span>
          <span className="byline-when">
            <Skeleton line w={60} />
          </span>
        </span>
      </span>
    </div>
  );
}

/** A single post's page: the way back, the post's card (a written post, or a picture as the wall's FeedCard), and the comments' heading. */
export function PostSkeleton({ withImage = false }: { withImage?: boolean }): React.JSX.Element {
  const t = useT();
  return (
    <SkeletonRegion label={t('common.loading')}>
      <span className="back-link">
        <Skeleton line w={104} />
      </span>
      {withImage ? (
        <FeedPostBox picture />
      ) : (
        <article className="post-full">
          <div className="post-meta">
            <span className="badge">
              <Skeleton line w={44} />
            </span>
            <Skeleton line w={56} />
          </div>
          <h1 className="page-title">
            <Skeleton line w="64%" />
          </h1>
          <BylineBox />
          <div className="post-body">
            <SkeletonText lines={6} lastWidth="40%" />
          </div>
        </article>
      )}
      <section className="comments">
        <h2 className="section-heading">
          <Skeleton line w={112} />
        </h2>
      </section>
    </SkeletonRegion>
  );
}

/** The letters window (letters/LettersPage) while it loads: the window's own square, then the lines that stand under it. */
export function LettersHeroSkeleton(): React.JSX.Element {
  const t = useT();
  return (
    <SkeletonRegion label={t('common.loading')} className="letters-hero">
      <div className="letters-window">
        <Skeleton className="lw" h="auto" />
      </div>
      <div className="letters-hero-text">
        <p className="letters-status">
          <Skeleton line w={136} />
        </p>
        <p className="letters-status letters-status--quiet">
          <SkeletonText lines={2} lastWidth="56%" />
        </p>
      </div>
    </SkeletonRegion>
  );
}

/** Hevalo's book card (learn/BookCard) while the server says whether there is a book: the face, its lines, the icon. */
export function BookCardSkeleton(): React.JSX.Element {
  return (
    <span className="tree-card book-card skeleton-late" aria-hidden="true">
      <Skeleton className="tree-card-art book-card-art" size={48} circle />
      <span className="tree-card-text">
        <span className="tree-card-title">
          <Skeleton line w={112} />
        </span>
        <span className="tree-card-sub">
          <SkeletonText lines={2} lastWidth="54%" />
        </span>
      </span>
      <Skeleton className="tree-card-go" size={20} radius="var(--r-sm)" />
    </span>
  );
}

/** Your stories progress (StoriesLibrary's ProgressCard): its heading, the ring with its count, and the score tile. */
export function StoryProgressSkeleton(): React.JSX.Element {
  return (
    <section className="story-progress-card skeleton-late" aria-hidden="true">
      <h2 className="story-section-title">
        <Skeleton line w={96} />
      </h2>
      <div className="story-progress-row">
        <p className="story-progress-ring-wrap">
          <Skeleton w={64} h={64} circle />
          <span className="story-progress-text">
            <Skeleton line w={56} />
            <Skeleton line w={96} />
          </span>
        </p>
        <p className="story-progress-tile">
          <Skeleton line w={20} />
          <Skeleton line w={84} />
        </p>
      </div>
    </section>
  );
}

/** The riddles or the proverbs (lore/RiddlesList, lore/ProverbsList) in their own classes, the day's one first. */
export function LoreListSkeleton({ kind, label }: { kind: 'riddles' | 'proverbs'; label: MessageKey }): React.JSX.Element {
  const t = useT();
  const riddles = kind === 'riddles';
  return (
    <SkeletonRegion label={t(label)}>
      <section className="lore-daily">
        <p className="lore-eyebrow">
          <Skeleton line w={112} />
        </p>
        <p className="lore-daily-text lore-display">
          <SkeletonText lines={riddles ? 3 : 2} lastWidth={riddles ? '40%' : '56%'} />
        </p>
        {riddles ? (
          <p className="story-meta lore-meta">
            <Skeleton line w={96} />
          </p>
        ) : (
          <p className="lore-daily-meaning">
            <SkeletonText lines={2} lastWidth="64%" />
          </p>
        )}
        <p className="lore-daily-go">
          <SkeletonButton />
        </p>
      </section>
      {riddles && (
        <p className="lore-solved-count">
          <span className="lore-solved-text">
            <Skeleton line w={84} />
          </span>
          <span className="lore-solved-bar" />
        </p>
      )}
      <section className="lore-section">
        <h2 className="story-section-title">
          <Skeleton line w={96} />
        </h2>
        <div className="lore-filter">
          {/* Each chip's words with its padding. */}
          {[76, 84, 100, 80].map((w, i) => (
            <Skeleton key={i} className="story-chip" w={w} />
          ))}
        </div>
        <ol className="lore-list">
          {times(4, (i) => (
            <li key={i}>
              <span className="lore-row">
                <span className="lore-row-text">
                  <span className="lore-row-question lore-display">
                    <SkeletonText lines={2} lastWidth={['48%', '70%', '36%', '58%'][i]} />
                  </span>
                  <span className="story-meta lore-meta">
                    <Skeleton line w={riddles ? 92 : 76} />
                  </span>
                </span>
              </span>
            </li>
          ))}
        </ol>
      </section>
    </SkeletonRegion>
  );
}

/** The unit rail beside the road on a wide screen (PathWorld's UnitRail): the section's name, then a few units. */
function UnitRailSkeleton(): React.JSX.Element {
  return (
    <div className="lp-rail">
      <div className="lp-rail-section">
        <p className="lp-rail-section-name">
          <Skeleton line w={96} />
        </p>
        <ol>
          {[64, 88, 72, 96, 80].map((w, i) => (
            <li key={i} className="lp-rail-unit">
              <span className="lp-rail-row">
                <span className="lp-rail-dot">
                  <Skeleton w="100%" h="100%" radius="inherit" />
                </span>
                <span className="lp-rail-words">
                  <span className="lp-rail-number">
                    <Skeleton line w={48} />
                  </span>
                  <span className="lp-rail-title">
                    <Skeleton line w={w} />
                  </span>
                </span>
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

/**
 * The road while it loads (CoursePath), as a new learner's road opens: the chapter banner and the first stops where the
 * shared layout puts them, so the course drops into place. A course's own page adds its heading and Continue.
 */
export function CourseMapSkeleton({ header = false }: { header?: boolean }): React.JSX.Element {
  const t = useT();
  const { stops, height } = openingStops(5);
  const { node } = PATH_GEOMETRY;
  return (
    <SkeletonRegion label={t('common.loading')} className="lp">
      {header && (
        <div className="page-header lp-head">
          <span className="back-link">
            <Skeleton line w={112} />
          </span>
          <h1 className="page-title">
            <Skeleton line w="62%" />
          </h1>
          <p className="page-sub">
            <Skeleton line w={150} />
          </p>
          <SkeletonButton w={128} className="lp-continue" />
        </div>
      )}
      <div className="lp-world">
        <UnitRailSkeleton />
        <div className="lp-map">
          <div className="lp-open-section">
            <div className="lp-pin">
              <div className="lp-pin-words">
                <p className="lp-pin-eyebrow">
                  <Skeleton line w={148} />
                </p>
                <p className="lp-pin-title">
                  <Skeleton line w="44%" />
                </p>
              </div>
              <div className="lp-pin-actions">
                <Skeleton className="lp-pin-button" circle />
                {/* The map's button, which a wide screen hides for the rail beside the road. */}
                <span className="lp-pin-button lp-unit-rail">
                  <Skeleton w="100%" h="100%" radius="inherit" />
                </span>
              </div>
            </div>
            <section className="lp-unit">
              <ol className="lp-path is-first" style={{ height }}>
                {stops.map(({ x, y }, i) => (
                  <li key={i} className="lp-stop" style={{ top: y - node / 2, '--x': `${x}px` } as React.CSSProperties}>
                    {/* The stop's own box is see-through, so the grey goes inside it. */}
                    <span className="lp-node">
                      <Skeleton fill />
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        </div>
      </div>
    </SkeletonRegion>
  );
}

/** The bell's list, in the rows' own classes; every third row has a second line, as gifts and badges do. */
export function NotificationsSkeleton({ count = 6 }: { count?: number }): React.JSX.Element {
  const t = useT();
  const widths = ['86%', '70%', '78%', '64%', '82%', '58%'];
  return (
    <SkeletonRegion label={t('common.loading')} className="note-groups">
      <div className="note-group">
        <div className="note-group-title">
          <Skeleton line w={56} />
        </div>
        <div className="note-list">
          {times(count, (i) => (
            <div className="note-row" key={i}>
              <span className="note-face">
                <Skeleton className="note-avatar" circle />
              </span>
              <div className="note-main">
                <p className="note-text">
                  <Skeleton line w={widths[i % widths.length]} />
                </p>
                {i % 3 === 1 && (
                  <p className="note-body">
                    <Skeleton line w="52%" />
                  </p>
                )}
                <p className="note-meta">
                  <Skeleton line w={48} />
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </SkeletonRegion>
  );
}

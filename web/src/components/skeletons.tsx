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
import { Fragment } from 'react';
import { Skeleton, SkeletonRegion, SkeletonText } from './Skeleton';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';

/** Repeat a row `n` times. */
function times(n: number, render: (i: number) => React.ReactNode): React.ReactNode[] {
  return Array.from({ length: n }, (_, i) => render(i));
}

/** A button's place: a pill at the height that size of button has on this screen (ui.css). */
function ButtonBox({ w, size = 'md' }: { w: number | string; size?: 'sm' | 'md' | 'lg' }): React.JSX.Element {
  return <Skeleton w={w} className={`skeleton-btn${size === 'md' ? '' : ` skeleton-btn-${size}`}`} />;
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
 * same three every time so a reload does not reshuffle the page. A picture card
 * is laid out the way the wall lays one out: its caption, then the picture in
 * the card's own picture block, at the shape a picture without known sides is
 * given (PostPictures).
 */
export function FeedSkeleton({
  count = 4,
  label,
  className,
}: {
  count?: number;
  label?: MessageKey;
  /** the list's own class beside `feed`, where the real list has one (a profile's activity) */
  className?: string;
}): React.JSX.Element {
  const t = useT();
  return (
    <SkeletonRegion label={t(label ?? 'common.loading')} className={className ? `feed ${className}` : 'feed'}>
      <FeedCards count={count} />
    </SkeletonRegion>
  );
}

/** The cards themselves, for a placeholder that is already inside a loading region (a profile's activity). */
function FeedCards({ count }: { count: number }): React.JSX.Element {
  return (
    <>
      {times(count, (i) => {
        const picture = i % 3 === 1;
        return (
        <article className={picture ? 'fcard fcard-image' : 'fcard'} key={i}>
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

          {picture ? (
            <>
              <span className="fcard-body">
                <p className="fcard-text">
                  <Skeleton line w="56%" />
                </p>
              </span>
              <div className="fcard-pics">
                <Skeleton className="pp-grid" radius="var(--r-lg)" style={{ height: 'auto', aspectRatio: '16 / 10' }} />
              </div>
            </>
          ) : (
            <span className="fcard-body">
              <h2 className="fcard-title">
                <Skeleton line w="72%" />
              </h2>
              <p className="fcard-text">
                <SkeletonText lines={3} lastWidth="48%" />
              </p>
            </span>
          )}

          <footer className="fcard-actions">
            {times(3, (j) => (
              <span className="fcard-act" key={j}>
                <Skeleton line w={30} />
              </span>
            ))}
          </footer>
        </article>
        );
      })}
    </>
  );
}

/**
 * The Friends page's people: a face, a name and a handle, and the row's
 * buttons at its end (or under the name on a phone), in the list's spacing.
 */
export function FriendListSkeleton({
  count = 6,
  actions = 1,
  label,
}: {
  count?: number;
  /** how many buttons each row carries, as the page's own rows do */
  actions?: number;
  label?: MessageKey;
}): React.JSX.Element {
  const t = useT();
  const widths = [44, 84, 64];
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
          <span className="friend-actions">
            {times(actions, (j) => (
              <ButtonBox key={j} size="sm" w={widths[(j + (3 - actions)) % 3]!} />
            ))}
          </span>
        </div>
      ))}
    </SkeletonRegion>
  );
}

/** People you have blocked, as Settings lists them: a face, a name, the handle and date, and Unblock. */
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
            <ButtonBox size="sm" w={84} />
          </li>
        ))}
      </ul>
    </SkeletonRegion>
  );
}

/** Friends to send something to (a gift, a post): a face and a name per row, as the picker lists them. */
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

/**
 * Rows of the shared list (shell.css `.list`): Search's people and words, and
 * anything else drawn as a list of rows. A face where the rows have one, a
 * name and the line under it, and the chevron's room where the rows lead on.
 */
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

/** The leaderboard. Rank, name, score — three columns that never vary. */
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

/**
 * The week's league card while it is on its way: the emblem, the league's
 * name, what it means and when the week closes, the goal ring, the line about
 * the goal, and the first places of the table — the card's own classes, so it
 * is the card's size at every width (the emblem and ring shrink on a phone).
 */
export function LeagueCardSkeleton({ rows = 30 }: { rows?: number }): React.JSX.Element {
  return (
    <div className="league-card skeleton-late" aria-hidden="true">
      <div className="league-head">
        <Skeleton circle className="league-skel-emblem" />
        <div className="league-head-text">
          <h2 className="league-card-title">
            <Skeleton line w={136} />
          </h2>
          <p className="league-head-meaning">
            <Skeleton line w={60} />
          </p>
          <p className="league-head-meta">
            <Skeleton line w={176} />
          </p>
        </div>
        <Skeleton circle className="league-skel-ring" />
      </div>
      {/* the status line's own grey box, empty */}
      <p className="league-status is-plain">
        <span style={{ visibility: 'hidden' }}>{'\u00a0'}</span>
      </p>
      <ol className="rank-list">
        {times(rows, (i) => (
          <Fragment key={i}>
            {/* the line under the places that move up, and over the ones that move down */}
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

/**
 * The conversation list down the side of Messages: each row a face, a name
 * with its time at the end, and the last line said — spaced as the list
 * spaces them, and enough of them to fill a tall window's column.
 */
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
 * A chat thread.
 *
 * The day's divider, then bursts that alternate sides: a face and a name over
 * the other person's, the bubbles at the widths short messages are, and the
 * burst's time under it — spaced as the thread spaces them. Each bubble is the
 * bubble itself in grey, one line tall, so it is exactly as high as a one-line
 * message. It is the same pattern every time, so the thread does not appear
 * to shuffle while it loads.
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

/**
 * The Shop below its heading, as the catalogue lays itself out: the kinds as
 * tabs, the search, sort and filters, the count, the first kind's label, and
 * its tiles — each a picture at a background's shape, a name and a line under
 * it, the price, and Buy beside the gift button. Ten tiles: two rows on a wide
 * screen, five on a phone's two columns, which is a screenful either way.
 */
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
                {/* Buy takes the room the gift button leaves, as it does on a real tile */}
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

/**
 * The stories to read: cards in the list's own grid (one column on a phone,
 * two from a tablet up), each a title, a line of what it is about and its
 * level, length and minutes. Eight — four rows of two on a wide screen.
 */
export function StoryListSkeleton({ count = 8, label }: { count?: number; label?: MessageKey }): React.JSX.Element {
  const t = useT();
  const titles = ['48%', '36%', '56%', '40%', '44%', '30%', '52%', '38%'];
  return (
    <SkeletonRegion label={t(label ?? 'common.loading')}>
      <ul className="story-list">
        {times(count, (i) => (
          <li key={i}>
            <div className="story-card">
              <span className="story-card-head">
                <span className="story-card-title">
                  <Skeleton line w={titles[i % titles.length]} />
                </span>
              </span>
              <span className="story-card-summary">
                <Skeleton line w="86%" />
                {/* a narrow card (a phone, or two to a row on a tablet) wraps the line */}
                <Skeleton line w="36%" className="story-skel-wrap" />
              </span>
              <span className="story-card-meta">
                <Skeleton line w={168} />
              </span>
            </div>
          </li>
        ))}
      </ul>
    </SkeletonRegion>
  );
}

/** The dictionary's rows while a first search is on its way: a word and the line that says what it means. */
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

/** One dictionary entry on its way: the headword with its variety, the save button, and two senses. */
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
            <ButtonBox size="sm" w={88} />
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

/**
 * Badges below the page's heading: the showcase's three slots beside the
 * numbers, then the first family's medals in their grid — each a medal, its
 * name and what it means. Eight medals: two rows on a desk, four on a phone.
 */
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
            <ButtonBox size="sm" w={92} />
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

/** A profile's activity as a list (games played, things liked): a glyph, what it was, and when. */
export function ActivityRowsSkeleton({ count = 4 }: { count?: number }): React.JSX.Element {
  const t = useT();
  return (
    <SkeletonRegion label={t('common.loading')}>
      <ul className="mkp-activity-list">
        {times(count, (i) => (
          <li key={i}>
            <div className="mkp-activity-row">
              <Skeleton className="mkp-activity-glyph" />
              <span className="mkp-activity-meta">
                <span className="mkp-activity-title">
                  <Skeleton line w={['54%', '42%', '60%', '36%'][i % 4]} />
                </span>
              </span>
              <span className="mkp-activity-when">
                <Skeleton line w={36} />
              </span>
            </div>
          </li>
        ))}
      </ul>
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
            {/* one full-width button: Message, Add friend or Accept, as the card has it */}
            <div className="pc-actions">
              <ButtonBox size="sm" w="100%" />
            </div>
          </div>
        </div>
        <div className="profile-actions">
          <ButtonBox size="sm" w={136} />
        </div>
      </article>
    </SkeletonRegion>
  );
}

/**
 * The full profile page, as FullProfile lays it out: on your own, your name
 * and the menu above the card; the wide card with its banner, face, name and
 * handle, the buttons beside them and the level bar; then About, the second
 * showcase (your badges, or their friends) and the activity with its tabs,
 * beside the column of numbers.
 *
 * The banner is a plain shimmer: whether somebody has a background is not known
 * until their profile arrives, and the card's own default banner is what shows
 * when they do not.
 */
export function FullProfileSkeleton({ label, own = false }: { label?: MessageKey; own?: boolean }): React.JSX.Element {
  const t = useT();
  // your own column says more about you than anybody else's does
  const rows = own ? [44, 28, 52, 92, 80, 64] : [44, 28, 52];
  return (
    <SkeletonRegion label={t(label ?? 'profile.loading')} className="mkp-page">
      <div className="mkp-wrap">
        {own && (
          <div className="profile-head">
            <span className="profile-head-name">
              <Skeleton line w={128} />
            </span>
            <Skeleton size={44} circle />
          </div>
        )}
        <div className="pc pc--wide">
          <Skeleton className="pc-banner" radius={0} />
          <div className="pc-body">
            <div className="pc-id">
              <span className="pc-face">
                <Skeleton className="pc-face-img" circle />
              </span>
              <div className="pc-names">
                <div className="pc-name-row">
                  <span className="pc-name">
                    <Skeleton line w={150} />
                  </span>
                </div>
                <div className="pc-handle">
                  <Skeleton line w={84} />
                </div>
                {own && (
                  <>
                    <div className="pc-online">
                      <Skeleton line w={56} />
                    </div>
                    <div className="mkp-country">
                      <Skeleton line w={88} />
                    </div>
                  </>
                )}
              </div>
              <div className="pc-aside">
                <div className={own ? 'profile-actions-row' : 'mkp-actions'}>
                  <ButtonBox size="sm" w={own ? 104 : 92} />
                  <ButtonBox size="sm" w={own ? 116 : 72} />
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
          </div>
        </div>

        <div className="mkp-body">
          <div className="mkp-main">
            <div className="mkp-showcase-block">
              <div className="mkp-showcase-label">
                <Skeleton line w={48} />
              </div>
              <div className="mkp-showcase">
                <p className="mkp-bio">
                  <Skeleton line w="46%" />
                </p>
              </div>
            </div>
            {own ? (
              <div className="mkp-showcase-block">
                <div className="mkp-showcase-label">
                  <Skeleton line w={56} />
                </div>
                <div className="mkp-showcase">
                  <p className="mkp-bio">
                    <Skeleton line w="38%" />
                  </p>
                </div>
              </div>
            ) : (
              <div className="mkp-friends">
                <div className="friend-heading">
                  <Skeleton line w={72} />
                </div>
                <div className="mkp-friends-list">
                  {times(2, (i) => (
                    <Skeleton key={i} w={i === 0 ? 92 : 80} h={40} radius="var(--r-pill)" />
                  ))}
                </div>
              </div>
            )}
            <div className="mkp-showcase-block">
              <div className="mkp-showcase-label">
                <Skeleton line w={60} />
              </div>
              <div className="mkp-showcase mkp-activity">
                <div className="mkp-tabs">
                  {times(4, (i) => (
                    <span className="mkp-tab" key={i}>
                      <Skeleton line w={[44, 40, 36, 52][i]} />
                    </span>
                  ))}
                </div>
                {/* the first tab is their posts, as cards: two of them, as the tab itself loads */}
                <div className="feed mkp-activity-feed">
                  <FeedCards count={2} />
                </div>
              </div>
            </div>
          </div>
          <aside className="mkp-side">
            <div className="mkp-online">
              <div className="mkp-online-title">
                <Skeleton line w={128} />
              </div>
              <div className="mkp-online-sub">
                <Skeleton line w={72} />
              </div>
              {rows.map((w, i) => (
                <div className="mkp-info-row" key={i}>
                  <span className="l">
                    <Skeleton line w={w} />
                  </span>
                  <span className="n">
                    <Skeleton line w={28} />
                  </span>
                </div>
              ))}
              {own && (
                <>
                  <p className="field-hint" style={{ margin: '4px 0 0' }}>
                    <Skeleton line w="80%" />
                  </p>
                  {times(2, (i) => (
                    <div className="mkp-collection" key={i}>
                      <div className="mkp-collection-head">
                        <span className="l">
                          <Skeleton line w={56} />
                        </span>
                        <span className="n">
                          <Skeleton line w={16} />
                        </span>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </aside>
        </div>
      </div>
    </SkeletonRegion>
  );
}

/**
 * Settings cards still on their way, as the page draws them: a heading, a line
 * of help, a row of choices and the hint under them. Settings shows the cards
 * that need nothing from the server (language, appearance) at once; these
 * stand in for the ones that do.
 */
export function SettingsCardsSkeleton({ count = 3, label }: { count?: number; label?: MessageKey }): React.JSX.Element {
  const t = useT();
  return (
    <SkeletonRegion label={t(label ?? 'common.loading')}>
      {times(count, (i) => (
        <section className="card" style={{ marginTop: 20 }} key={i}>
          <h2 className="friend-heading" style={{ marginTop: 0 }}>
            <Skeleton line w={[150, 120, 170][i % 3]} />
          </h2>
          <p className="muted" style={{ fontSize: '0.92rem', marginBottom: 14 }}>
            <Skeleton line w={['72%', '58%', '66%'][i % 3]} />
          </p>
          <div className="toolbar" style={{ marginBottom: 8 }}>
            {times(3, (j) => (
              <Skeleton key={j} className="chip" w={[136, 104, 88][j]} />
            ))}
          </div>
          <p className="field-hint" style={{ marginBottom: 0 }}>
            <Skeleton line w="52%" />
          </p>
        </section>
      ))}
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

/** A post's byline: a face, a name and when, as PostAuthor draws one. */
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

/**
 * A single post's page: the way back, then a written post's card — its kind
 * and reads, title, byline and body — or a picture's — its kind, the picture,
 * byline, caption and the reactions' row — and the comments' heading under it.
 * The picture is held at four by three, the shape the page also gives it until
 * the real one has loaded (DimenPost), so the two agree.
 */
export function PostSkeleton({ withImage = false }: { withImage?: boolean }): React.JSX.Element {
  const t = useT();
  return (
    <SkeletonRegion label={t('common.loading')}>
      <span className="back-link">
        <Skeleton line w={104} />
      </span>
      {withImage ? (
        <article className="dimen-full">
          <div className="post-meta">
            <span className="badge">
              <Skeleton line w={40} />
            </span>
            <Skeleton line w={56} />
          </div>
          <Skeleton className="dimen-full-img" style={{ height: 'auto', aspectRatio: '4 / 3' }} />
          <BylineBox />
          <p className="dimen-caption">
            <Skeleton line w="58%" />
          </p>
          <div className="reactions" />
        </article>
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

/** The course list on Learn: a card per course, with its progress and its two ways in. */
export function CourseGridSkeleton({ count = 2 }: { count?: number }): React.JSX.Element {
  const t = useT();
  return (
    <SkeletonRegion label={t('common.loading')} className="learn-courses">
      {times(count, (i) => (
        <article className="course-card" key={i}>
          <span className="lp-chip">
            <Skeleton line w={56} />
          </span>
          <h2 className="course-card-title">
            <Skeleton line w="58%" />
          </h2>
          <div className="course-progress">
            <div className="course-progress-bar" />
            <span className="course-progress-text">
              <Skeleton line w={96} />
            </span>
          </div>
          <p className="course-next">
            <Skeleton line w="52%" />
          </p>
          <div className="course-card-actions">
            <ButtonBox size="sm" w={96} />
            <ButtonBox size="sm" w={120} />
          </div>
        </article>
      ))}
    </SkeletonRegion>
  );
}

/**
 * A course's lesson path: the page's head as the map draws it — the way back,
 * the course's name and how far along it is, the two courses to switch
 * between and the one button — then the first unit's banner and the first
 * stops down the winding line, leaning the way the path leans.
 */
export function CourseMapSkeleton(): React.JSX.Element {
  const t = useT();
  // the same lean as the path's own: middle, start, middle, end
  const lean = [0, -72, 0, 72];
  return (
    <SkeletonRegion label={t('common.loading')}>
      <div className="page-header lp-head">
        <span className="eyebrow lp-back">
          <Skeleton line w={112} />
        </span>
        <h1 className="page-title">
          <Skeleton line w="62%" />
        </h1>
        <p className="page-sub">
          <Skeleton line w={150} />
        </p>
        <div className="lp-courses">
          <Skeleton className="lp-course" w={196} h={44} radius="var(--r-pill)" />
          <Skeleton className="lp-course" w={172} h={44} radius="var(--r-pill)" />
        </div>
        <span className="lp-continue" style={{ display: 'block' }}>
          <ButtonBox w={116} />
        </span>
      </div>
      <div className="lp-map">
        <div className="lp-unit">
          <div className="lp-banner lp-skel-banner">
            <div className="lp-banner-text">
              <p className="lp-banner-eyebrow">
                <Skeleton line w={52} />
              </p>
              <h2 className="lp-banner-title">
                <Skeleton line w="56%" />
              </h2>
              <p className="lp-banner-topics">
                <Skeleton line w="38%" />
              </p>
            </div>
            <div className="lp-banner-side">
              <span className="lp-banner-count">
                <Skeleton line w={64} />
              </span>
              <Skeleton w={96} h={44} radius="var(--r-pill)" />
            </div>
          </div>
          <div className="lp-skel-path">
            {times(4, (i) => (
              <Skeleton key={i} className="lp-skel-node" style={{ top: 60 + i * 104 - 36, '--x': `${lean[i]}px` } as React.CSSProperties} />
            ))}
          </div>
        </div>
      </div>
    </SkeletonRegion>
  );
}

/**
 * The bell's list while it is on its way: a group's label, then rows of a face,
 * a line of what happened and its time — the rows' own classes, so each is the
 * height of the row that replaces it. Every third has a second line, the way a
 * gift or a badge says a little more.
 */
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

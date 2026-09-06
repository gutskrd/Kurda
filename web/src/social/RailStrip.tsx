import { BellIcon, ChatsIcon, GameIcon, UsersIcon } from '../components/icons';
import { badgeLabel } from './time';
import type { SocialRailData } from './useSocialRail';

/** One rung of the strip: what it stands for, and how many of it there are. */
export interface Rung {
  key: string;
  label: string;
  count: number;
  icon: React.JSX.Element;
  /** a count worth noticing gets the gold treatment; the rest stay quiet */
  urgent?: boolean;
}

/**
 * What the strip shows, derived from the same answer the open rail renders.
 *
 * Kept out of the component so the mapping — which number goes on which icon —
 * can be asserted without rendering anything.
 */
export function rungs(data: SocialRailData): Rung[] {
  const playing = data.friends.filter((f) => f.activity).length;
  const online = data.friends.filter((f) => f.online && !f.activity).length;
  return [
    {
      key: 'waiting',
      label: 'Waiting on you',
      count: data.challenges.length + data.requests.length,
      icon: <BellIcon size={20} />,
      urgent: true,
    },
    { key: 'playing', label: 'In a game', count: playing, icon: <GameIcon size={20} /> },
    { key: 'online', label: 'Friends online', count: online, icon: <UsersIcon size={20} /> },
    { key: 'groups', label: 'Groups', count: data.unread.groups, icon: <ChatsIcon size={20} /> },
  ];
}

/**
 * The rail, collapsed to a column of icons.
 *
 * Collapsing to nothing would mean checking on your friends costs a click every
 * time; collapsing to a strip keeps the counts in the corner of your eye and
 * gives the page its width back. Each rung opens the rail again — a number you
 * cannot act on is only half useful.
 */
export function RailStrip({
  data,
  onExpand,
}: {
  data: SocialRailData;
  onExpand: () => void;
}): React.JSX.Element {
  return (
    <div className="rail-strip">
      {rungs(data).map((r) => (
        <button
          key={r.key}
          type="button"
          className={`rail-rung${r.count > 0 && r.urgent ? ' is-urgent' : ''}`}
          onClick={onExpand}
          title={`${r.label}: ${r.count}`}
          aria-label={`${r.label}: ${r.count}. Open the social panel`}
        >
          {r.icon}
          {r.count > 0 && <span className="rail-badge rail-rung-count">{badgeLabel(r.count)}</span>}
        </button>
      ))}
    </div>
  );
}

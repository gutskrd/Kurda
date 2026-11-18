import { ChatsIcon, GameIcon, InviteIcon, UsersIcon } from '../components/icons';
import { badgeLabel } from './time';
import type { SocialRailData } from './useSocialRail';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';

/** One rung of the strip: what it stands for, and how many. */
interface Rung {
  key: string;
  /** A catalogue key, since this is built by a pure function with no language to hand. */
  labelKey: MessageKey;
  count: number;
  icon: React.JSX.Element;
  /** A count worth noticing is gold; the rest stay quiet. */
  urgent?: boolean;
}

/** What the strip shows, from the same answer the open rail renders; separate so the mapping can be tested directly. */
export function rungs(data: SocialRailData): Rung[] {
  const playing = data.friends.filter((f) => f.activity).length;
  const online = data.friends.filter((f) => f.online && !f.activity).length;
  return [
    {
      key: 'waiting',
      labelKey: 'rail.waitingOnYou',
      count: data.challenges.length + data.requests.filter((r) => !r.answered).length,
      // A person asking, not a bell, since the top bar's bell is notifications.
      icon: <InviteIcon size={20} />,
      urgent: true,
    },
    { key: 'playing', labelKey: 'rail.inAGame', count: playing, icon: <GameIcon size={20} /> },
    { key: 'online', labelKey: 'rail.friendsOnline', count: online, icon: <UsersIcon size={20} /> },
    { key: 'groups', labelKey: 'rail.groups', count: data.unread.groups, icon: <ChatsIcon size={20} /> },
  ];
}

/** The rail collapsed to a column of icons with counts; each rung opens the rail again. */
export function RailStrip({
  data,
  onExpand,
}: {
  data: SocialRailData;
  onExpand: () => void;
}): React.JSX.Element {
  const t = useT();
  return (
    <div className="rail-strip">
      {rungs(data).map((r) => (
        <button
          key={r.key}
          type="button"
          className={`rail-rung${r.count > 0 && r.urgent ? ' is-urgent' : ''}`}
          onClick={onExpand}
          title={t('rail.rungTitle', { label: t(r.labelKey), count: r.count })}
          aria-label={t('rail.rungOpen', { label: t(r.labelKey), count: r.count })}
        >
          {r.icon}
          {r.count > 0 && <span className="rail-badge rail-rung-count">{badgeLabel(r.count)}</span>}
        </button>
      ))}
    </div>
  );
}

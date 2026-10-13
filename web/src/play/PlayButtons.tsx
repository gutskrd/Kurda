import { useState } from 'react';
import { GameIcon } from '../components/icons';
import { useT } from '../i18n/I18nProvider';
import { InviteSheet, type InviteTarget } from './InviteSheet';

/**
 * "Play" with one friend — on their profile and on their row in the friends
 * list. Opens the invite sheet with them already chosen.
 */
export function PlayWithButton({
  userId,
  name,
  className = 'btn btn-secondary btn-sm',
  iconOnly = false,
}: {
  userId: string;
  name: string;
  className?: string;
  /** a row with little room: the icon, with the words as its name */
  iconOnly?: boolean;
}): React.JSX.Element {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => setOpen(true)}
        aria-label={iconOnly ? t('play.withWho', { name }) : undefined}
        title={iconOnly ? t('play.withWho', { name }) : undefined}
      >
        <GameIcon size={16} />
        {!iconOnly && t('play.button')}
      </button>
      <InviteSheet open={open} onClose={() => setOpen(false)} target={{ kind: 'new', friend: { userId, name } }} />
    </>
  );
}

/**
 * The game button in a chat's composer: in a conversation with a friend, the
 * sheet with them chosen; in a group, a game whose card is posted to the
 * group for its members to join.
 */
export function ChatGameButton({ target }: { target: Extract<InviteTarget, { kind: 'new' } | { kind: 'group' }> }): React.JSX.Element {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="chat-compose-tool" onClick={() => setOpen(true)} aria-label={t('play.chat.button')} title={t('play.chat.button')}>
        <GameIcon size={20} />
      </button>
      <InviteSheet open={open} onClose={() => setOpen(false)} target={target} />
    </>
  );
}

import { useId } from 'react';
import { Button } from '../components/Button';
import { InviteIcon } from '../components/icons';
import { formatUntil } from '../reports/restriction';
import { useLocale, useT, type Translate } from '../i18n/I18nProvider';
import { GroupAvatar } from './GroupAvatar';
import { useGreetings } from './greetings';

/**
 * An empty group chat: the group's picture and name, whether it is new or cleared by the reader, and three greetings
 * in the learner's Kurdish that send on a tap (hidden when the reader cannot post). Owners and admins of a group with
 * nobody else yet are offered to add friends.
 */
export function GroupWelcome({
  group,
  cleared,
  canPost,
  onGreet,
  onAddFriends,
}: {
  group: { id: string; name: string; photoUrl?: string | null };
  /** Whose clear left it empty, if any; the reader's own is shown here instead of "the start". */
  cleared: { kind: 'me'; at: string } | { kind: 'everyone' } | null;
  canPost: boolean;
  onGreet: (text: string) => void;
  onAddFriends?: () => void;
}): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const id = useId();
  const { greetings, lang, dir } = useGreetings();

  return (
    <div className="gwelcome">
      <GroupAvatar id={group.id} name={group.name} photoUrl={group.photoUrl} size={88} />
      <h2 className="gwelcome-name" dir="auto">
        {group.name}
      </h2>
      {cleared?.kind !== 'everyone' && (
        <p className="gwelcome-line">
          {cleared ? t('groups.welcome.clearedByMe', { when: formatUntil(cleared.at, locale) }) : t('groups.welcome.start', { group: group.name })}
        </p>
      )}
      {canPost && (
        <div className="gwelcome-say" role="group" aria-labelledby={`${id}-say`}>
          <p className="gwelcome-say-label" id={`${id}-say`}>
            {t('groups.welcome.sayHello')}
          </p>
          <div className="gwelcome-chips">
            {greetings.map((text) => (
              <button
                key={text}
                type="button"
                className="gwelcome-chip"
                lang={lang}
                dir={dir}
                aria-label={t('groups.welcome.send', { text })}
                onClick={() => onGreet(text)}
              >
                {text}
              </button>
            ))}
          </div>
        </div>
      )}
      {onAddFriends && (
        <Button variant="secondary" size="sm" className="gwelcome-add" onClick={onAddFriends} aria-haspopup="dialog">
          <InviteIcon size={16} />
          {t('groups.addFriends')}
        </Button>
      )}
    </div>
  );
}

/** Who cleared a chat for everyone and when: you, an admin by name, or a deleted account. */
export function clearedWords(t: Translate, locale: string, by: string | null, at: string, mine: boolean): string {
  const when = formatUntil(at, locale);
  return mine ? t('groups.cleared.byYou', { when }) : by ? t('groups.cleared.by', { name: by, when }) : t('groups.cleared.byAdmin', { when });
}

/** The line at the top of a chat cleared for everyone: who did it and when. */
export function ClearedLine({ by, at, mine }: { by: string | null; at: string; mine: boolean }): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  return (
    <p className="gcleared">
      <span>{clearedWords(t, locale, by, at, mine)}</span>
    </p>
  );
}

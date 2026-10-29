import { useId } from 'react';
import { storyTextDirection } from '@kurda/shared';
import { Button } from '../components/Button';
import { InviteIcon } from '../components/icons';
import { formatUntil } from '../reports/restriction';
import { courseDialect } from '../stories/prefs';
import { useLocale, useT } from '../i18n/I18nProvider';
import { GroupAvatar } from './GroupAvatar';
import { GREETINGS } from './standing';

/**
 * What an empty group chat shows instead of nothing: the group's picture,
 * large, and its name; where the chat stands — brand new, or cleared by you
 * (cleared for everyone says so in its own line above this) — and three
 * greetings in the Kurdish the learner is learning, any of which a tap sends.
 * The greetings are left out for someone who cannot post now. The owner and
 * admins of an invite-only group that has nobody else in it yet are offered
 * to add friends, since nobody else can be in it otherwise.
 */
export function GroupWelcome({
  group,
  cleared,
  canPost,
  sending,
  onGreet,
  onAddFriends,
}: {
  group: { id: string; name: string; photoUrl?: string | null };
  /** whose clear left it empty, if anyone's: yours is said here, in place of "the start" */
  cleared: { kind: 'me'; at: string } | { kind: 'everyone' } | null;
  canPost: boolean;
  sending: boolean;
  onGreet: (text: string) => void;
  onAddFriends?: () => void;
}): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const id = useId();
  // the learner's own course, as this device knows it; Kurmancî before their first lesson
  const dialect = courseDialect() ?? 'kurmanci';
  const { lang, dir } = storyTextDirection(dialect);

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
            {GREETINGS[dialect].map((text) => (
              <button
                key={text}
                type="button"
                className="gwelcome-chip"
                lang={lang}
                dir={dir}
                disabled={sending}
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

/** Who cleared a chat for everyone, and when, in words: you, an admin by name, or one whose account is gone. */
export function clearedWords(t: ReturnType<typeof useT>, locale: string, by: string | null, at: string, mine: boolean): string {
  const when = formatUntil(at, locale);
  return mine ? t('groups.cleared.byYou', { when }) : by ? t('groups.cleared.by', { name: by, when }) : t('groups.cleared.byAdmin', { when });
}

/** The line at the top of a chat cleared for everyone: who did it, and when. */
export function ClearedLine({ by, at, mine }: { by: string | null; at: string; mine: boolean }): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  return (
    <p className="gcleared">
      <span>{clearedWords(t, locale, by, at, mine)}</span>
    </p>
  );
}

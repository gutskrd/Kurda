import { useId } from 'react';
import { storyTextDirection } from '@kurda/shared';
import { Avatar } from '../components/Avatar';
import { GREETINGS } from '../groups/standing';
import { courseDialect } from '../stories/prefs';
import { useT } from '../i18n/I18nProvider';

/**
 * A conversation nobody has written in yet: who it is with, and a first thing
 * to say — in Kurdish, one tap away, the way a group's own start offers it
 * (groups/GroupWelcome.tsx).
 *
 * It was one grey line, "No messages yet. Say hello!", which left the saying
 * to the reader. A learner's first message to a friend is the hardest one to
 * write; here it is already written, three ways.
 */
export function DmWelcome({
  name,
  avatarUrl,
  onGreet,
}: {
  name: string;
  avatarUrl?: string | null;
  /** sends a greeting as the reader's first message */
  onGreet: (text: string) => void;
}): React.JSX.Element {
  const t = useT();
  const id = useId();
  // the learner's own course, as this device knows it; Kurmancî before their first lesson
  const dialect = courseDialect() ?? 'kurmanci';
  const { lang, dir } = storyTextDirection(dialect);
  return (
    <div className="gwelcome dm-welcome">
      <span className="dm-welcome-face">
        <Avatar url={avatarUrl} glyphSize={40} />
      </span>
      <h2 className="gwelcome-name" dir="auto">
        {name}
      </h2>
      <p className="gwelcome-line">{t('chat.welcome.start', { name })}</p>
      <div className="gwelcome-say" role="group" aria-labelledby={`${id}-say`}>
        <p className="gwelcome-say-label" id={`${id}-say`}>
          {t('groups.welcome.sayHello')}
        </p>
        <div className="gwelcome-chips">
          {GREETINGS[dialect].map((text) => (
            <button key={text} type="button" className="gwelcome-chip" lang={lang} dir={dir} aria-label={t('groups.welcome.send', { text })} onClick={() => onGreet(text)}>
              {text}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

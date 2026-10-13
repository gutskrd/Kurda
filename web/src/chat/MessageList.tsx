import { Fragment, type ReactNode } from 'react';
import type { ChatMessageKind } from '@kurda/shared';
import { MessageLine } from '../reports/MessageMenu';
import { Avatar } from '../components/Avatar';
import { MessageBody } from '../components/GameInviteCard';
import { groupMessages, timeLabel, type Groupable } from './messageGroups';
import { useLocale, useT } from '../i18n/I18nProvider';

/**
 * A chat thread rendered the way one should read: day separators, consecutive
 * messages from one sender folded into a single run, and each run introduced
 * ONCE by its author — avatar and name — rather than on every line.
 *
 * The avatar sits beside the run, not beside each bubble: repeating a face down
 * a burst of five messages is noise, and it is the burst that has an author.
 * Your own runs are labelled but carry no avatar; you know who you are, and the
 * space is better spent on the message.
 *
 * Shared by the direct and group threads so the two cannot drift apart.
 */

export interface ChatMessage extends Groupable {
  /** null for a gift or a game card, which `renderBody` draws */
  body: string | null;
  kind?: ChatMessageKind;
  /** who wrote it */
  username?: string;
  /** resolved server-side; falls back to a silhouette */
  avatarUrl?: string | null;
  /** group messages only: removed by a moderator or its author */
  deleted?: boolean;
}

export function MessageList<T extends ChatMessage>({
  messages,
  myId,
  renderStatus,
  onOpenProfile,
  renderBody,
  onReport,
}: {
  /** oldest first */
  messages: readonly T[];
  myId: string | undefined;
  /** trailing status for your own runs, e.g. a read receipt */
  renderStatus?: (last: T) => ReactNode;
  /** open a sender's profile — makes the avatar and name the way in */
  onOpenProfile?: (userId: string, username: string) => void;
  /**
   * Draw a message that is more than text — a gift, a game card. Return
   * undefined to let it render as text. The thread supplies it, since what a
   * card can do (unwrap, join) belongs to the thread.
   */
  renderBody?: (m: T) => ReactNode | undefined;
  /** report someone else's message: puts a ⋯ beside each of theirs */
  onReport?: (m: T) => void;
}): React.JSX.Element {
  const locale = useLocale();
  const t = useT();
  // the day separators are the only words this component owns; `locale` is what
  // names the weekday and the month, which `toLocaleDateString` otherwise takes
  // from the browser rather than from the language the reader chose
  const sections = groupMessages(messages, new Date(), {
    locale,
    today: t('chat.day.today'),
    yesterday: t('chat.day.yesterday'),
    earlier: t('chat.day.earlier'),
  });

  return (
    <>
      {sections.map((section) => (
        <Fragment key={section.day}>
          <div className="chat-day" role="separator">
            <span>{section.label}</span>
          </div>

          {section.runs.map((run) => {
            const mine = run.senderId === myId;
            const first = run.messages[0]!;
            const last = run.messages[run.messages.length - 1]!;
            const name = mine ? t('chat.you') : (first.username ?? t('chat.someone'));

            return (
              <div key={first.id} className={`chat-run${mine ? ' mine' : ''}`}>
                {/* one face per burst, at the start of it */}
                {!mine &&
                  (onOpenProfile ? (
                    <button
                      type="button"
                      className="chat-run-avatar"
                      onClick={() => onOpenProfile(run.senderId, name)}
                      aria-label={t('chat.profileOf', { name })}
                    >
                      <Avatar url={first.avatarUrl} glyphSize={18} />
                    </button>
                  ) : (
                    <span className="chat-run-avatar">
                      <Avatar url={first.avatarUrl} glyphSize={18} />
                    </span>
                  ))}

                <div className="chat-run-body">
                  <span className="chat-run-author">{name}</span>

                  {run.messages.map((m, i) => {
                    const bubble = (
                      <div
                        key={m.id}
                        className={`bubble${mine ? ' mine' : ''}${
                          i === run.messages.length - 1 ? ' bubble-tail' : ''
                        }${m.kind && m.kind !== 'text' ? ' is-card' : ''}`}
                      >
                        {m.deleted ? (
                          <em className="muted">{t('chat.messageDeleted')}</em>
                        ) : (
                          (renderBody?.(m) ?? <MessageBody body={m.body ?? ''} />)
                        )}
                      </div>
                    );
                    // someone else's message can be reported, from a ⋯ (or a long press)
                    return onReport && !mine && !m.deleted ? (
                      <MessageLine key={m.id} label={t('report.messageMenu', { name })} onReport={() => onReport(m)}>
                        {bubble}
                      </MessageLine>
                    ) : (
                      bubble
                    );
                  })}

                  {/* one timestamp per burst — on every bubble it becomes noise */}
                  <div className="chat-run-meta">
                    <time dateTime={last.createdAt}>{timeLabel(last.createdAt, locale)}</time>
                    {mine && renderStatus?.(last)}
                  </div>
                </div>
              </div>
            );
          })}
        </Fragment>
      ))}
    </>
  );
}

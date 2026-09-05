import { Fragment, type ReactNode } from 'react';
import { Avatar } from '../components/Avatar';
import { MessageBody } from '../components/GameInviteCard';
import { groupMessages, timeLabel, type Groupable } from './messageGroups';

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
  body: string;
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
}: {
  /** oldest first */
  messages: readonly T[];
  myId: string | undefined;
  /** trailing status for your own runs, e.g. a read receipt */
  renderStatus?: (last: T) => ReactNode;
  /** open a sender's profile — makes the avatar and name the way in */
  onOpenProfile?: (userId: string, username: string) => void;
}): React.JSX.Element {
  const sections = groupMessages(messages);

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
            const name = mine ? 'You' : (first.username ?? 'Someone');

            return (
              <div key={first.id} className={`chat-run${mine ? ' mine' : ''}`}>
                {/* one face per burst, at the start of it */}
                {!mine &&
                  (onOpenProfile ? (
                    <button
                      type="button"
                      className="chat-run-avatar"
                      onClick={() => onOpenProfile(run.senderId, name)}
                      aria-label={`${name}’s profile`}
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

                  {run.messages.map((m, i) => (
                    <div
                      key={m.id}
                      className={`bubble${mine ? ' mine' : ''}${
                        i === run.messages.length - 1 ? ' bubble-tail' : ''
                      }`}
                    >
                      {m.deleted ? <em className="muted">message deleted</em> : <MessageBody body={m.body} />}
                    </div>
                  ))}

                  {/* one timestamp per burst — on every bubble it becomes noise */}
                  <div className="chat-run-meta">
                    <time dateTime={last.createdAt}>{timeLabel(last.createdAt)}</time>
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

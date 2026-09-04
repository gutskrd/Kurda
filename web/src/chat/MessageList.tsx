import { Fragment, type ReactNode } from 'react';
import { MessageBody } from '../components/GameInviteCard';
import { groupMessages, timeLabel, type Groupable } from './messageGroups';

/**
 * A chat thread rendered the way one should read: day separators, consecutive
 * messages from one sender folded into a single run with the name said once, and
 * a timestamp on the run rather than on every line.
 *
 * Shared by the direct and group threads so the two cannot drift apart. What
 * differs between them is passed in: groups name the author, direct messages
 * carry a delivery status on your own runs.
 */

export interface ChatMessage extends Groupable {
  body: string;
  /** group messages only: removed by a moderator or its author */
  deleted?: boolean;
  /** group messages only: who wrote it */
  username?: string;
}

export function MessageList<T extends ChatMessage>({
  messages,
  myId,
  showAuthors = false,
  renderStatus,
}: {
  /** oldest first */
  messages: readonly T[];
  myId: string | undefined;
  /** name the sender above their run — worth it in a group, noise in a 1:1 */
  showAuthors?: boolean;
  /** trailing status for your own runs, e.g. a read receipt */
  renderStatus?: (last: T) => ReactNode;
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
            const last = run.messages[run.messages.length - 1]!;
            return (
              <div key={run.messages[0]!.id} className={`chat-run${mine ? ' mine' : ''}`}>
                {showAuthors && !mine && <span className="chat-run-author">{last.username}</span>}

                {run.messages.map((m, i) => (
                  <div
                    key={m.id}
                    className={`bubble${mine ? ' mine' : ''}${i === run.messages.length - 1 ? ' bubble-tail' : ''}`}
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
            );
          })}
        </Fragment>
      ))}
    </>
  );
}

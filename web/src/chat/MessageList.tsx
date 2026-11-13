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
  /**
   * Your own message that the server has not answered for (chat/useOutbox.ts):
   * `sending` is on its way and drawn a little dimmed; `failed` never got
   * there, says so under itself and offers to try again. Neither is ever
   * given a sent mark or a read receipt.
   */
  pending?: 'sending' | 'failed';
}

export function MessageList<T extends ChatMessage>({
  messages,
  myId,
  renderStatus,
  onOpenProfile,
  renderBody,
  onReport,
  onRetry,
  onDiscard,
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
  /** report someone else's message, from its options (held, right-clicked, or by keyboard) */
  onReport?: (m: T) => void;
  /** send a message that did not go once more */
  onRetry?: (m: T) => void;
  /** take a message that did not go back out of the thread */
  onDiscard?: (m: T) => void;
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
                        }${m.kind && m.kind !== 'text' ? ' is-card' : ''}${m.pending ? ` is-${m.pending}` : ''}`}
                      >
                        {m.deleted ? (
                          <em className="muted">{t('chat.messageDeleted')}</em>
                        ) : (
                          (renderBody?.(m) ?? <MessageBody body={m.body ?? ''} />)
                        )}
                      </div>
                    );
                    // not sent yet, or not sent at all: only its words, and for one that failed, what can be done about it
                    if (m.pending) {
                      return (
                        <Fragment key={m.id}>
                          {bubble}
                          {m.pending === 'failed' && (
                            <p className="chat-unsent" role="status">
                              <span>{t('chat.notSent')}</span>
                              {onRetry && (
                                <button type="button" className="link-btn" onClick={() => onRetry(m)}>
                                  {t('common.retry')}
                                </button>
                              )}
                              {onDiscard && (
                                <button type="button" className="link-btn" onClick={() => onDiscard(m)}>
                                  {t('common.cancel')}
                                </button>
                              )}
                            </p>
                          )}
                        </Fragment>
                      );
                    }
                    // held, right-clicked or reached by keyboard: copy its words, report someone else's
                    if (m.deleted) return bubble;
                    const words = !m.kind || m.kind === 'text' ? (m.body ?? null) : null;
                    const report = onReport && !mine ? () => onReport(m) : undefined;
                    return (
                      <MessageLine
                        key={m.id}
                        label={mine ? t('chat.messageOptions') : t('report.messageMenu', { name })}
                        onReport={report}
                        copyText={words}
                        mine={mine}
                      >
                        {bubble}
                      </MessageLine>
                    );
                  })}

                  {/* one timestamp per burst — on every bubble it becomes noise. A burst whose last message
                      is still on its way says that instead; one that did not go has said so under itself */}
                  {last.pending === 'sending' ? (
                    <div className="chat-run-meta" role="status">
                      {t('chat.sending')}
                    </div>
                  ) : (
                    !last.pending && (
                      <div className="chat-run-meta">
                        <time dateTime={last.createdAt}>{timeLabel(last.createdAt, locale)}</time>
                        {mine && renderStatus?.(last)}
                      </div>
                    )
                  )}
                </div>
              </div>
            );
          })}
        </Fragment>
      ))}
    </>
  );
}

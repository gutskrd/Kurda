import { Fragment, type ReactNode } from 'react';
import type { ChatMessageKind } from '@kurda/shared';
import { MessageLine } from '../reports/MessageMenu';
import { Avatar } from '../components/Avatar';
import { MessageBody } from '../components/GameInviteCard';
import { endsAMoment, groupMessages, isEmojiOnly, timeLabel, type Groupable } from './messageGroups';
import { useLocale, useT } from '../i18n/I18nProvider';

/**
 * A chat thread shared by direct and group threads: a pill per day, runs of bubbles per sender with one face at the
 * foot of each run, and the reader's own messages on the end side in gold. Names are always read to screen readers
 * but printed only in groups (`named`) over other people's runs. The time is printed where a moment ends
 * (`endsAMoment`); other runs keep it for screen readers and on hover.
 */

interface ChatMessage extends Groupable {
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
   * The reader's unconfirmed message (chat/useOutbox.ts): `sending` is dimmed, `failed` says so with a retry; neither
   * gets a sent mark or read receipt.
   */
  pending?: 'sending' | 'failed';
}

export function MessageList<T extends ChatMessage>({
  messages,
  myId,
  named = false,
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
  /** a group: other people's names are printed over their runs, since their side alone does not say who */
  named?: boolean;
  /** trailing status for your own runs, e.g. a read receipt */
  renderStatus?: (last: T) => ReactNode;
  /** open a sender's profile — makes the avatar and name the way in */
  onOpenProfile?: (userId: string, username: string) => void;
  /** Renders a gift or game card, or returns undefined for plain text; supplied by the thread, which owns card actions. */
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
  // The locale names weekdays and months, which `toLocaleDateString` would otherwise take from the browser.
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

          {section.runs.map((run, at) => {
            const mine = run.senderId === myId;
            const first = run.messages[0]!;
            const last = run.messages[run.messages.length - 1]!;
            const name = mine ? t('chat.you') : (first.username ?? t('chat.someone'));
            // the time is printed where a moment ends; a run that is still going out, or did not go, says that instead
            const timed = endsAMoment(section.runs, at);

            return (
              <div key={first.id} className={`chat-run${mine ? ' mine' : ''}${timed && !last.pending ? ' has-meta' : ''}`}>
                {/* one face per burst, at the foot of it */}
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
                  <span className={`chat-run-author${named && !mine ? '' : ' sr-only'}`}>{name}</span>

                  {run.messages.map((m, i) => {
                    const words = !m.kind || m.kind === 'text' ? (m.body ?? null) : null;
                    const isLast = i === run.messages.length - 1;
                    const bubble = (
                      <div
                        key={m.id}
                        className={`bubble${mine ? ' mine' : ''}${i === 0 ? ' is-first' : ''}${isLast ? ' is-last bubble-tail' : ''}${
                          m.kind && m.kind !== 'text' ? ' is-card' : ''
                        }${!m.deleted && isEmojiOnly(words) ? ' is-emoji' : ''}${m.pending ? ` is-${m.pending}` : ''}`}
                        title={timeLabel(m.createdAt, locale) || undefined}
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
                      <div className={`chat-run-meta${timed ? '' : ' sr-only'}`}>
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

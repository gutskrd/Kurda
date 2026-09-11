import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { Avatar } from '../components/Avatar';
import { Modal } from '../components/Modal';
import { FriendListSkeleton } from '../components/skeletons';
import { ShareIcon, LinkIcon, SendIcon } from '../components/icons';
import { useT } from '../i18n/I18nProvider';
import type { FeedItem, UserSummary } from '../lib/types';

/**
 * Passing a post on — inside MyKurda, or out of it.
 *
 * Two different acts behind one button, because to a reader they are one
 * thought. Sending it to a friend here keeps them in the app and arrives as a
 * message they can reply to. Sharing it out hands the link to whatever they
 * already use, which on a phone is the system sheet and every app in it.
 *
 * `navigator.share` is offered only when the device actually has it — on a
 * desktop it either does not exist or opens something nobody wanted, so there
 * the honest primary action is copying the link. Both are always present; the
 * order changes.
 *
 * What the link looks like once it lands somewhere else is not this component's
 * doing: `web/src/worker.ts` writes the post's title, author and picture into
 * the page's head at the edge, because nothing that unfurls a link runs the app.
 */

/** The absolute URL of a post — a share target is somewhere else, so it needs the origin. */
export function postUrl(item: Pick<FeedItem, 'href'>): string {
  return new URL(item.href, window.location.origin).toString();
}

/** One line of text to carry alongside the link. */
function shareText(item: FeedItem): string {
  return item.title?.trim() || item.excerpt?.trim()?.slice(0, 120) || '';
}

export function SharePost({ item }: { item: FeedItem }): React.JSX.Element {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const url = postUrl(item);

  // `share` is on the navigator of some desktop browsers but refuses non-file
  // data, so this is read once on mount rather than trusted blindly at click
  const [canShareOut, setCanShareOut] = useState(false);
  useEffect(() => {
    setCanShareOut(typeof navigator !== 'undefined' && typeof navigator.share === 'function');
  }, []);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // a refused clipboard is not an error worth a dialog — the link is on
      // screen in the field beside the button, ready to be selected by hand
      setCopied(false);
    }
  }

  async function shareOut(): Promise<void> {
    try {
      await navigator.share({ title: shareText(item) || 'MyKurda', text: shareText(item), url });
      setOpen(false);
    } catch {
      // the sheet was dismissed, which is a choice rather than a failure
    }
  }

  return (
    <>
      <button
        type="button"
        className="fcard-act fcard-share"
        aria-label={t('share.post')}
        title={t('share.post')}
        onClick={() => setOpen(true)}
      >
        <ShareIcon size={18} />
      </button>

      {open && (
        <Modal open onClose={() => setOpen(false)} label={t('share.post')}>
          <div className="share-sheet">
            <h2 className="friend-heading" style={{ marginTop: 0 }}>
              {t('share.title')}
            </h2>

            {canShareOut && (
              <button type="button" className="btn btn-primary btn-block share-primary" onClick={() => void shareOut()}>
                <ShareIcon size={17} />
                {t('share.shareOut')}
              </button>
            )}

            <div className="share-link">
              <input className="input" readOnly value={url} aria-label={t('share.linkLabel')} onFocus={(e) => e.currentTarget.select()} />
              <button
                type="button"
                className={`btn btn-secondary${copied ? ' is-done' : ''}`}
                onClick={() => void copy()}
              >
                <LinkIcon size={16} />
                {copied ? t('share.copied') : t('share.copy')}
              </button>
            </div>

            <SendToFriend item={item} url={url} onSent={() => setOpen(false)} />
          </div>
        </Modal>
      )}
    </>
  );
}

/**
 * Send it to somebody here.
 *
 * Friends only, which is the same rule the chat itself enforces — the server
 * refuses a message to anyone else, so offering a wider list would only produce
 * a failure at the end of it.
 */
function SendToFriend({
  item,
  url,
  onSent,
}: {
  item: FeedItem;
  url: string;
  onSent: () => void;
}): React.JSX.Element {
  const { client, status } = useAuth();
  const t = useT();
  const [friends, setFriends] = useState<UserSummary[] | null>(null);
  const [q, setQ] = useState('');
  const [sending, setSending] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const signedIn = status === 'signedIn';

  useEffect(() => {
    if (!signedIn) return;
    void (async () => {
      const res = await client.get<{ friends: UserSummary[] }>('/friends');
      setFriends(res.ok ? res.data.friends : []);
    })();
  }, [client, signedIn]);

  if (!signedIn) return <p className="muted share-note">{t('share.signInToSend')}</p>;

  async function send(friend: UserSummary): Promise<void> {
    if (sending) return;
    setSending(friend.userId);
    setFailed(false);
    const body = shareText(item) ? `${shareText(item)}\n${url}` : url;
    const res = await client.post(`/chat/${friend.userId}/messages`, { body });
    setSending(null);
    if (!res.ok) {
      setFailed(true);
      return;
    }
    setSentTo(friend.username);
    // long enough to read who it went to, short enough not to sit there
    window.setTimeout(onSent, 1200);
  }

  return (
    <div className="share-friends-block">
      <div className="share-divider">
        <span>{t('share.orSendHere')}</span>
      </div>

      {sentTo ? (
        <p className="share-sent">{t('share.sentTo', { name: sentTo })}</p>
      ) : friends === null ? (
        <FriendListSkeleton count={3} />
      ) : friends.length === 0 ? (
        <p className="muted share-note">{t('share.noFriendsYet')}</p>
      ) : (
        <>
          {friends.length > 6 && (
            <input
              className="input"
              placeholder={t('share.searchFriends')}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label={t('share.searchFriends')}
              style={{ marginBottom: 10 }}
            />
          )}
          {failed && <p className="msg msg-error">{t('share.sendFailed')}</p>}
          <ul className="gift-friends">
            {friends
              .filter((f) => f.username.toLowerCase().includes(q.trim().toLowerCase()))
              .map((f) => (
                <li key={f.userId}>
                  <button
                    type="button"
                    className="gift-friend"
                    disabled={sending !== null}
                    onClick={() => void send(f)}
                  >
                    <Avatar url={f.avatarUrl} glyphSize={18} />
                    <span className="gift-friend-name">{f.username}</span>
                    <SendIcon size={17} className="gift-friend-go" />
                  </button>
                </li>
              ))}
          </ul>
        </>
      )}
    </div>
  );
}

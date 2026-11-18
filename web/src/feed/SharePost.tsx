import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { Avatar } from '../components/Avatar';
import { Modal } from '../components/Modal';
import { PickFriendSkeleton } from '../components/skeletons';
import { ShareIcon, LinkIcon, SendIcon } from '../components/icons';
import { useT } from '../i18n/I18nProvider';
import type { ApiError, FeedItem, UserSummary } from '../lib/types';
import { SendError } from '../reports/SendError';

/**
 * Passing a post on, behind one button: sending it to a friend as a message, or sharing the link out. The device's
 * share sheet leads only where it works; otherwise copying the link does. The link preview is written by
 * `web/src/worker.ts`, since link unfurlers do not run the app.
 */

/** The absolute URL of a post, since a share target needs the origin. */
function postUrl(item: Pick<FeedItem, 'href'>): string {
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

  // Some desktop browsers have `share` but refuse non-file data, so support is checked once on mount.
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
      // A refused clipboard is not worth a dialog; the link is in the field beside the button.
      setCopied(false);
    }
  }

  async function shareOut(): Promise<void> {
    try {
      await navigator.share({ title: shareText(item) || 'Hevalo', text: shareText(item), url });
      setOpen(false);
    } catch {
      // The sheet was dismissed, which is a choice rather than a failure.
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
        <ShareIcon size={24} />
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

/** Sends the post to a friend; friends only, since the server refuses messages to anyone else. */
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
  const [failed, setFailed] = useState<ApiError | null>(null);

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
    setFailed(null);
    const body = shareText(item) ? `${shareText(item)}\n${url}` : url;
    const res = await client.post(`/chat/${friend.userId}/messages`, { body });
    setSending(null);
    if (!res.ok) {
      setFailed(res.error);
      return;
    }
    setSentTo(friend.username);
    // Long enough to read who it went to.
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
        <PickFriendSkeleton count={3} />
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
          <SendError error={failed} describe={() => t('share.sendFailed')} />
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

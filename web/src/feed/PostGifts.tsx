/**
 * The gifts on a post: a small row with the first pictures, how many, and who gave them ("Gifts from Hamo and 3
 * others"), as the server lets this reader see them, with a grand gift shown large ahead of the row so it stays on show.
 * A press lists every gift with its giver. The post's gift button opens the gift sheet for its author.
 */
import { useEffect, useState } from 'react';
import { giftSenderName, postGiftsLine, type PostGiftSender } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { Avatar } from '../components/Avatar';
import { Sheet } from '../components/Sheet';
import { GiftItemArt } from '../gifts/GiftArt';
import { GiftSentMoment } from '../gifts/GiftMoment';
import { GiftPicker, type GiftSent } from '../gifts/GiftPicker';
import { canGiveGifts } from '../gifts/access';
import { GiftIcon } from '../components/icons';
import { useCountForms } from '../components/Count';
import { useT } from '../i18n/I18nProvider';
import type { FeedItem } from '../lib/types';

export function PostGiftsRow({ item }: { item: Pick<FeedItem, 'targetType' | 'id' | 'gifts'> }): React.JSX.Element | null {
  const t = useT();
  const { short, whole } = useCountForms();
  const [open, setOpen] = useState(false);
  const gifts = item.gifts;
  if (!gifts || gifts.count <= 0) return null;
  const line = postGiftsLine(gifts);
  const name = line.name ?? t('gift.someone');
  // Shown short ("and 1.2K others"), said whole in the button's label.
  const from = (count: string): string =>
    line.others === 0
      ? t(line.many ? 'post.gifts.fromMany' : 'post.gifts.from', { name })
      : t(line.others === 1 ? 'post.gifts.fromOther' : 'post.gifts.fromOthers', { name, count });
  const grand = gifts.items.filter((g) => g.tier === 'grand').slice(0, 3);
  const small = gifts.items.filter((g) => g.tier !== 'grand').slice(0, 3);
  return (
    <>
      <button
        type="button"
        className="fcard-gifts"
        aria-label={`${from(whole(line.others))}, ${t('post.gifts.count', { count: whole(gifts.count) })}`}
        onClick={() => setOpen(true)}
      >
        {grand.length > 0 && (
          <span className="fcard-gifts-grand" aria-hidden="true">
            {grand.map((g) => (
              <GiftItemArt key={g.sku} assetUrl={g.assetUrl} category="gift" size={56} />
            ))}
          </span>
        )}
        <span className="fcard-gifts-art" aria-hidden="true">
          {small.map((g) => (
            <GiftItemArt key={g.sku} assetUrl={g.assetUrl} category="sticker" size={22} />
          ))}
        </span>
        <span className="fcard-gifts-count" aria-hidden="true">
          {short(gifts.count)}
        </span>
        <span className="fcard-gifts-words" aria-hidden="true">
          {from(short(line.others))}
        </span>
      </button>
      {open && <GiftSenders post={item} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Every gift on the post with who gave it, newest first; a giver this reader may not see is "a Hevalo member". */
function GiftSenders({ post, onClose }: { post: Pick<FeedItem, 'targetType' | 'id'>; onClose: () => void }): React.JSX.Element {
  const t = useT();
  const { client } = useAuth();
  const [senders, setSenders] = useState<PostGiftSender[] | null>(null);
  useEffect(() => {
    let live = true;
    void client.get<{ senders: PostGiftSender[] }>(`/gifts/posts/${post.targetType}/${encodeURIComponent(post.id)}`).then((res) => {
      if (live) setSenders(res.ok ? (res.data.senders ?? []) : []);
    });
    return () => {
      live = false;
    };
  }, [client, post.targetType, post.id]);
  return (
    <Sheet open onClose={onClose} label={t('post.gifts.title')} className="post-gifts-sheet">
      <h2 className="post-gifts-title">{t('post.gifts.title')}</h2>
      <ul className="post-gifts-list">
        {(senders ?? []).map((s, i) => {
          const name = giftSenderName(s.from);
          return (
            <li key={`${s.at}-${i}`} className="post-gifts-sender">
              <Avatar url={s.from?.avatarUrl ?? null} />
              <span className="post-gifts-words">
                <strong>{name ? t('gift.from', { name }) : t('gift.fromMember')}</strong>
                <span>{s.itemName}</span>
              </span>
              <GiftItemArt assetUrl={s.assetUrl} category="sticker" size={32} />
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}

/**
 * The gift button on someone else's post, for a signed-in account that may give gifts; the sheet goes to the author,
 * and the server holds the post rule (friends of a day, or both known adults). A gift given shows the sender's moment.
 */
export function PostGiftButton({ item, onGiven }: { item: Pick<FeedItem, 'targetType' | 'id' | 'author'>; onGiven?: () => void }): React.JSX.Element | null {
  const t = useT();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [given, setGiven] = useState<GiftSent | null>(null);
  if (!canGiveGifts(user) || item.author.id === user?.id || item.author.unavailable) return null;
  return (
    <>
      <button type="button" className="fcard-act fcard-gift-btn" aria-label={t('post.gifts.give')} title={t('post.gifts.give')} onClick={() => setOpen(true)}>
        <GiftIcon size={20} />
      </button>
      <GiftPicker
        open={open}
        onClose={() => setOpen(false)}
        post={{ type: item.targetType, id: item.id }}
        people={[{ userId: item.author.id, name: item.author.username, avatarUrl: item.author.avatarUrl }]}
        onSent={(sent) => {
          setOpen(false);
          setGiven(sent);
          onGiven?.();
        }}
      />
      {given && <GiftSentMoment item={given.item} line={t('gift.sentTo', { names: item.author.username })} announce onDone={() => setGiven(null)} />}
    </>
  );
}

/**
 * The gifts on a post, read-only on the website: a small row with the first pictures, how many, and who gave them
 * ("Gifts from Hamo and 3 others"), as the server lets this reader see them. A press lists every gift with its giver.
 * Gifts are given from the phone.
 */
import { useEffect, useState } from 'react';
import { giftSenderName, postGiftsLine, type PostGiftSender } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { Avatar } from '../components/Avatar';
import { Sheet } from '../components/Sheet';
import { GiftItemArt } from '../gifts/GiftArt';
import { useI18n, useT } from '../i18n/I18nProvider';
import type { FeedItem } from '../lib/types';

export function PostGiftsRow({ item }: { item: Pick<FeedItem, 'targetType' | 'id' | 'gifts'> }): React.JSX.Element | null {
  const t = useT();
  const { locale } = useI18n();
  const [open, setOpen] = useState(false);
  const gifts = item.gifts;
  if (!gifts || gifts.count <= 0) return null;
  const line = postGiftsLine(gifts);
  const name = line.name ?? t('gift.someone');
  const others = line.others.toLocaleString(locale);
  const words =
    line.others === 0
      ? t(line.many ? 'post.gifts.fromMany' : 'post.gifts.from', { name })
      : t(line.others === 1 ? 'post.gifts.fromOther' : 'post.gifts.fromOthers', { name, count: others });
  const count = gifts.count.toLocaleString(locale);
  return (
    <>
      <button type="button" className="fcard-gifts" aria-label={`${words}, ${t('post.gifts.count', { count })}`} onClick={() => setOpen(true)}>
        <span className="fcard-gifts-art" aria-hidden="true">
          {gifts.items.slice(0, 3).map((g) => (
            <GiftItemArt key={g.sku} assetUrl={g.assetUrl} category="sticker" size={22} />
          ))}
        </span>
        <span className="fcard-gifts-count" aria-hidden="true">
          {count}
        </span>
        <span className="fcard-gifts-words" aria-hidden="true">
          {words}
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

import { useCallback, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { GiftTier, GiftUserEvent } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { Avatar } from '../components/Avatar';
import { CloseButton } from '../components/CloseButton';
import { useRealtimeEvent } from '../realtime/RealtimeProvider';
import type { RealtimeEventEnvelope } from '../realtime/events';
import { useT } from '../i18n/I18nProvider';
import { giftChatPath } from '../reports/notifications';
import { giftsWereOpened } from '../shop/useUnseenGifts';
import { GiftBox } from './GiftArt';

interface Arrival {
  giftId: string;
  /** how the box is wrapped, as in the chat it opens in */
  tier: GiftTier;
  from: string;
  avatarUrl: string | null;
  to: string;
}

/** Never more than this many on screen; older ones give way. */
const MAX = 3;

/**
 * A banner such as "Rojda sent you a gift — Open" anywhere in the app, from `gift_received` on the recipient's
 * channel. It stays until opened or dismissed, and Open unwraps it in its chat; nothing shows for the chat being read.
 * Announced politely (`role="status"`) without taking focus.
 */
export function GiftArrivals(): React.JSX.Element | null {
  const { status } = useAuth();
  const t = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const [arrivals, setArrivals] = useState<Arrival[]>([]);

  const onReceived = useCallback(
    (env: RealtimeEventEnvelope) => {
      const ev = env.event as Partial<Extract<GiftUserEvent, { type: 'gift_received' }>>;
      if (!ev.giftId || !ev.chat || !ev.from) return;
      giftsWereOpened(); // Any shown gift count refreshes.
      const params = new URLSearchParams(location.search);
      const reading =
        location.pathname.startsWith('/app/messages') &&
        (ev.chat.kind === 'dm' ? params.get('to') === ev.chat.userId : params.get('group') === ev.chat.groupId);
      if (reading) return;
      const chat = ev.chat.kind === 'dm' ? `dm:${ev.chat.userId}` : `group:${ev.chat.groupId}`;
      const to = giftChatPath(chat, ev.giftId, ev.chat.kind === 'dm' ? ev.from.name : undefined);
      if (!to) return;
      const arrival: Arrival = { giftId: ev.giftId, tier: ev.card?.tier ?? 'common', from: ev.from.name, avatarUrl: ev.from.avatarUrl, to };
      setArrivals((list) => [...list.filter((a) => a.giftId !== arrival.giftId), arrival].slice(-MAX));
    },
    [location.pathname, location.search],
  );
  useRealtimeEvent('gift_received', onReceived);

  if (status !== 'signedIn' || arrivals.length === 0) return null;

  const drop = (giftId: string): void => setArrivals((list) => list.filter((a) => a.giftId !== giftId));

  return (
    <div className="gift-arrivals" role="region" aria-label={t('gift.arrivals')}>
      {arrivals.map((a) => (
        <div key={a.giftId} className="gift-arrival" role="status">
          <span className="gift-arrival-art" aria-hidden>
            <GiftBox tier={a.tier} size={44} motion="idle" seed={a.giftId} />
          </span>
          <span className="gift-arrival-who">
            <Avatar url={a.avatarUrl} glyphSize={14} />
          </span>
          <span className="gift-arrival-text">{t('gift.arrived', { name: a.from })}</span>
          <button
            type="button"
            className="btn btn-primary btn-sm gift-arrival-open"
            onClick={() => {
              drop(a.giftId);
              navigate(a.to);
            }}
          >
            {t('gift.open')}
          </button>
          <CloseButton label={t('gift.dismiss', { name: a.from })} onClick={() => drop(a.giftId)} />
        </div>
      ))}
    </div>
  );
}

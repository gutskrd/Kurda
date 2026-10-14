import { useCallback, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { GiftUserEvent } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { Avatar } from '../components/Avatar';
import { CloseIcon } from '../components/icons';
import { useRealtimeEvent } from '../realtime/RealtimeProvider';
import type { RealtimeEventEnvelope } from '../realtime/events';
import { useT } from '../i18n/I18nProvider';
import { giftChatPath } from '../reports/notifications';
import { giftsWereOpened } from '../shop/useUnseenGifts';
import { GiftBox } from './GiftArt';

interface Arrival {
  giftId: string;
  from: string;
  avatarUrl: string | null;
  to: string;
}

/** Never more than this many on screen; older ones give way. */
const MAX = 3;

/**
 * "Rojda sent you a gift — Open", wherever you are in the app.
 *
 * A gift used to land silently in the Shop. Now each recipient hears
 * `gift_received` on their own channel; this shows it as a banner that stays
 * until it is opened or put away (no countdown — a present is not a toast to
 * miss), and Open goes to the chat it is in and unwraps it there. Nothing is
 * shown for the chat you are already reading: the bubble is in front of you.
 *
 * `role="status"`: announced politely, never taking focus from what you were
 * doing.
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
      giftsWereOpened(); // the badge counts it now
      const params = new URLSearchParams(location.search);
      const reading =
        location.pathname.startsWith('/app/messages') &&
        (ev.chat.kind === 'dm' ? params.get('to') === ev.chat.userId : params.get('group') === ev.chat.groupId);
      if (reading) return;
      const chat = ev.chat.kind === 'dm' ? `dm:${ev.chat.userId}` : `group:${ev.chat.groupId}`;
      const to = giftChatPath(chat, ev.giftId, ev.chat.kind === 'dm' ? ev.from.name : undefined);
      if (!to) return;
      const arrival: Arrival = { giftId: ev.giftId, from: ev.from.name, avatarUrl: ev.from.avatarUrl, to };
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
            <GiftBox tier="common" size={40} />
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
          <button type="button" className="gift-arrival-close" aria-label={t('gift.dismiss', { name: a.from })} onClick={() => drop(a.giftId)}>
            <CloseIcon size={15} />
          </button>
        </div>
      ))}
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { giftMeaning, type BagArrival, type GiftBagView } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { CloseButton } from '../components/CloseButton';
import { useI18n, useT } from '../i18n/I18nProvider';
import { GiftItemArt } from './GiftArt';
import { canGiveGifts } from './access';
import { plusPitchAllowed } from './nudges';

/** How often, at most, the bag is asked about while someone moves around the app. */
const LOOK_EVERY_MS = 60_000;

/**
 * One quiet line when small gifts land in the gift bag (a streak milestone, a win, a harvest), wherever the learner is:
 * "Çay is in your gift bag", with Give it and Close. To a free account the server knows is an adult it adds that members
 * also earn Zêr there, while Hevalo+ is on sale; never to anyone under 18 or of unknown age. The day's own gift is said
 * by the daily card instead.
 * Announced politely, without taking focus.
 */
export function BagNews(): React.JSX.Element | null {
  const t = useT();
  const { locale } = useI18n();
  const { client, status, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [news, setNews] = useState<{ arrivals: BagArrival[]; earnsZer: boolean; nudges: boolean } | null>(null);
  const lastLook = useRef(0);
  const signedIn = status === 'signedIn' && canGiveGifts(user);

  const look = useCallback(async () => {
    if (!signedIn || Date.now() - lastLook.current < LOOK_EVERY_MS) return;
    lastLook.current = Date.now();
    const res = await client.get<GiftBagView>('/gifts/bag');
    if (res.ok && res.data.arrivals.length > 0) setNews({ arrivals: res.data.arrivals, earnsZer: res.data.earnsZer, nudges: res.data.nudges === true });
  }, [client, signedIn]);

  // on arriving, on every move through the app, and on coming back to the tab, at most once a minute
  useEffect(() => {
    void look();
  }, [look, location.pathname]);
  useEffect(() => {
    const onFocus = (): void => void look();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [look]);

  if (!signedIn || !news) return null;

  const done = (): void => {
    setNews(null);
    void client.post('/gifts/bag/seen');
  };
  const first = news.arrivals[0]!;
  const meaning = giftMeaning(first.sku, locale);
  const words =
    news.arrivals.length === 1
      ? t('bag.news.landed', { item: meaning ? `${first.name} (${meaning})` : first.name })
      : t('bag.news.many', { count: news.arrivals.length.toLocaleString(locale) });

  return (
    <div className="bag-news" role="status">
      <GiftItemArt assetUrl={first.assetUrl} category="gift" size={44} />
      <span className="bag-news-words">
        <span>{words}</span>
        {!news.earnsZer && plusPitchAllowed(news.nudges) && <span className="bag-news-pitch">{t('gift.membersEarnZer')}</span>}
      </span>
      <button
        type="button"
        className="btn btn-primary btn-sm"
        onClick={() => {
          done();
          navigate('/app/messages');
        }}
      >
        {t('bag.news.give')}
      </button>
      <CloseButton label={t('bag.news.close')} onClick={done} />
    </div>
  );
}

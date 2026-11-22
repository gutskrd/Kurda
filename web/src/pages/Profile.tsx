import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import type { InventoryItem, MeProfile, ProfileSections, PublicProfile, UserSummary, WalletBalances } from '../lib/types';
import { FullProfile, OnlyYou, ProfileFacts, type FullProfileView } from '../profile/FullProfile';
import { ProfileActivity } from '../profile/ProfileActivity';
import { countryName } from '../lib/countries';
import { AvatarStack } from '../components/AvatarStack';
import { CoinIcon, EditIcon } from '../components/icons';
import { ProfileMenu, ShareProfile } from '../profile/ProfileMenu';
import { ErrorState } from '../components/states';
import { FullProfileSkeleton } from '../components/skeletons';
import { useLocale, useT } from '../i18n/I18nProvider';
import { DailySheet } from '../daily/DailySheet';
import { useToday } from '../daily/today';
import type { MessageKey } from '../i18n/en';
import { PendingPhoto } from '../pictures/PictureCheck';

/** Who can open a profile, in the words Settings says it in. */
const SEEN_BY: Record<MeProfile['profileVisibility'], MessageKey> = {
  everyone: 'settings.visibility.everyone',
  members: 'settings.visibility.members',
  friends: 'settings.visibility.friends',
  nobody: 'settings.visibility.nobody',
};

/**
 * Your own profile: the page everyone else sees (profile/FullProfile) with your actions instead of the friend ones (edit
 * and share, and a corner menu of shop, friends, badges and settings), plus a section only you see: streak numbers,
 * freezes and Zêr. It also says who can open it, with the way to change that. Editing is on /app/profile/edit. A new
 * photo still being checked shows small under the card, since everyone else still sees the old one.
 */
export function Profile(): React.JSX.Element {
  const { client, user } = useAuth();
  const t = useT();
  const locale = useLocale();
  const [me, setMe] = useState<MeProfile | null>(null);
  // Who you are is known before /me answers, so your public profile is fetched with the rest.
  const selfId = user?.id ?? null;
  const [zer, setZer] = useState<number | null>(null);
  // Only the count; the faces are on the Friends page, a tap from the number.
  const [friendCount, setFriendCount] = useState<number | null>(null);
  const [icons, setIcons] = useState<InventoryItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  // The streak opens the daily view; a streak restored there is the profile's from then on.
  const [dailyOpen, setDailyOpen] = useState(false);
  const today = useToday(dailyOpen);

  const [sections, setSections] = useState<ProfileSections | null>(null);
  // Badges, league and frame come from your public profile, not /me.
  const [shown, setShown] = useState<Pick<PublicProfile, 'badges' | 'league' | 'frameSku' | 'frameUrl' | 'achievements' | 'tree'> | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      const [m, w, f, inv, early] = await Promise.all([
        client.get<{ user: MeProfile }>('/me'),
        client.get<{ balances: WalletBalances }>('/me/wallet'),
        client.get<{ friends: UserSummary[]; total: number }>('/friends?limit=1'),
        client.get<{ items: InventoryItem[] }>('/me/inventory'),
        selfId ? client.get<PublicProfile>(`/users/${selfId}`) : Promise.resolve(null),
      ]);
      if (cancelled) return;
      if (m.ok && m.data?.user?.username) setMe(m.data.user);
      else setError(m.ok ? t('profile.yoursNotLoaded') : describeError(m.error, t));
      if (w.ok) setZer(w.data.balances.zer);
      // An API older than paging sends no total: it sent the whole list, so its length is the total.
      if (f.ok) setFriendCount(f.data.total ?? (f.data.friends ?? []).length);
      if (inv.ok) setIcons((inv.data.items ?? []).filter((i) => i.category === 'icon'));

      // Your activity sections come from the public profile endpoint, worked out as for everyone, fetched with the rest so
      // nothing arrives late and pushes the page down; fetched after only when who you are was not known yet.
      const id = m.ok ? m.data?.user?.id : undefined;
      const p = early && id === selfId ? early : id ? await client.get<PublicProfile>(`/users/${id}`) : null;
      if (cancelled) return;
      if (p?.ok) {
        setSections(p.data.sections ?? null);
        setShown({ badges: p.data.badges, league: p.data.league, frameSku: p.data.frameSku, frameUrl: p.data.frameUrl, achievements: p.data.achievements, tree: p.data.tree });
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [client, reloadKey, t, selfId]);

  if (loading) return <FullProfileSkeleton label="profile.loadingYours" own />;
  if (error || !me) return <ErrorState title={t('profile.loadFailedYours')} message={error ?? t('profile.unavailable')} onRetry={() => setReloadKey((n) => n + 1)} />;

  const joined = new Date(me.createdAt);
  const view: FullProfileView = {
    id: me.id,
    name: me.displayName || me.username,
    username: me.username,
    avatarUrl: me.avatarUrl ?? me.profilePhotoUrl,
    icon: me.icon ?? null,
    background: me.background ?? null,
    premium: me.premium,
    levelInfo: me.level,
    xp: me.level?.xp ?? me.xp,
    streakDays: me.streak.current,
    friends: friendCount,
    badges: shown?.achievements ?? null,
    bio: me.bio,
    favPoem: me.favoritePoem ?? null,
    favStory: me.favoriteStory ?? null,
    country: me.country ? { code: me.country, name: countryName(me.country, locale) ?? me.country } : null,
    frameSku: shown?.frameSku ?? null,
    frameUrl: shown?.frameUrl ?? null,
    joinedYear: Number.isNaN(joined.getTime()) ? null : joined.getFullYear(),
    seenBy: SEEN_BY[me.profileVisibility] ? { who: t(SEEN_BY[me.profileVisibility]), to: '/app/settings/visibility' } : null,
  };
  const number = (n: number): string => n.toLocaleString(locale);
  const maxFreezes = me.streak.maxFreezes ?? 1;
  const sessionsPerFreeze = me.streak.sessionsPerFreeze ?? 5;

  return (
    <>
      <FullProfile
        own
        view={view}
        onStreak={() => setDailyOpen(true)}
        // Everything yours that is not this page, behind the banner's corner menu.
        corner={<ProfileMenu />}
        // What to do with the page itself: change it, and send it to somebody.
        headerAction={
          <div className="pc-acts">
            <Link to="/app/profile/edit" className="btn btn-secondary btn-sm">
              <EditIcon size={16} />
              {t('profile.edit')}
            </Link>
            <ShareProfile userId={me.id} name={view.name} />
          </div>
        }
        showcase={shown ? { tree: shown.tree, badges: shown.badges, league: shown.league } : undefined}
        notice={me.profilePhotoPending && <PendingPhoto pending={me.profilePhotoPending} words="pictureCheck.held.profile" round />}
        yours={
          <OnlyYou title={t('profile.yourProgress')}>
            <ProfileFacts
              facts={[
                { key: 'longest', label: t('profile.stat.longestStreak'), value: number(me.streak.longest) },
                { key: 'days', label: t('profile.stat.daysLearned'), value: number(me.streak.daysLearned ?? 0) },
                { key: 'freezes', label: t('profile.stat.freezes'), value: number(me.streak.freezes) },
                // The coin leads to where it is spent.
                { key: 'zer', label: 'Zêr', value: zer === null ? '—' : number(zer), icon: <CoinIcon size={15} />, to: '/app/shop' },
              ]}
            />
            <p className="field-hint mkp-yours-hint">
              {maxFreezes > 1 ? t('profile.freezeHintPlus', { count: sessionsPerFreeze, max: maxFreezes }) : t('profile.freezeHint', { count: sessionsPerFreeze })}
            </p>
            {icons.length > 0 && (
              <div className="mkp-collection">
                <div className="mkp-collection-head">
                  <span className="l">{t('profile.stat.icons')}</span>
                  <span className="n">{icons.length}</span>
                </div>
                <AvatarStack urls={icons.map((i) => i.assetUrl)} total={icons.length} square emptyGlyph={false} />
              </div>
            )}
          </OnlyYou>
        }
        activity={<ProfileActivity userId={me.id} sections={sections} own />}
      />
      <DailySheet open={dailyOpen} onClose={() => setDailyOpen(false)} today={today} onStreak={(streak) => setMe((m) => (m ? { ...m, streak } : m))} />
    </>
  );
}

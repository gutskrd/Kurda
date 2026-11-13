import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import type { InventoryItem, MeProfile, ProfileSections, PublicProfile, UserSummary, WalletBalances } from '../lib/types';
import { FullProfile, OnlyYou, ProfileFacts, type FullProfileView } from '../profile/FullProfile';
import { ProfileActivity } from '../profile/ProfileActivity';
import { ProfileProgress } from '../profile/ProfileProgress';
import { ProfileTree } from '../tree/ProfileTree';
import { countryName } from '../lib/countries';
import { AvatarStack } from '../components/AvatarStack';
import { CoinIcon } from '../components/icons';
import { ProfileMenu, ShareProfile } from '../profile/ProfileMenu';
import { ErrorState } from '../components/states';
import { FullProfileSkeleton } from '../components/skeletons';
import { useLocale, useT } from '../i18n/I18nProvider';

/**
 * The signed-in user's own profile: the same page everybody else's is
 * (profile/FullProfile), with what is yours to do in place of the friend
 * actions — edit, share, and the menu of the shop, your friends, your badges
 * and settings — and one section more that only you are shown: the streak
 * numbers a missed day never takes away, your freezes and your Zêr. All
 * editing lives on /app/profile/edit.
 */
export function Profile(): React.JSX.Element {
  const { client, user } = useAuth();
  const t = useT();
  const locale = useLocale();
  const [me, setMe] = useState<MeProfile | null>(null);
  // who you are is known before /me answers, so your public profile (sections,
  // badges, frame) is asked for with the rest rather than after it
  const selfId = user?.id ?? null;
  const [zer, setZer] = useState<number | null>(null);
  // only how many: the faces are on the Friends page, one tap from the number
  const [friendCount, setFriendCount] = useState<number | null>(null);
  const [icons, setIcons] = useState<InventoryItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  const [sections, setSections] = useState<ProfileSections | null>(null);
  // badges, ranks, league and frame: /me does not carry them, your public profile does
  const [shown, setShown] = useState<Pick<PublicProfile, 'ranks' | 'badges' | 'league' | 'frameSku' | 'frameUrl' | 'achievements' | 'tree'> | null>(null);

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
      // an API that predates paging sends no total and no limit: it sent the
      // whole list, so its length is the total
      if (f.ok) setFriendCount(f.data.total ?? (f.data.friends ?? []).length);
      if (inv.ok) setIcons((inv.data.items ?? []).filter((i) => i.category === 'icon'));

      // your own activity sections: /me does not carry them, and the public
      // profile endpoint already works them out the same way it does for
      // everyone else. Asked with the rest, so the badges and the activity are
      // there when the page is, rather than arriving a moment later and
      // pushing everything under them down; asked after, only when who you are
      // was not known yet.
      const id = m.ok ? m.data?.user?.id : undefined;
      const p = early && id === selfId ? early : id ? await client.get<PublicProfile>(`/users/${id}`) : null;
      if (cancelled) return;
      if (p?.ok) {
        setSections(p.data.sections ?? null);
        setShown({ ranks: p.data.ranks, badges: p.data.badges, league: p.data.league, frameSku: p.data.frameSku, frameUrl: p.data.frameUrl, achievements: p.data.achievements, tree: p.data.tree });
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [client, reloadKey, t, selfId]);

  if (loading) return <FullProfileSkeleton label="profile.loadingYours" own />;
  if (error || !me) return <ErrorState title={t('profile.loadFailedYours')} message={error ?? t('profile.unavailable')} onRetry={() => setReloadKey((n) => n + 1)} />;

  const view: FullProfileView = {
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
  };
  const number = (n: number): string => n.toLocaleString(locale);
  const maxFreezes = me.streak.maxFreezes ?? 1;
  const sessionsPerFreeze = me.streak.sessionsPerFreeze ?? 5;

  return (
    <FullProfile
      own
      view={view}
      // what is yours to do: edit, share, and everything that is yours but is not this page behind the menu
      headerAction={
        <div className="profile-actions-row">
          <Link to="/app/profile/edit" className="btn btn-secondary btn-sm">
            {t('profile.edit')}
          </Link>
          <ShareProfile userId={me.id} name={view.name} />
          <ProfileMenu />
        </div>
      }
      progress={
        shown ? (
          <>
            <ProfileTree tree={shown.tree} own />
            <ProfileProgress ranks={shown.ranks} badges={shown.badges} league={shown.league} own />
          </>
        ) : null
      }
      yours={
        <OnlyYou title={t('profile.yourProgress')}>
          <ProfileFacts
            facts={[
              { key: 'longest', label: t('profile.stat.longestStreak'), value: number(me.streak.longest) },
              { key: 'days', label: t('profile.stat.daysLearned'), value: number(me.streak.daysLearned ?? 0) },
              { key: 'freezes', label: t('profile.stat.freezes'), value: number(me.streak.freezes) },
              // the coin leads to where it is spent
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
  );
}

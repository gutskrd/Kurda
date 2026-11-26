import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  LEAGUE_TIERS,
  badgeDef,
  badgeViewFraction,
  badgesInOrder,
  hasTreeArt,
  toLeagueTier,
  type BadgeView,
  type BadgesResponse,
  type CollectionGift,
  type CollectionResponse,
  type ProfileBadge,
  type ProfileLeague,
  type ShowcaseBadge,
  type TreeGlimpse,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import { useOptimistic } from '../lib/optimistic';
import type { PublicProfile } from '../lib/types';
import { useLocale, useT } from '../i18n/I18nProvider';
import { Sheet } from '../components/Sheet';
import { Button, LinkButton } from '../components/Button';
import { Avatar } from '../components/Avatar';
import { ErrorState } from '../components/states';
import { Skeleton } from '../components/Skeleton';
import { CheckIcon, ChevronIcon, GiftIcon, SparkleIcon } from '../components/icons';
import { SegmentedChoice } from '../shop/ItemBrowser';
import { ItemPicture } from '../shop/ItemPicture';
import { GiftLoopArt } from '../gifts/GiftLoop';
import { ItemGlyph } from '../shop/ItemGlyph';
import { Medal, TierPips, formatRarity, progressText } from '../badges/parts';
import { ShowcaseChoices } from '../badges/ShowcasePicker';
import { LeagueEmblem } from '../ranks/art';
import { badgeDesc, badgeNamed, badgeTierNamed, leagueName, leagueNamed, withMeaning } from '../ranks/names';
import { TreeArt } from '../tree/TreeArt';
import { ProfileTree } from '../tree/ProfileTree';
import { healthName, stageName, treeNamed } from '../tree/names';
import './collection.css';

export type CollectionTab = 'badges' | 'icons' | 'gifts';

/** Whose collection it is, with what their profile already says: the sheet reads the rest itself. */
export interface CollectionOwner {
  userId: string;
  /** what the sheet calls them, "Hamo’s collection"; unused on your own */
  name: string;
  own: boolean;
  league?: ProfileLeague | null;
  tree?: TreeGlimpse | null;
  showcase?: readonly ShowcaseBadge[];
  earned?: readonly ProfileBadge[];
}

/** What the sheet shows in place of its tabs: one badge, the tree, the showcase choices, or one gift's people. */
type Step =
  | { kind: 'badge'; key: string }
  | { kind: 'tree' }
  | { kind: 'customise' }
  | { kind: 'gift'; gift: CollectionGift; side: 'received' | 'sent' };

/**
 * A profile's collection in one sheet, opened from the badge row beside the handle: badges (with the league and the
 * tree), icons and gifts, each a grid of square tiles. Your own adds what is still to earn, choosing the three badges
 * shown first, and wearing an icon; somebody else's shows only what they hold, with a way to your own. A tile opens
 * its detail in place, with a way back.
 */
export function CollectionSheet({
  open,
  onClose,
  owner,
  onShowcase,
  onWorn,
}: {
  open: boolean;
  onClose: () => void;
  owner: CollectionOwner;
  /** your own: the three were chosen again, so the row beside the handle follows */
  onShowcase?: (keys: string[]) => void;
  /** your own: another icon is worn, so the face follows */
  onWorn?: () => void;
}): React.JSX.Element {
  const t = useT();
  const { client, user } = useAuth();
  const [tab, setTab] = useState<CollectionTab>('badges');
  // Somebody else's sheet can turn into yours, on the same tab, read from your own profile.
  const [yours, setYours] = useState<CollectionOwner | 'loading' | null>(null);

  useEffect(() => {
    if (!open) return;
    setTab('badges');
    setYours(null);
  }, [open]);

  const viewYours = async (): Promise<void> => {
    if (!user) return;
    setYours('loading');
    const res = await client.get<PublicProfile>(`/users/${user.id}`);
    setYours(
      res.ok
        ? { userId: user.id, name: '', own: true, league: res.data.league, tree: res.data.tree, showcase: res.data.badges, earned: res.data.earnedBadges }
        : { userId: user.id, name: '', own: true },
    );
  };

  const whose = yours && yours !== 'loading' ? yours : owner;
  const title = whose.own ? t('collection.title.own') : t('collection.title.other', { name: whose.name });
  // Yours is a tap away from anybody else's, once you are signed in.
  const toYours = !whose.own && user && user.id !== whose.userId ? viewYours : undefined;

  return (
    <Sheet open={open} onClose={onClose} label={title} className="coll-sheet">
      {yours === 'loading' ? (
        <div className="coll" aria-busy="true">
          <h2 className="coll-title">{t('collection.title.own')}</h2>
          <TileSkeletons />
        </div>
      ) : (
        <CollectionBody
          key={whose.userId}
          whose={whose}
          title={title}
          tab={tab}
          onTab={setTab}
          toYours={toYours}
          onClose={onClose}
          onShowcase={whose.userId === owner.userId ? onShowcase : undefined}
          onWorn={whose.userId === owner.userId ? onWorn : undefined}
        />
      )}
    </Sheet>
  );
}

/** One person's collection: the tabs and their grids, or a step in place of them. */
function CollectionBody({
  whose,
  title,
  tab,
  onTab,
  toYours,
  onClose,
  onShowcase,
  onWorn,
}: {
  whose: CollectionOwner;
  title: string;
  tab: CollectionTab;
  onTab: (tab: CollectionTab) => void;
  toYours?: () => void;
  /** closes the sheet, as a giver's profile opens */
  onClose: () => void;
  onShowcase?: (keys: string[]) => void;
  onWorn?: () => void;
}): React.JSX.Element {
  const t = useT();
  const { client } = useAuth();
  const [step, setStep] = useState<Step | null>(null);
  const [collection, setCollection] = useState<CollectionResponse | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  // Yours only: every badge with its progress, for what is still to earn.
  const [page, setPage] = useState<BadgesResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    setFailed(null);
    void client.get<CollectionResponse>(`/users/${whose.userId}/collection`).then((res) => {
      if (cancelled) return;
      if (res.ok && res.data?.icons && res.data.received) setCollection(res.data);
      else setFailed(res.ok ? t('common.somethingWentWrong') : describeError(res.error, t));
    });
    if (whose.own) {
      void client.get<BadgesResponse>('/me/badges').then((res) => {
        // An answer without its list is read as no answer, as an older server or a cut-off reply may send.
        if (!cancelled && res.ok && Array.isArray(res.data?.badges)) setPage(res.data);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [client, whose.userId, whose.own, attempt, t]);

  // The three shown first change as the choices are saved (lib/optimistic.ts); the server's answer has the last word.
  const heard = (whose.showcase ?? []).map((b) => b.key);
  const [showcase, wantShowcase] = useOptimistic<string[], { showcase?: string[] }>(
    heard,
    (keys) => client.request<{ showcase?: string[] }>('PUT', '/me/badges/showcase', { body: { keys } }),
    { fromAnswer: (answer, sent) => answer.showcase ?? sent, onSaved: (answer, sent) => onShowcase?.(answer.showcase ?? sent) },
  );
  const earned = whose.earned ?? page?.badges.filter((b) => b.tier > 0).map(asProfileBadge);
  const ordered = badgesInOrder(
    showcase.flatMap((k) => (earned ?? whose.showcase ?? []).filter((b) => b.key === k)),
    earned ?? whose.showcase?.map((b) => ({ ...b, earnedAt: null, rarity: null })),
  );

  const back = (): void => setStep(null);
  const retry = (): void => setAttempt((n) => n + 1);

  if (step) {
    return (
      <div className="coll">
        <h2 className="coll-title">{title}</h2>
        <button type="button" className="coll-back" onClick={back}>
          <ChevronIcon size={18} className="coll-back-icon" />
          {t('common.back')}
        </button>
        {step.kind === 'badge' && <BadgeStep badge={ordered.find((b) => b.key === step.key) ?? null} view={page?.badges.find((b) => b.key === step.key) ?? null} />}
        {step.kind === 'tree' && <ProfileTree tree={whose.tree} />}
        {step.kind === 'gift' && <GiftStep gift={step.gift} side={step.side} onPerson={onClose} />}
        {step.kind === 'customise' && (
          <CustomiseStep
            badges={ordered}
            initial={showcase}
            onSave={(keys) => {
              wantShowcase(keys);
              back();
            }}
          />
        )}
      </div>
    );
  }

  const unearned = whose.own && page ? toEarn(page) : null;
  return (
    <div className="coll">
      <h2 className="coll-title">{title}</h2>
      <div className="coll-tabs">
        <SegmentedChoice
          label={title}
          value={tab}
          onChange={onTab}
          options={[
            { value: 'badges', label: t('profile.badges') },
            { value: 'icons', label: t('profile.stat.icons') },
            { value: 'gifts', label: t('collection.gifts') },
          ]}
        />
      </div>

      <div className="coll-body">
        {tab === 'badges' && (
          <>
            <TopCards whose={whose} onTree={() => setStep({ kind: 'tree' })} />
            <section className="coll-section" aria-labelledby="coll-badges">
              <h3 id="coll-badges" className="coll-heading">
                {t('profile.badges')}
              </h3>
              {ordered.length > 0 ? (
                <ul className="coll-grid">
                  {ordered.map((b) => (
                    <li key={b.key}>
                      <button type="button" className="coll-tile" onClick={() => setStep({ kind: 'badge', key: b.key })}>
                        <Medal view={b} size={48} shine={false} />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="coll-empty">{t('collection.noBadges')}</p>
              )}
            </section>
            {whose.own && (
              <section className="coll-section" aria-labelledby="coll-unlock">
                <h3 id="coll-unlock" className="coll-heading">
                  {t('collection.unlock')}
                </h3>
                {unearned ? (
                  <ul className="coll-grid">
                    {unearned.map((b) => {
                      const left = progressText(t, b);
                      return (
                        <li key={b.key}>
                          <button type="button" className="coll-tile is-locked" onClick={() => setStep({ kind: 'badge', key: b.key })}>
                            <Medal view={b} size={48} shine={false} />
                            <span className="coll-bar" aria-hidden="true">
                              <span style={{ width: `${Math.max(6, badgeViewFraction(b) * 100)}%` }} />
                            </span>
                            {left && <span className="sr-only">{left}</span>}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <TileSkeletons />
                )}
              </section>
            )}
          </>
        )}
        {tab === 'icons' && (
          <Loaded collection={collection} failed={failed} onRetry={retry}>
            {(c) => <IconsTab icons={c.icons.items} own={whose.own} onWorn={onWorn} />}
          </Loaded>
        )}
        {tab === 'gifts' && (
          <Loaded collection={collection} failed={failed} onRetry={retry}>
            {(c) => <GiftsTab collection={c} own={whose.own} onOpen={(gift, side) => setStep({ kind: 'gift', gift, side })} />}
          </Loaded>
        )}
      </div>

      {whose.own && tab === 'badges' ? (
        <div className="coll-foot">
          <Button variant="secondary" block disabled={ordered.length === 0} onClick={() => setStep({ kind: 'customise' })}>
            {t('collection.customise')}
          </Button>
        </div>
      ) : toYours ? (
        <div className="coll-foot">
          <Button variant="secondary" block onClick={toYours}>
            {t('collection.viewYours')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** A badge from the badges page as a profile lists it. */
function asProfileBadge(b: BadgeView): ProfileBadge {
  return { key: b.key, family: b.family, tier: b.tier, tierKey: b.tierKey, earnedAt: b.tierEarnedAt[b.tier - 1] ?? b.earnedAt, rarity: b.rarity?.[b.tier - 1] ?? null };
}

/** Badges still to earn, nearest first; a secret not yet found stays out, as on the badges page it is only "???". */
function toEarn(page: BadgesResponse): BadgeView[] {
  return page.badges
    .filter((b) => b.tier === 0 && !b.hidden)
    .map((b, i) => ({ b, f: badgeViewFraction(b), i }))
    .sort((x, y) => y.f - x.f || x.i - y.i)
    .map((x) => x.b);
}

/** The league and the tree side by side over the badges: yours lead to their pages, somebody else's tree opens here. */
function TopCards({ whose, onTree }: { whose: CollectionOwner; onTree: () => void }): React.JSX.Element | null {
  const t = useT();
  const tier = toLeagueTier(whose.league?.tier ?? null);
  const tree = whose.tree;
  const drawn = tree && hasTreeArt(tree.species) ? tree : null;
  if (!tier && !drawn && !(whose.own && tree === null)) return null;

  const league = tier && (
    <>
      <span className="coll-card-art">
        <LeagueEmblem tier={tier} size={44} title="" />
      </span>
      <span className="coll-card-text">
        <span className="coll-card-name">{leagueName(t, tier)}</span>
        <span className="coll-card-line">
          {[leagueNamed(t, tier).meaning, t('collection.leagueLine', { n: LEAGUE_TIERS.indexOf(tier) + 1, total: LEAGUE_TIERS.length })].filter(Boolean).join(' · ')}
        </span>
      </span>
    </>
  );
  const treeCard = drawn ? (
    <>
      <span className="coll-card-art">
        <TreeArt species={drawn.species} stage={drawn.stage} health={drawn.health} size={44} />
      </span>
      <span className="coll-card-text">
        <span className="coll-card-name">{treeNamed(t, drawn.species).name}</span>
        <span className="coll-card-line">{`${stageName(t, drawn.stage)} · ${healthName(t, drawn.health)}`}</span>
      </span>
    </>
  ) : (
    <>
      <span className="coll-card-art">
        <TreeArt species="beru" stage={1} size={44} />
      </span>
      <span className="coll-card-text">
        <span className="coll-card-name">{t('tree.profile.title')}</span>
        <span className="coll-card-line">{t('tree.card.plant')}</span>
      </span>
    </>
  );

  return (
    <div className="coll-cards">
      {league &&
        (whose.own ? (
          <Link to="/app/rankings" className="coll-card">
            {league}
          </Link>
        ) : (
          <div className="coll-card">{league}</div>
        ))}
      {(drawn || (whose.own && tree === null)) &&
        (whose.own ? (
          <Link to="/app/tree" className="coll-card">
            {treeCard}
          </Link>
        ) : (
          <button type="button" className="coll-card" onClick={onTree}>
            {treeCard}
          </button>
        ))}
    </div>
  );
}

/**
 * One badge up close: its name and meaning, what it is for, its tier, when it was earned and how rare that is. Yours
 * adds how far the next tier is; a badge still to earn says what is left.
 */
function BadgeStep({ badge, view }: { badge: ProfileBadge | null; view: BadgeView | null }): React.JSX.Element | null {
  const t = useT();
  const locale = useLocale();
  const shown = view ?? badge;
  if (!shown) return null;
  const named = badgeNamed(t, shown.key);
  const def = badgeDef(shown.key);
  const tierCount = view?.tierCount ?? def?.tiers.length ?? 1;
  const at = badge?.earnedAt ?? (view && view.tier > 0 ? (view.tierEarnedAt[view.tier - 1] ?? view.earnedAt) : null);
  const rarity = badge?.rarity ?? (view && view.tier > 0 ? (view.rarity?.[view.tier - 1] ?? null) : null);
  const progress = view ? progressText(t, view) : null;
  return (
    <div className="coll-detail">
      <span className="coll-detail-art">
        <Medal view={shown} size={112} />
      </span>
      <h3 className="coll-detail-name">{named.name}</h3>
      {named.meaning && <p className="coll-muted">{named.meaning}</p>}
      {badgeDesc(t, shown.key) && <p className="coll-detail-desc">{badgeDesc(t, shown.key)}</p>}
      <ul className="coll-facts">
        {shown.tier > 0 && shown.tierKey && tierCount > 1 && (
          <li>
            <TierPips tier={shown.tier} count={tierCount} />
            {withMeaning(t, badgeTierNamed(t, shown.tierKey))}
          </li>
        )}
        {at && (
          <li>
            <CheckIcon size={15} />
            {t('badges.earnedOn', { date: new Date(at).toLocaleDateString(locale, { dateStyle: 'medium' }) })}
          </li>
        )}
        {rarity != null && (
          <li>
            <SparkleIcon size={15} />
            {t('badges.rarity', { percent: formatRarity(rarity) })}
          </li>
        )}
        {progress && view && (
          <li className="coll-facts-progress">
            <span className="coll-bar is-wide" aria-hidden="true">
              <span style={{ width: `${Math.max(4, badgeViewFraction(view) * 100)}%` }} />
            </span>
            {progress}
          </li>
        )}
      </ul>
    </div>
  );
}

/** Choosing the three shown first, with the badges page's own choices, saved together. */
function CustomiseStep({ badges, initial, onSave }: { badges: readonly ShowcaseBadge[]; initial: readonly string[]; onSave: (keys: string[]) => void }): React.JSX.Element {
  const t = useT();
  const [keys, setKeys] = useState<string[]>(initial.filter((k) => badges.some((b) => b.key === k)));
  return (
    <div className="coll-customise">
      <ShowcaseChoices badges={badges} keys={keys} onChange={setKeys} />
      <div className="coll-foot">
        <Button block onClick={() => onSave(keys)}>
          {t('badges.showcase.save')}
        </Button>
      </div>
    </div>
  );
}

/**
 * The icons they own, the worn one marked, with who gave it where it was a gift; yours are worn with a tap, and tapping
 * the worn one takes it off.
 */
function IconsTab({ icons, own, onWorn }: { icons: CollectionResponse['icons']['items']; own: boolean; onWorn?: () => void }): React.JSX.Element {
  const t = useT();
  const { client } = useAuth();
  const heard = icons.find((i) => i.worn)?.sku ?? null;
  const [worn, wear] = useOptimistic<string | null>(heard, (sku) => client.put('/me/cosmetics/icon', { sku }), { onSaved: () => onWorn?.() });

  if (icons.length === 0) {
    return (
      <div className="coll-none">
        <p className="coll-empty">{t('collection.noIcons')}</p>
        {own && (
          <LinkButton to="/app/shop" variant="secondary" size="sm">
            {t('collection.toShop')}
          </LinkButton>
        )}
      </div>
    );
  }
  return (
    <section className="coll-section">
      {own && <p className="coll-muted">{t('collection.wearHint')}</p>}
      <ul className="coll-grid">
        {icons.map((icon) => {
          const on = icon.sku === worn;
          const art = icon.assetUrl ? <ItemPicture src={icon.assetUrl} /> : <ItemGlyph category="icon" />;
          const giver = on && icon.giftedBy ? (icon.giftedBy.displayName ?? icon.giftedBy.username) : null;
          return (
            <li key={icon.sku}>
              {own ? (
                <button type="button" className={`coll-tile is-item${on ? ' is-on' : ''}`} aria-pressed={on} aria-label={icon.name} onClick={() => wear(on ? null : icon.sku)}>
                  {art}
                </button>
              ) : (
                <span className={`coll-tile is-item${on ? ' is-on' : ''}`} role="img" aria-label={icon.name}>
                  {art}
                </span>
              )}
              {on && <span className="coll-worn">{t('collection.wearing')}</span>}
              {giver && (
                <span className="coll-worn-from" dir="auto">
                  {t('collection.giftFrom', { name: giver })}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Gifts received, as items with how many of each, opening to who gave them; your own adds what you sent. */
function GiftsTab({ collection, own, onOpen }: { collection: CollectionResponse; own: boolean; onOpen: (gift: CollectionGift, side: 'received' | 'sent') => void }): React.JSX.Element {
  const t = useT();
  return (
    <>
      <GiftGrid id="coll-received" heading={t('collection.received')} empty={t('collection.noReceived')} gifts={collection.received.items} onOpen={(g) => onOpen(g, 'received')} giver />
      {own && collection.sent && (
        <GiftGrid id="coll-sent" heading={t('collection.sent')} empty={t('collection.noSent')} gifts={collection.sent.items} onOpen={(g) => onOpen(g, 'sent')} />
      )}
    </>
  );
}

function GiftGrid({
  id,
  heading,
  empty,
  gifts,
  onOpen,
  giver = false,
}: {
  id: string;
  heading: string;
  empty: string;
  gifts: readonly CollectionGift[];
  onOpen: (gift: CollectionGift) => void;
  /** the newest giver's face in the tile's corner, where the reader may see who it is */
  giver?: boolean;
}): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  return (
    <section className="coll-section" aria-labelledby={id}>
      <h3 id={id} className="coll-heading">
        {heading}
      </h3>
      {gifts.length === 0 ? (
        <p className="coll-empty">{empty}</p>
      ) : (
        <ul className="coll-grid">
          {gifts.map((g) => {
            const times = t('collection.times', { count: g.count.toLocaleString(locale) });
            const newest = giver ? g.people[0]?.person : null;
            return (
              <li key={g.sku}>
                <button
                  type="button"
                  className={`coll-tile is-item${newest || g.count > 1 ? ' has-foot' : ''}`}
                  aria-label={g.count > 1 ? `${g.name}, ${times}` : g.name}
                  onClick={() => onOpen(g)}
                >
                  {g.assetUrl ? <ItemPicture src={g.assetUrl} /> : <ItemGlyph category={g.category} />}
                  {newest && (
                    <span className="coll-giver" aria-hidden="true">
                      <Avatar url={newest.avatarUrl} glyphSize={12} />
                    </span>
                  )}
                  {g.count > 1 && (
                    <span className="coll-count" aria-hidden="true">
                      {times}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/**
 * One gift item and each time it came, or went, newest first: "Gift from Hamo" with their face, opening their profile.
 * Somebody the reader may not see is "a Hevalo member", with no face and no link.
 */
function GiftStep({ gift, side, onPerson }: { gift: CollectionGift; side: 'received' | 'sent'; onPerson: () => void }): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const left = gift.count - gift.people.length;
  return (
    <div className="coll-detail">
      <span className="coll-tile is-item coll-gift-art">{gift.assetUrl ? <GiftLoopArt src={gift.assetUrl} lazy={false} /> : <ItemGlyph category={gift.category} size={40} />}</span>
      <h3 className="coll-detail-name">{gift.name}</h3>
      <p className="coll-muted">{t('collection.times', { count: gift.count.toLocaleString(locale) })}</p>
      <ul className="coll-people-list">
        {gift.people.map((p, i) => {
          const name = p.person ? (p.person.displayName ?? p.person.username) : null;
          const line = name
            ? t(side === 'received' ? 'collection.giftFrom' : 'collection.giftTo', { name })
            : t(side === 'received' ? 'collection.giftFromMember' : 'collection.giftToMember');
          const inside = (
            <>
              {p.person ? (
                <Avatar url={p.person.avatarUrl} glyphSize={18} />
              ) : (
                <span className="coll-person-gift" aria-hidden="true">
                  <GiftIcon size={18} />
                </span>
              )}
              <span className="coll-person-name" dir="auto">
                {line}
              </span>
              <span className="coll-person-when">{new Date(p.at).toLocaleDateString(locale, { dateStyle: 'medium' })}</span>
            </>
          );
          return (
            <li key={`${p.person?.id ?? 'member'}-${p.at}-${i}`}>
              {p.person ? (
                <Link to={`/app/users/${p.person.id}`} className="coll-person" onClick={onPerson}>
                  {inside}
                </Link>
              ) : (
                <span className="coll-person">{inside}</span>
              )}
            </li>
          );
        })}
      </ul>
      {left > 0 && <p className="coll-muted">{t('collection.andMore', { count: left.toLocaleString(locale) })}</p>}
    </div>
  );
}

/** The icons and gifts once read; tiles in grey while they load, and a way to try again. */
function Loaded({
  collection,
  failed,
  onRetry,
  children,
}: {
  collection: CollectionResponse | null;
  failed: string | null;
  onRetry: () => void;
  children: (collection: CollectionResponse) => React.ReactNode;
}): React.JSX.Element {
  if (collection) return <>{children(collection)}</>;
  if (failed) return <ErrorState message={failed} onRetry={onRetry} />;
  return <TileSkeletons />;
}

/** A row of tiles in grey, the grid's own shape. */
function TileSkeletons(): React.JSX.Element {
  return (
    <ul className="coll-grid" aria-hidden="true">
      {Array.from({ length: 4 }, (_, i) => (
        <li key={i}>
          <Skeleton className="coll-tile" radius="var(--r-md)" />
        </li>
      ))}
    </ul>
  );
}

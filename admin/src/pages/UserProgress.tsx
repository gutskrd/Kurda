import { useState } from 'react';
import { badgeDef, type AdminPlayerRanks, type RankCard } from '@kurda/shared';
import { api } from '../api';
import {
  ActionMenu,
  Badge,
  Button,
  Drawer,
  EmptyState,
  ErrorState,
  FormActions,
  Loading,
  Section,
  Select,
  Textarea,
  Time,
  UserLink,
  errorLine,
  useLoad,
  useToast,
} from '../ui';
import {
  GAME_NAME,
  REASON_MAX,
  badgeTierName,
  rankLine,
  reasonProblem,
  thresholdText,
  type BadgeCatalogue,
  type UserBadges,
} from '../progress';
import { BadgeArt, PlayerGamesTable, RankEmblem, useResetRating } from './RankParts';

interface Person {
  id: string;
  username: string;
}

// ---- ranks ------------------------------------------------------------------------------

/**
 * The person's rank in each game, as they see it themselves (placing, the "?"
 * while still uncertain, the shield, resting), with a reset; and their latest
 * rated games, each voidable.
 */
export function RanksTab({ user }: { user: Person }): React.JSX.Element {
  const loaded = useLoad(() => api<AdminPlayerRanks>(`/admin/ranks/players/${encodeURIComponent(user.id)}`), [user.id]);
  const reset = useResetRating();
  if (loaded.error != null && !loaded.data) return <ErrorState error={loaded.error} onRetry={() => void loaded.reload()} what="game ranks" />;
  if (!loaded.data) return <Loading rows={4} label="Loading their ranks…" />;
  const { ranks, games } = loaded.data;
  return (
    <>
      <ul className="rank-cards" aria-label="Rank per game">
        {ranks.map((r) => (
          <RankCardView key={r.game} card={r} onReset={() => void reset(user, r.game).then((done) => done && void loaded.reload())} />
        ))}
      </ul>
      <Section title="Latest rated games" description="Their 30 latest, every game. Voiding one works out every later game of everyone it touched again." flush>
        <PlayerGamesTable games={games} onVoided={() => void loaded.reload()} />
      </Section>
    </>
  );
}

function RankCardView({ card: r, onReset }: { card: RankCard; onReset: () => void }): React.JSX.Element {
  const played = r.ratedGames > 0 || (r.placement?.played ?? 0) > 0;
  return (
    <li className="card rank-card">
      <div className="rank-card-head">
        <RankEmblem tier={r.tier} division={r.division} placing={r.placement?.played} size={64} />
        <div className="rank-card-title">
          <span className="subtle">{GAME_NAME[r.game]}</span>
          <strong>{rankLine(r.tier, r.division, r.placement)}</strong>
          <span>
            {r.points.toLocaleString()} points
            {r.provisional && (
              <span className="provisional" aria-hidden="true">
                ?
              </span>
            )}
          </span>
        </div>
      </div>
      <span className="badges">
        {/* said in words, where it was a tooltip on the “?” that a finger never brings up */}
        {r.provisional && <Badge tone="neutral">Still uncertain after placement: the apps show a “?”</Badge>}
        {r.resting && <Badge tone="neutral">Resting: shown as resting to others</Badge>}
        {r.shieldGames > 0 && <Badge tone="info">Shield: {r.shieldGames} more {r.shieldGames === 1 ? 'game' : 'games'}</Badge>}
      </span>
      {r.progress && r.progress.next && (
        <div className="meter">
          <div className="meter-head">
            <span>To {rankLine(r.progress.next.tier, r.progress.next.division)}</span>
            <span className="subtle">{r.progress.pointsToGo} points to go</span>
          </div>
          <div className="progress" role="progressbar" aria-label={`Progress to ${rankLine(r.progress.next.tier, r.progress.next.division)}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(r.progress.fraction * 100)}>
            <div className="progress-bar" style={{ width: `${r.progress.fraction * 100}%` }} />
          </div>
        </div>
      )}
      <dl className="facts is-compact">
        <div>
          <dt>Rated games</dt>
          <dd>
            {r.ratedGames.toLocaleString()}, {r.wins.toLocaleString()} won
          </dd>
        </div>
        <div>
          <dt>This season</dt>
          <dd>
            {r.season.ratedGames} games · peak {r.season.peakPoints.toLocaleString()}
            {r.season.peakTier ? ` (${rankLine(r.season.peakTier, null)})` : ''}
          </dd>
        </div>
        <div>
          <dt>Best ever</dt>
          <dd>{r.bestPoints.toLocaleString()} points</dd>
        </div>
        <div>
          <dt>Last rated game</dt>
          <dd>{r.lastRatedAt ? <Time value={r.lastRatedAt} /> : <span className="subtle">None</span>}</dd>
        </div>
      </dl>
      <div className="rank-card-foot">
        <Button variant="ghost" onClick={onReset} disabled={!played} title={played ? undefined : 'No rating in this game yet'}>
          Reset rating…
        </Button>
      </div>
    </li>
  );
}

// ---- badges -----------------------------------------------------------------------------

type Draft = { key: string; action: 'award' | 'revoke'; tier: number; reason: string };

/**
 * The person's badges: what they have earned, where an admin has held a badge
 * up (a floor a re-count never drops below) or down (a cap it never rises
 * above), every award and revoke with its reason, and a form for another.
 */
export function BadgesTab({ user }: { user: Person }): React.JSX.Element {
  const mine = useLoad(() => api<UserBadges>(`/admin/users/${encodeURIComponent(user.id)}/badges`), [user.id]);
  const catalogue = useLoad(() => api<BadgeCatalogue>('/admin/badges'), []);
  const [draft, setDraft] = useState<Draft | null>(null);
  const error = mine.error ?? catalogue.error;
  if (error != null && (!mine.data || !catalogue.data)) {
    return (
      <ErrorState
        error={error}
        onRetry={() => {
          void mine.reload();
          void catalogue.reload();
        }}
        what="badges"
      />
    );
  }
  if (!mine.data || !catalogue.data) return <Loading rows={4} label="Loading their badges…" />;
  const defs = catalogue.data.badges;
  const nameOf = (key: string): string => defs.find((d) => d.key === key)?.nameKu ?? key;
  const earned = mine.data.badges.filter((b) => b.tier > 0);
  const held = mine.data.badges.filter((b) => b.tier === 0 && b.capTier !== null);

  return (
    <>
      <Section
        title="Earned"
        description="Counted by the server from what they did. An award sets a floor the count never drops below; a revoke a cap it never rises above."
        actions={
          <Button variant="primary" icon="plus" onClick={() => setDraft({ key: defs[0]?.key ?? '', action: 'award', tier: 1, reason: '' })}>
            Award or revoke…
          </Button>
        }
      >
        {earned.length === 0 ? (
          <EmptyState title="No badge yet" icon="award" compact />
        ) : (
          <ul className="earned-grid" aria-label="Earned badges">
            {earned.map((b) => {
              const def = defs.find((d) => d.key === b.key);
              const tiers = def?.tiers.length ?? 1;
              const next = def && b.tier < tiers ? def.tiers[b.tier] : undefined;
              return (
                <li key={b.key} className="earned">
                  <BadgeArt badgeKey={b.key} tier={b.tier} tiers={tiers} size={56} />
                  <div className="earned-text">
                    <strong lang="ku">{nameOf(b.key)}</strong>
                    <span className="subtle">
                      {tiers > 1 ? badgeTierName(b.tier) : 'Earned'}
                      {!def && ' · retired badge'}
                    </span>
                    <span className="subtle">
                      {b.progress.toLocaleString()} counted{next !== undefined && def ? ` · next tier at ${thresholdText(def, next)}` : ''}
                    </span>
                    {(b.floorTier > 0 || b.capTier !== null) && (
                      <span className="badges">
                        {b.floorTier > 0 && <Badge tone="info">Held at {badgeTierName(b.floorTier).split(' ')[0]} or above</Badge>}
                        {b.capTier !== null && <Badge tone="warn">Capped at {b.capTier === 0 ? 'none' : badgeTierName(b.capTier).split(' ')[0]}</Badge>}
                      </span>
                    )}
                  </div>
                  <ActionMenu
                    label={`More for ${nameOf(b.key)}`}
                    items={[
                      { label: 'Award a higher tier…', onSelect: () => setDraft({ key: b.key, action: 'award', tier: Math.min(b.tier + 1, tiers), reason: '' }), disabled: b.tier >= tiers },
                      { label: 'Revoke…', tone: 'danger', onSelect: () => setDraft({ key: b.key, action: 'revoke', tier: b.tier - 1, reason: '' }) },
                    ]}
                  />
                </li>
              );
            })}
          </ul>
        )}
        {held.length > 0 && (
          <p className="note">
            Revoked to nothing, and held there: {held.map((b) => nameOf(b.key)).join(', ')}.
          </p>
        )}
      </Section>

      <Section title="Awards and revokes" description="Every change an admin made to their badges, newest first.">
        {mine.data.actions.length === 0 ? (
          <p className="section-text subtle">None.</p>
        ) : (
          <ol className="history-list">
            {mine.data.actions.map((a, i) => (
              <li key={`${a.at}-${i}`}>
                <Time value={a.at} mode="absolute" />
                <span>
                  <strong>
                    {a.action === 'award' ? 'Awarded' : 'Revoked'} {nameOf(a.key)} {a.action === 'award' ? 'up to' : 'down to'}{' '}
                    {a.tier === 0 ? 'nothing' : badgeTierName(a.tier)}
                  </strong>{' '}
                  · {a.adminId ? <UserLink user={{ id: a.adminId }} /> : 'an admin since removed'}
                </span>
                <span className="cell-sub" dir="auto">
                  {a.reason}
                </span>
              </li>
            ))}
          </ol>
        )}
      </Section>

      {draft && (
        <BadgeDrawer
          user={user}
          draft={draft}
          defs={defs}
          current={(key) => mine.data!.badges.find((b) => b.key === key)?.tier ?? 0}
          onClose={() => setDraft(null)}
          onDone={() => {
            setDraft(null);
            void mine.reload();
          }}
        />
      )}
    </>
  );
}

function BadgeDrawer({
  user,
  draft: initial,
  defs,
  current,
  onClose,
  onDone,
}: {
  user: Person;
  draft: Draft;
  defs: BadgeCatalogue['badges'];
  current: (key: string) => number;
  onClose: () => void;
  onDone: () => void;
}): React.JSX.Element {
  const toast = useToast();
  const [draft, setDraft] = useState(initial);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const def = defs.find((d) => d.key === draft.key) ?? badgeDef(draft.key);
  const tiers = def?.tiers.length ?? 1;
  const have = current(draft.key);
  const tierOptions =
    draft.action === 'award'
      ? Array.from({ length: tiers }, (_, i) => i + 1)
      : Array.from({ length: tiers + 1 }, (_, i) => i);
  const tier = tierOptions.includes(draft.tier) ? draft.tier : tierOptions[0]!;
  const problem = reasonProblem(draft.reason);
  const label = (t: number): string => (t === 0 ? 'Nothing (take it away)' : tiers === 1 ? 'Earned' : badgeTierName(t));

  async function send(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setTried(true);
    if (problem) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ key: string; tier: number }>(`/admin/users/${encodeURIComponent(user.id)}/badges/${encodeURIComponent(draft.key)}`, {
        method: 'POST',
        body: { action: draft.action, tier, reason: draft.reason.trim() },
      });
      const name = def?.nameKu ?? draft.key;
      toast.success(
        draft.action === 'award'
          ? `@${user.username} holds ${name} at ${r.tier === 0 ? 'nothing' : label(r.tier)}${r.tier > have ? ', and is told about it' : ''}.`
          : `${name} is ${r.tier === 0 ? 'taken away' : `held at ${label(r.tier)}`} for @${user.username}.`,
      );
      onDone();
    } catch (err) {
      setError(errorLine(err, 'badges'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title={`A badge for @${user.username}`}
      footer={
        <FormActions>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <Button type="submit" form="badge-change" variant={draft.action === 'revoke' ? 'danger' : 'primary'} busy={busy}>
            {draft.action === 'award' ? 'Award it' : 'Revoke it'}
          </Button>
        </FormActions>
      }
    >
      <form id="badge-change" className="form" noValidate onSubmit={(e) => void send(e)}>
        <div className="badge-pick">
          {def && <BadgeArt badgeKey={draft.key} tier={draft.action === 'award' ? tier : Math.max(tier, 0)} tiers={tiers} size={64} />}
          <Select
            label="Badge"
            value={draft.key}
            onChange={(e) => setDraft({ ...draft, key: e.target.value })}
            options={defs.map((d) => ({ value: d.key, label: `${d.nameKu} (${d.meaningEn})${current(d.key) > 0 ? ` · has ${d.tiers.length === 1 ? 'it' : badgeTierName(current(d.key)).split(' ')[0]}` : ''}` }))}
            hint={`They hold it at: ${have === 0 ? 'nothing' : label(have)}.`}
          />
        </div>
        <Select
          label="Change"
          value={draft.action}
          onChange={(e) => setDraft({ ...draft, action: e.target.value as Draft['action'], tier: e.target.value === 'award' ? Math.max(have + 1, 1) : Math.max(have - 1, 0) })}
          options={[
            { value: 'award', label: 'Award: hold it at least at a tier' },
            { value: 'revoke', label: 'Revoke: hold it at most at a tier' },
          ]}
          hint={
            draft.action === 'award'
              ? 'They are told, like any badge they earn. The count never drops it below this tier.'
              : 'Quiet: they are not told. The count never raises it above this tier, and it leaves their profile when nothing of it is left.'
          }
        />
        <Select label={draft.action === 'award' ? 'Up to' : 'Down to'} value={String(tier)} onChange={(e) => setDraft({ ...draft, tier: Number(e.target.value) })} options={tierOptions.map((t) => ({ value: String(t), label: label(t) }))} />
        <Textarea
          label="Why (kept with the change and in the audit log)"
          value={draft.reason}
          onChange={(e) => setDraft({ ...draft, reason: e.target.value })}
          maxLength={REASON_MAX}
          rows={3}
          required
          error={tried && problem ? problem : undefined}
        />
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
      </form>
    </Drawer>
  );
}

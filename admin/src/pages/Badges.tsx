import { useState } from 'react';
import { BADGE_FAMILIES, RARITY_MIN_ACTIVE_USERS, type BadgeFamily } from '@kurda/shared';
import { api } from '../api';
import { Badge, Button, EmptyState, ErrorState, Loading, PageHeader, Section, Select, Tabs, Time, errorLine, useLoad, useToast } from '../ui';
import { FAMILY_NAME, badgeTierName, thresholdText, type BadgeCatalogue } from '../progress';
import { BadgeArt } from './RankParts';

type Def = BadgeCatalogue['badges'][number];

/**
 * The badge catalogue for staff (contract 4, §B): every badge with its art,
 * what each tier asks for, how many hold it and how rare it is among active
 * learners — rarity is computed nightly, and the apps show it only once there
 * are enough active learners for a share to mean something. Awarding or
 * revoking one person's badge is on their page (#/users/<id>/badges).
 */
export function Badges(): React.JSX.Element {
  const loaded = useLoad(() => api<BadgeCatalogue>('/admin/badges'), []);
  const toast = useToast();
  const [family, setFamily] = useState<'all' | BadgeFamily>('all');
  const [tier, setTier] = useState(4);
  const [busy, setBusy] = useState(false);
  const c = loaded.data;

  async function recompute(): Promise<void> {
    setBusy(true);
    try {
      const r = await api<{ activeUsers: number }>('/admin/badges/rarity', { method: 'POST' });
      toast.success(
        r.activeUsers >= RARITY_MIN_ACTIVE_USERS
          ? `Rarity counted over ${r.activeUsers.toLocaleString()} active learners.`
          : `Counted over ${r.activeUsers.toLocaleString()} active learners: under ${RARITY_MIN_ACTIVE_USERS}, so the apps keep it hidden.`,
      );
      await loaded.reload();
    } catch (err) {
      toast.error(errorLine(err, 'badges'));
    } finally {
      setBusy(false);
    }
  }

  const shown = c ? c.badges.filter((b) => family === 'all' || b.family === family) : [];
  return (
    <div>
      <PageHeader
        title="Badges"
        subtitle="Seven families, each badge in up to four tiers: Sifir, Zîv, Zêr and Firûze (copper, silver, gold, turquoise). The server counts them from what people did; nobody earns one by asking."
        actions={
          <Button onClick={() => void recompute()} busy={busy} icon="refresh">
            {busy ? 'Counting…' : 'Count rarity now'}
          </Button>
        }
      />
      {loaded.error != null && !c ? (
        <ErrorState error={loaded.error} onRetry={() => void loaded.reload()} what="badges" />
      ) : !c ? (
        <Loading rows={6} label="Loading the badges…" />
      ) : (
        <>
          <Section>
            <dl className="facts">
              <div>
                <dt>Rarity last counted</dt>
                <dd>{c.rarityComputedAt ? <Time value={c.rarityComputedAt} mode="absolute" /> : <span className="subtle">Not yet: it runs nightly</span>}</dd>
              </div>
              <div>
                <dt>Active learners then</dt>
                <dd>
                  {c.activeUsers === null ? '—' : c.activeUsers.toLocaleString()}
                  {c.activeUsers !== null && c.activeUsers < RARITY_MIN_ACTIVE_USERS && (
                    <span className="cell-sub">Under {RARITY_MIN_ACTIVE_USERS}: the apps do not show rarity yet. The shares here are for you.</span>
                  )}
                </dd>
              </div>
            </dl>
          </Section>
          <div className="badge-tools">
            <Tabs
              label="Family"
              value={family}
              onChange={setFamily}
              items={[{ key: 'all' as const, label: 'All' }, ...BADGE_FAMILIES.map((f) => ({ key: f, label: FAMILY_NAME[f], count: c.badges.filter((b) => b.family === f).length }))]}
            />
            <Select
              label="Draw at"
              fieldClassName="is-inline"
              value={String(tier)}
              onChange={(e) => setTier(Number(e.target.value))}
              options={[1, 2, 3, 4].map((t) => ({ value: String(t), label: badgeTierName(t) }))}
            />
          </div>
          {shown.length === 0 ? (
            <EmptyState title="No badge in this family" compact />
          ) : (
            <ul className="badge-grid" aria-label="Badges">
              {shown.map((b) => (
                <BadgeCard key={b.key} def={b} tier={tier} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function BadgeCard({ def, tier }: { def: Def; tier: number }): React.JSX.Element {
  const tiers = def.tiers.length;
  return (
    <li className="card badge-card">
      <div className="badge-card-head">
        <BadgeArt badgeKey={def.key} tier={Math.min(tier, tiers)} tiers={tiers} size={72} />
        <div className="badge-card-title">
          <strong lang="ku">{def.nameKu}</strong>
          <span className="subtle">{def.meaningEn}</span>
          <span className="badges">
            <Badge>{FAMILY_NAME[def.family]}</Badge>
            {def.secret && def.family !== 'secret' && <Badge tone="info">Secret</Badge>}
            {tiers === 1 && <Badge>Single</Badge>}
          </span>
        </div>
      </div>
      <p className="badge-card-measure subtle">
        Counts <span className="mono">{def.measure.replace(/_/g, ' ')}</span>
      </p>
      <table className="badge-tiers">
        <caption className="sr-only">Tiers of {def.nameKu}</caption>
        <thead>
          <tr>
            <th scope="col">Tier</th>
            <th scope="col">Needs</th>
            <th scope="col" className="is-end">
              Holders
            </th>
            <th scope="col" className="is-end">
              Rarity
            </th>
          </tr>
        </thead>
        <tbody>
          {def.tiers.map((t, i) => (
            <tr key={i}>
              <th scope="row">
                <span className={`tier-dot tier-dot-${i + 1}`} aria-hidden="true" />
                {tiers === 1 ? 'Earned' : badgeTierName(i + 1).split(' ')[0]}
              </th>
              <td>{thresholdText(def, t)}</td>
              <td className="is-end">{(def.holders[i] ?? 0).toLocaleString()}</td>
              <td className="is-end">{def.rarity?.[i] !== undefined ? `${def.rarity[i]}%` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </li>
  );
}

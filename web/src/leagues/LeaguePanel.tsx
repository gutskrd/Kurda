import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { useT } from '../i18n/I18nProvider';
import { countdown, tierMeta, zoneDestination, zoneFor, type Zone } from './format';

interface StandingRow {
  userId: string;
  username: string;
  weeklyXp: number;
  rank: number;
  isSelf: boolean;
}

interface LeagueView {
  tier: string;
  weekKey: string;
  rank: number;
  promoteCount: number;
  demoteCount: number;
  standings: StandingRow[];
}

/**
 * This week's league cohort (KUR-062), which the browser has never shown.
 *
 * Rankings has had the global leaderboards from the start and `GET /me/league`
 * went uncalled, so XP earned in the browser counted towards a promotion only
 * the phone could tell you about. The cohort is thirty people and the weekly
 * question is which of them move up and which drop — a different question from
 * the boards below, which is why it sits above them rather than as another tab.
 *
 * Fetched once. A cohort settles when the week closes, not while somebody is
 * reading it, so there is nothing here worth re-reading on an interval.
 */
export function LeaguePanel(): React.JSX.Element | null {
  const { client } = useAuth();
  const t = useT();
  const [league, setLeague] = useState<LeagueView | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    void client.get<LeagueView>('/me/league').then((res) => {
      if (res.ok) setLeague(res.data);
      else setFailed(true);
    });
  }, [client]);

  /*
   * Nothing at all while it loads or if it fails. This is an extra panel above
   * a page that works without it, so a skeleton or an error box here would
   * push the leaderboards down to announce something the reader did not ask
   * for — `leagues.noLeague` is for the real answer "you are not in one yet".
   */
  if (failed) return null;
  if (!league) return null;

  const meta = tierMeta(league.tier);
  const tierLabel = meta.labelKey ? t(meta.labelKey) : meta.label;
  const endsIn = countdown(league.weekKey);
  const total = league.standings.length;

  return (
    <section className="card" style={{ marginBottom: 20 }} aria-labelledby="league-heading">
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <h2 id="league-heading" style={{ margin: 0, fontSize: '1.05rem' }}>
          {t('leagues.tierName', { emoji: meta.emoji, tier: tierLabel })}
        </h2>
        {/* nothing once the week is over: see `countdown` */}
        {endsIn ? <span className="badge">{t('leagues.endsIn', { time: endsIn })}</span> : null}
      </div>

      {total === 0 ? (
        <p className="muted" style={{ margin: '12px 0 0' }}>
          {t('leagues.noLeague')}
        </p>
      ) : (
        <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
          {league.standings.map((row) => {
            const zone = zoneFor(row.rank, total, league.promoteCount, league.demoteCount);
            return (
              <div
                key={row.userId}
                className={`rank-row${row.isSelf ? ' rank-me' : ''}`}
                style={{ borderLeft: `4px solid ${edgeColor(zone, meta.color)}` }}
              >
                <span className="rank-pos">#{row.rank}</span>
                <span className="rank-name">{row.isSelf ? t('games.you') : row.username}</span>
                <span className="rank-score">
                  {row.weeklyXp.toLocaleString()} {t('rankings.unit.xp')}
                </span>
                <Destination tier={league.tier} zone={zone} />
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/**
 * Where this row is heading, named rather than coloured.
 *
 * The phone marks the zones with a coloured edge and nothing else, which tells
 * a screen reader — and anyone who cannot separate its red from its green —
 * nothing at all. Naming the destination tier says what the colour was for, in
 * a language the reader chose, using the ten tier names that were already
 * translated. The arrow is decorative and marked as such.
 */
function Destination({ tier, zone }: { tier: string; zone: Zone }): React.JSX.Element | null {
  const t = useT();
  const dest = zoneDestination(tier, zone);
  if (!dest) return null;
  const meta = tierMeta(dest);
  const label = meta.labelKey ? t(meta.labelKey) : meta.label;
  return (
    <span className="badge" style={{ borderColor: meta.color }}>
      <span aria-hidden="true">{zone === 'promotion' ? '↑' : '↓'}</span>
      {t('leagues.tierName', { emoji: meta.emoji, tier: label })}
    </span>
  );
}

/** Promotion and demotion get the edge; a safe row takes the tier's own colour. */
function edgeColor(zone: Zone, tierColor: string): string {
  if (zone === 'promotion') return 'var(--success)';
  if (zone === 'demotion') return 'var(--danger)';
  return tierColor;
}

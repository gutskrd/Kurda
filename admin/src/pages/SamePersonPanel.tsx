import { useState } from 'react';
import { api } from '../api';
import { RELATION_NAME, RETURN_STATUS_NAME, STRENGTH_NAME, STRENGTH_TONE, signalName, type PanelPage } from '../bans';
import { Badge, Button, EmptyState, ErrorState, Loading, Section, Time, UserLink, useLoad } from '../ui';

/** Rows per page of the panel. */
export const PANEL_PAGE = 20;

/**
 * "Possibly the same person as…" on a person's page (GET /admin/users/:id/possible-matches): every account that may be
 * their return or that they may have come back as, and every account they share a device or a quiet network with, each
 * with the signals, how strong, and when, a page at a time. Deciding is on the Possible returns page.
 */
export function SamePersonPanel({ user }: { user: { id: string; username: string } }): React.JSX.Element {
  const [offset, setOffset] = useState(0);
  const page = useLoad(
    () => api<PanelPage>(`/admin/users/${encodeURIComponent(user.id)}/possible-matches?offset=${offset}&limit=${PANEL_PAGE}`),
    [user.id, offset],
  );
  const data = page.data;
  return (
    <Section
      title="Possibly the same person as…"
      description="Signals this account shares with others: the same phone, sign-in or address are strong; a network on its own never is, and busy networks (schools, carriers, VPNs) never count."
    >
      {page.error != null && !data ? (
        <ErrorState error={page.error} onRetry={() => void page.reload()} what="possible matches" compact />
      ) : !data ? (
        <Loading rows={2} label="Comparing with other accounts…" />
      ) : data.items.length === 0 ? (
        <EmptyState title="Nobody shares anything with this account" icon="check" compact>
          No other account used the same phone, sign-in, address or quiet network.
        </EmptyState>
      ) : (
        <>
          <ol className="same-person-list" aria-label={`Accounts that may be the same person as @${user.username}`}>
            {data.items.map((e) => (
              <li key={`${e.relation}-${e.other.id}`} className="same-person">
                <div className="same-person-head">
                  <span className="subtle">{RELATION_NAME[e.relation]}</span>
                  <UserLink user={e.other} />
                  <Badge tone={STRENGTH_TONE[e.strength]}>{STRENGTH_NAME[e.strength]}</Badge>
                  {e.other.unavailable && <Badge tone="bad">Banned or suspended</Badge>}
                  {e.other.held && <Badge tone="warn">Held</Badge>}
                  {e.status && e.status !== 'open' && <Badge>{RETURN_STATUS_NAME[e.status]}</Badge>}
                  {e.status === 'open' && (
                    <a className="button-link" href="#/possible-returns">
                      Decide on Possible returns
                    </a>
                  )}
                </div>
                <ul className="signal-list">
                  {e.signals.map((s) => (
                    <li key={`${s.kind}-${s.at}`}>
                      <Badge tone={STRENGTH_TONE[s.strength]}>{STRENGTH_NAME[s.strength]}</Badge> {signalName(s.kind)}
                      {s.days !== undefined && s.days > 1 ? ` · ${s.days} days` : ''} · <Time value={s.at} />
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
          <div className="pager" role="group" aria-label="Pages">
            <span className="subtle">
              {offset + 1}–{offset + data.items.length} of {data.total}
            </span>
            <Button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PANEL_PAGE))}>
              Previous
            </Button>
            <Button disabled={data.nextOffset === null} onClick={() => data.nextOffset !== null && setOffset(data.nextOffset)}>
              Next
            </Button>
          </div>
        </>
      )}
    </Section>
  );
}

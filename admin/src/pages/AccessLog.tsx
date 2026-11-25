import { useState } from 'react';
import type { AccessLogEntry, AccessLogPage, SafetyReview } from '@kurda/shared';
import { api } from '../api';
import { accessWhat, accessWhy, reasonLabel } from '../messageAccess';
import { href } from '../navigation';
import { Button, EmptyState, ErrorState, Loading, PageHeader, Section, Table, Time, UserLink, errorLine, useLoad, useToast, type Column } from '../ui';

const PAGE = 50;

/**
 * The Access log (#/access-log), for every admin: each time staff opened someone's letters or private messages, who
 * did, whose they were, when and why, and the safety reviews open now. What was read is never kept here, nor with whom
 * the person was writing; superadmins find which conversation in the audit log.
 */
export function AccessLog(): React.JSX.Element {
  const first = useLoad(() => api<AccessLogPage>(`/admin/message-access/log?limit=${PAGE}`), []);
  const [older, setOlder] = useState<AccessLogEntry[]>([]);
  const [cursor, setCursor] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const next = cursor === undefined ? first.data?.nextCursor ?? null : cursor;
  const entries = first.data ? [...first.data.entries, ...older] : null;

  async function loadOlder(): Promise<void> {
    if (!next) return;
    setBusy(true);
    try {
      const res = await api<AccessLogPage>(`/admin/message-access/log?limit=${PAGE}&before=${encodeURIComponent(next)}`);
      setOlder((prev) => [...prev, ...res.entries]);
      setCursor(res.nextCursor);
    } catch (err) {
      toast.error(errorLine(err, 'the Access log'));
    } finally {
      setBusy(false);
    }
  }

  const openColumns: ReadonlyArray<Column<SafetyReview>> = [
    { key: 'whose', header: 'Whose', card: 'title', cell: (r) => <UserLink user={r.subject} /> },
    { key: 'reader', header: 'Read by', cell: (r) => <UserLink user={r.reviewer} /> },
    { key: 'by', header: 'Opened by', cell: (r) => <UserLink user={r.grantedBy} /> },
    {
      key: 'why',
      header: 'Why',
      cell: (r) => (
        <>
          <strong>{reasonLabel(r.reason)}</strong>
          {r.note && (
            <span className="cell-sub" dir="auto">
              {r.note}
            </span>
          )}
        </>
      ),
    },
    { key: 'until', header: 'Until', cell: (r) => <Time value={r.expiresAt} mode="absolute" /> },
  ];

  const columns: ReadonlyArray<Column<AccessLogEntry>> = [
    {
      key: 'what',
      header: 'What',
      card: 'title',
      cell: (e) => (
        <>
          <strong>{accessWhat(e)}</strong>
          {e.caseId && e.kind === 'case' && (
            <span className="cell-sub">
              <a href={href('moderation', e.caseId)}>Case {e.caseId.slice(0, 8)}</a>
            </span>
          )}
        </>
      ),
    },
    { key: 'when', header: 'When', cell: (e) => <Time value={e.at} mode="absolute" /> },
    { key: 'who', header: 'Who', cell: (e) => <UserLink user={e.staff} /> },
    { key: 'whose', header: 'Whose', cell: (e) => (e.subject ? <UserLink user={e.subject} /> : <span className="subtle">—</span>) },
    {
      key: 'why',
      header: 'Why',
      cell: (e) => (
        <>
          {accessWhy(e)}
          {e.kind === 'granted' && e.review?.note && (
            <span className="cell-sub" dir="auto">
              {e.review.note}
            </span>
          )}
        </>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Access log"
        subtitle={
          'Every time staff opened someone’s letters or private messages: who, whose, when and why. ' +
          'Every admin can read it, and nothing here can be changed. What was read is never kept in it; the note behind each review ' +
          'and the case it names are for superadmins.'
        }
      />
      {first.error != null && !first.data ? (
        <ErrorState error={first.error} onRetry={() => void first.reload()} what="the Access log" />
      ) : !first.data ? (
        <Loading rows={5} label="Loading the Access log…" />
      ) : (
        <>
          <Section title="Safety reviews open now" flush>
            {first.data.open.length === 0 ? (
              <EmptyState title="None is open" icon="lock" compact>
                Nobody can read anyone’s letters or private chats beyond their cases.
              </EmptyState>
            ) : (
              <Table caption="Safety reviews open now" columns={openColumns} rows={first.data.open} rowKey={(r) => r.id} empty="None." />
            )}
          </Section>
          <Section title="Log" flush>
            <Table
              caption="Access log entries"
              columns={columns}
              rows={entries}
              rowKey={(e) => e.id}
              what="the Access log"
              wide="medium"
              empty="Nobody has opened anyone’s letters or messages yet."
            />
            {next && (
              <div className="load-more">
                <Button onClick={() => void loadOlder()} busy={busy}>
                  Older entries
                </Button>
              </div>
            )}
          </Section>
        </>
      )}
    </div>
  );
}

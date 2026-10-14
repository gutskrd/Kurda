import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CaseDetail, DecisionTarget } from '@kurda/shared';
import { api } from '../api';
import { useAuth } from '../auth';
import { go } from '../nav';
import {
  PRIORITY_NAME,
  PRIORITY_TONE,
  categoryName,
  initialDraft,
  isOpenStatus,
  neighbourCase,
  newAction,
  queueOrder,
  slaState,
  sourceName,
  statusName,
  statusTone,
  targetName,
  type DecisionDraft,
} from '../moderation';
import { Badge, Banner, Button, Drawer, ErrorState, Icon, Loading, PageHeader, Time, errorLine, useLoad, useMediaQuery, useToast } from '../ui';
import { CopyrightPanel, Evidence } from './CaseEvidence';
import { ReportersPanel, SubjectPanel } from './CasePeople';
import { CaseSanctions, Escalations, History, Notes } from './CaseRecord';
import { DecisionPanel } from './DecisionPanel';

/** Beside the case from this width; below it, a bar at the bottom that opens the panel as a sheet. */
const SIDE_BY_SIDE = '(min-width: 1200px)';
/** A held claim is renewed this long before it runs out… */
const RENEW_BEFORE_MS = 2 * 60_000;
/** …when its holder clicked or typed within this long. */
const ACTIVE_WITHIN_MS = 10 * 60_000;

/**
 * One case (#/moderation/<caseId>): what was reported, who it is about and
 * who reported it, what was done before, notes and history — and the
 * decision. On a wide screen the decision sits beside the case and stays in
 * view; on a phone the case reads top to bottom (content, then the people)
 * and the decision is a bar at the bottom that opens as a sheet, where a
 * thumb reaches it.
 *
 * j and k go to the next and previous case in the queue as it was last
 * listed, c claims this one — the shortcuts moderation tools share.
 */
export function CaseView({ caseId }: { caseId: string }): React.JSX.Element {
  const loaded = useLoad(() => api<CaseDetail>(`/admin/moderation/cases/${caseId}`), [caseId]);
  const detail = loaded.data;
  const { me } = useAuth();
  const toast = useToast();
  const wide = useMediaQuery(SIDE_BY_SIDE);
  const [sheet, setSheet] = useState(false);
  const [draft, setDraftState] = useState<DecisionDraft | null>(null);
  const [claiming, setClaiming] = useState(false);
  const aside = useRef<HTMLElement>(null);

  // a fresh draft for each case, from its own rule; kept while the same case reloads
  const draftFor = useRef<string | null>(null);
  useEffect(() => {
    if (detail && draftFor.current !== detail.case.id) {
      draftFor.current = detail.case.id;
      setDraftState(initialDraft(detail.case.policy ?? detail.case.category));
    }
  }, [detail]);
  const setDraft = useCallback((change: (d: DecisionDraft) => DecisionDraft) => setDraftState((d) => (d ? change(d) : d)), []);

  const order = useMemo(() => queueOrder(), []);
  const prev = neighbourCase(caseId, -1, order.ids);
  const next = neighbourCase(caseId, 1, order.ids);
  const backHref = `#/moderation${order.query ? `?${order.query}` : ''}`;

  const claimedBy = detail?.case.claimedBy ?? null;
  const mine = !!claimedBy && !!me && claimedBy.id === me.id;
  const open = detail ? isOpenStatus(detail.case.status) : false;

  const claim = useCallback(async (): Promise<void> => {
    setClaiming(true);
    try {
      await api(`/admin/moderation/cases/${caseId}/claim`, { method: 'POST' });
      toast.success('Claimed for 15 minutes. Nobody else can decide it while you hold it.');
      await loaded.reload();
    } catch (err) {
      toast.error(errorLine(err, 'moderation'));
    } finally {
      setClaiming(false);
    }
  }, [caseId, loaded, toast]);

  async function release(): Promise<void> {
    setClaiming(true);
    try {
      await api(`/admin/moderation/cases/${caseId}/release`, { method: 'POST' });
      toast.info('Let go. Anyone can pick it up.');
      await loaded.reload();
    } catch (err) {
      toast.error(errorLine(err, 'moderation'));
    } finally {
      setClaiming(false);
    }
  }

  // A claim lasts 15 minutes. While the moderator who holds it is still at
  // work on the case (they clicked or typed in the last few minutes), it is
  // renewed shortly before it runs out, so a long read or a careful statement
  // never loses the case to someone else. A tab left open and untouched lets
  // it lapse, so nobody holds a case they walked away from.
  const lastActive = useRef(Date.now());
  useEffect(() => {
    const touch = (): void => {
      lastActive.current = Date.now();
    };
    window.addEventListener('pointerdown', touch);
    window.addEventListener('keydown', touch);
    return () => {
      window.removeEventListener('pointerdown', touch);
      window.removeEventListener('keydown', touch);
    };
  }, []);
  const leaseUntil = detail?.case.leaseUntil ?? null;
  const reload = loaded.reload;
  useEffect(() => {
    // a claim that already ran out is the queue's again: claiming it is a choice, not a renewal
    if (!mine || !open || !leaseUntil || Date.parse(leaseUntil) <= Date.now()) return;
    const renewIn = Math.max(0, Date.parse(leaseUntil) - Date.now() - RENEW_BEFORE_MS);
    const timer = window.setTimeout(() => {
      if (Date.now() - lastActive.current > ACTIVE_WITHIN_MS) return;
      api(`/admin/moderation/cases/${caseId}/claim`, { method: 'POST' })
        .catch(() => undefined) // the reload below shows who holds it now
        .finally(() => void reload());
    }, renewIn);
    return () => window.clearTimeout(timer);
  }, [mine, open, leaseUntil, caseId, reload]);

  // j / k / c, never while typing or with a dialog open
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest('input, textarea, select, [contenteditable], [role="dialog"], [role="alertdialog"], [role="menu"]')) return;
      if (document.body.classList.contains('has-layer')) return;
      if (e.key === 'j' && next) {
        e.preventDefault();
        go(`moderation/${next}`);
      } else if (e.key === 'k' && prev) {
        e.preventDefault();
        go(`moderation/${prev}`);
      } else if (e.key === 'c' && open && !claimedBy && !claiming) {
        e.preventDefault();
        void claim();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev, open, claimedBy, claiming, claim]);

  if (loaded.error && !detail) {
    return (
      <div>
        <PageHeader back={{ href: backHref, label: 'Queue' }} title="Case" />
        <ErrorState error={loaded.error} onRetry={() => void loaded.reload()} what="moderation" />
      </div>
    );
  }
  if (!detail || !draft) {
    return (
      <div>
        <PageHeader back={{ href: backHref, label: 'Queue' }} title="Case" />
        <Loading rows={6} label="Loading the case…" />
      </div>
    );
  }

  const c = detail.case;
  const subject = detail.subject;
  const reporterName = (id: string): string | null => detail.reports.find((r) => r.reporter?.id === id)?.reporter?.username ?? null;
  const names = (target: DecisionTarget): string => {
    if (target === 'subject') return subject ? `@${subject.username}` : 'the reported person';
    const name = reporterName(target.slice('reporter:'.length));
    return name ? `@${name}` : 'the reporter';
  };
  const nameOfUser = (userId: string | null): string => {
    if (!userId) return 'a deleted account';
    if (subject && userId === subject.id) return `@${subject.username}`;
    const r = reporterName(userId);
    return r ? `@${r}` : 'someone';
  };
  const adminNames = new Map<string, string>();
  for (const n of detail.notes) if (n.authorId && n.authorUsername) adminNames.set(n.authorId, `@${n.authorUsername}`);
  if (claimedBy?.username) adminNames.set(claimedBy.id, `@${claimedBy.username}`);
  if (me) adminNames.set(me.id, 'you');
  const nameOfAdmin = (id: string | null): string => (id ? (adminNames.get(id) ?? 'a moderator') : 'automatic');

  const sla = slaState(c);
  const sensitive =
    c.category === 'child_safety' || c.policy === 'child_safety' || detail.escalations.some((e) => e.kind === 'csam') || detail.media.some((m) => m.quarantine !== null);
  const locked =
    claimedBy && !mine
      ? `${claimedBy.username ? `@${claimedBy.username}` : 'Another moderator'} is working on it until ${new Date(c.leaseUntil ?? Date.now()).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}. You can read it; deciding waits until they let go or their claim runs out.`
      : null;
  const inDraft = new Set(draft.actions.filter((a) => a.target.startsWith('reporter:')).map((a) => a.target.slice('reporter:'.length)));
  const canAct = open && c.status !== 'needs_second_approval' && !locked;

  const openPanel = (): void => {
    if (wide) aside.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    else setSheet(true);
  };
  const addAction = (target: DecisionTarget): void => {
    setDraft((d) => ({
      ...d,
      outcome: target === 'subject' ? 'actioned' : d.outcome,
      actions: [...d.actions, newAction(target, target === 'subject' && d.policy === 'self_harm' ? 'caring_message' : 'warning', d.policy)],
    }));
    openPanel();
  };
  const decided = (): void => {
    setSheet(false);
    draftFor.current = null;
    void loaded.reload();
  };

  const panel = (inSheet: boolean): React.JSX.Element => (
    <DecisionPanel detail={detail} draft={draft} setDraft={setDraft} locked={locked} onDecided={decided} names={names} heading={!inSheet} />
  );

  return (
    <div className={`case-view${wide ? '' : ' has-decide-bar'}`}>
      <PageHeader
        back={{ href: backHref, label: 'Queue' }}
        title={categoryName(c.category)}
        meta={
          <>
            <Badge tone={PRIORITY_TONE[c.priority]}>{PRIORITY_NAME[c.priority]}</Badge>
            <Badge tone={statusTone(c.status)}>{statusName(c.status)}</Badge>
            {sla && <Badge tone={sla.tone}>{sla.text}</Badge>}
            {c.minorInvolved && <Badge tone="warn">Minor involved</Badge>}
          </>
        }
        subtitle={c.summary}
        actions={
          <>
            <span className="case-nav">
              <button type="button" className="icon-button" aria-label="Previous case (k)" title="Previous case (k)" disabled={!prev} onClick={() => prev && go(`moderation/${prev}`)}>
                <Icon name="arrowLeft" />
              </button>
              <button type="button" className="icon-button" aria-label="Next case (j)" title="Next case (j)" disabled={!next} onClick={() => next && go(`moderation/${next}`)}>
                <Icon name="arrowRight" />
              </button>
            </span>
            {open && !claimedBy && (
              <Button variant="primary" icon="lock" onClick={() => void claim()} busy={claiming} title="Claim (c)">
                Claim
              </Button>
            )}
            {open && mine && (
              <>
                <Badge tone="info">Yours until {new Date(c.leaseUntil!).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</Badge>
                <Button onClick={() => void claim()} busy={claiming}>
                  Keep it longer
                </Button>
                <Button variant="ghost" onClick={() => void release()} disabled={claiming}>
                  Let go
                </Button>
              </>
            )}
            {!open && next && (
              <Button variant="primary" icon="arrowRight" onClick={() => go(`moderation/${next}`)}>
                Next case
              </Button>
            )}
          </>
        }
      />

      <p className="case-facts">
        <span>{sourceName(c.source)}</span>
        {c.targetType && <span>{targetName(c.targetType)}</span>}
        <span>
          First reported <Time value={c.firstReportedAt} />
        </span>
        {c.reportCount > 0 && (
          <span>
            {c.reportCount} {c.reportCount === 1 ? 'report' : 'reports'} from {c.reporterCount} {c.reporterCount === 1 ? 'person' : 'people'}
          </span>
        )}
        {c.lastReportedAt !== c.firstReportedAt && c.reportCount > 1 && (
          <span>
            latest <Time value={c.lastReportedAt} />
          </span>
        )}
      </p>

      {loaded.error != null && <ErrorState error={loaded.error} onRetry={() => void loaded.reload()} what="moderation" compact />}
      {detail.escalations.some((e) => e.status === 'open') && (
        <Banner tone="bad" title={detail.escalations.some((e) => e.kind === 'csam' && e.status === 'open') ? 'A hotline report is still to be filed' : 'Escalated'}>
          See Escalations below for what is left to do.
        </Banner>
      )}

      <div className={`case-layout${wide ? ' is-wide' : ''}`}>
        <div className="case-main">
          <Evidence detail={detail} sensitive={sensitive} />
          {detail.copyright && <CopyrightPanel info={detail.copyright} />}
          {subject && <SubjectPanel subject={subject} canAct={canAct} selfHarm={draft.policy === 'self_harm'} onSanction={() => addAction('subject')} />}
          <ReportersPanel
            reports={detail.reports}
            media={detail.media}
            sensitive={sensitive}
            canAct={canAct}
            inDraft={inDraft}
            onSanction={(id) => addAction(`reporter:${id}`)}
          />
          <CaseSanctions sanctions={detail.sanctions} nameOf={nameOfUser} onChanged={() => void loaded.reload()} />
          <Escalations escalations={detail.escalations} onChanged={() => void loaded.reload()} />
          <Notes
            caseId={c.id}
            notes={detail.notes}
            onAdded={(note) => loaded.setData((d) => (d ? { ...d, notes: [...d.notes, note] } : d!))}
          />
          <History audit={detail.audit} nameOf={nameOfAdmin} />
        </div>
        {wide && (
          <aside ref={aside} className="case-aside card" aria-label="Decision">
            {panel(false)}
          </aside>
        )}
      </div>

      {!wide && (
        <>
          <div className="decide-bar">
            <span className="decide-bar-text">
              {!open
                ? statusName(c.status)
                : locked
                  ? 'Someone else is on this case'
                  : draft.actions.length > 0
                    ? `${draft.actions.length} ${draft.actions.length === 1 ? 'action' : 'actions'} ready`
                    : 'Nothing decided yet'}
            </span>
            <Button variant="primary" onClick={() => setSheet(true)}>
              {open ? 'Decide' : 'Decision'}
            </Button>
          </div>
          <Drawer open={sheet} onClose={() => setSheet(false)} title="Decision" className="decision-sheet">
            {panel(true)}
          </Drawer>
        </>
      )}
    </div>
  );
}

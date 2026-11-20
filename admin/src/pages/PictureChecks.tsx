import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  PICTURE_CASE_VIEWS,
  type PictureCaseItem,
  type PictureCaseList,
  type PictureCaseView,
  type PictureDecision,
  type ReportCategory,
} from '@kurda/shared';
import { ApiError, api } from '../api';
import { useRoute } from '../nav';
import { policyOptions, statusName, statusTone } from '../moderation';
import {
  CHECKED_BY_TEXT,
  ORIGIN_NAME,
  SURFACE_NAME,
  VIEW_NAME,
  decidable,
  decidedText,
  defaultRule,
  excerpt,
  findings,
  picturePath,
  picturesPath,
  viewFrom,
  viewHref,
} from '../pictureChecks';
import {
  Badge,
  Banner,
  Button,
  Dialog,
  EmptyState,
  ErrorState,
  Icon,
  PageHeader,
  Select,
  Tabs,
  Textarea,
  Time,
  UserLink,
  duration,
  errorLine,
  useLoad,
  useToast,
} from '../ui';
import { PictureFrame, usePictureReveal, type Reveal } from './PictureReveal';

/**
 * Picture checks (#/picture-checks): pictures held at upload, refusals their owners asked a person about, and reported
 * pictures, each hidden until a moderator shows it, to approve or remove in one step. Child-safety hits are decided on
 * their case, where the evidence tools are.
 */
export function PictureChecks(): React.JSX.Element {
  const route = useRoute();
  const view = viewFrom(route.query);
  return <Board key={view} view={view} />;
}

const EMPTY: Readonly<Record<PictureCaseView, { title: string; text: string }>> = {
  waiting: { title: 'Nothing waiting', text: 'Every picture has been checked. New ones appear here as they are held.' },
  asked: { title: 'Nobody is asking', text: 'When someone asks a person to look at a refused picture, it appears here.' },
  reported: { title: 'No reported pictures', text: 'Pictures that reports hid or queued appear here.' },
  decided: { title: 'No decisions yet', text: 'Pictures decided here are listed, newest first.' },
};

/** How many tiles the skeleton shows while the first page loads. */
const SKELETON_TILES = 6;

function Board({ view }: { view: PictureCaseView }): React.JSX.Element {
  const toast = useToast();
  const first = useLoad(() => api<PictureCaseList>(picturesPath(view)), [view]);
  const [more, setMore] = useState<{ items: PictureCaseItem[]; next: string | null } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  // Decided here and taken off at once; the server's answer puts one back if it refused.
  const [gone, setGone] = useState<ReadonlySet<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const [removing, setRemoving] = useState<PictureCaseItem | null>(null);
  const grid = useRef<HTMLUListElement>(null);
  // Where focus goes after a tile leaves: the one that took its place.
  const refocus = useRef<number | null>(null);
  useEffect(() => setMore(null), [first.data]);

  const all = useMemo(() => (first.data ? [...first.data.items, ...(more?.items ?? [])] : null), [first.data, more]);
  const items = useMemo(() => all?.filter((i) => !gone.has(i.caseId)) ?? null, [all, gone]);
  const next = more ? more.next : (first.data?.nextCursor ?? null);

  // The counts, less what was just decided here and is still in the list the server sent.
  const counts = useMemo(() => {
    if (!first.data) return null;
    const left = { ...first.data.counts };
    if (view !== 'decided') left[view] = Math.max(0, left[view] - (all ?? []).filter((i) => gone.has(i.caseId)).length);
    return left;
  }, [first.data, all, gone, view]);

  useEffect(() => {
    if (refocus.current === null) return;
    const tiles = grid.current ? tilesIn(grid.current) : [];
    const to = tiles[Math.min(refocus.current, tiles.length - 1)];
    refocus.current = null;
    to?.focus();
  }, [items]);

  async function loadMore(): Promise<void> {
    if (!next) return;
    setLoadingMore(true);
    try {
      const page = await api<PictureCaseList>(picturesPath(view, next));
      setMore((m) => ({ items: [...(m?.items ?? []), ...page.items], next: page.nextCursor }));
    } catch (err) {
      toast.error(errorLine(err, 'picture checks'));
    } finally {
      setLoadingMore(false);
    }
  }

  const putBack = (id: string): void =>
    setGone((g) => {
      const left = new Set(g);
      left.delete(id);
      return left;
    });

  async function decide(item: PictureCaseItem, decision: PictureDecision): Promise<void> {
    // Its buttons go with it, so focus moves to the tile that takes its place rather than falling to the page.
    refocus.current = Math.max(0, items?.findIndex((i) => i.caseId === item.caseId) ?? 0);
    setGone((g) => new Set(g).add(item.caseId));
    setNotice(null);
    try {
      await api<{ ok: true }>(picturePath(item.caseId, 'decide'), { method: 'POST', body: decision });
      toast.success(decidedText(item.origin, decision.decision));
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.code === 'ALREADY_DECIDED') {
        setNotice('Another moderator decided that picture first, so the list has been refreshed.');
        void first.reload();
        return;
      }
      putBack(item.caseId);
      toast.error(errorLine(err, 'picture checks'));
    }
  }

  function approve(item: PictureCaseItem, reveal: Reveal): void {
    if (!reveal.seen) {
      toast.info('Show the picture first, then approve it.');
      return;
    }
    void decide(item, { decision: 'approve' });
  }

  useTileKeys(grid, items);

  const tabs = PICTURE_CASE_VIEWS.map((v) => ({
    key: v,
    label: VIEW_NAME[v],
    href: viewHref(v),
    ...(counts && v !== 'decided' ? { count: counts[v] } : {}),
  }));

  return (
    <div>
      <PageHeader
        title="Picture checks"
        subtitle="Pictures held before anyone else sees them, refusals their owners asked about, and reported pictures. Each stays hidden until you show it."
        actions={
          <Button icon="refresh" onClick={() => void first.reload()} busy={first.loading && !!first.data}>
            Refresh
          </Button>
        }
      />
      <Tabs label="Show" value={view} items={tabs} />
      {notice && (
        <Banner
          tone="info"
          title="Already decided"
          actions={
            <button type="button" className="ghost" onClick={() => setNotice(null)}>
              Dismiss
            </button>
          }
        >
          {notice}
        </Banner>
      )}
      {first.error != null && !first.data ? (
        <div className="card section">
          <ErrorState error={first.error} onRetry={() => void first.reload()} what="picture checks" />
        </div>
      ) : !items ? (
        <TileSkeletons />
      ) : items.length === 0 ? (
        <div className="card section">
          <EmptyState title={EMPTY[view].title} icon="check" compact>
            {EMPTY[view].text}
          </EmptyState>
        </div>
      ) : (
        <>
          {first.error != null && <ErrorState error={first.error} onRetry={() => void first.reload()} what="picture checks" compact />}
          <ul ref={grid} className="pcheck-grid" aria-label={`${VIEW_NAME[view]} pictures`}>
            {items.map((item) => (
              <li key={item.caseId}>
                <PictureTile item={item} onApprove={approve} onRemove={setRemoving} />
              </li>
            ))}
          </ul>
          {next && (
            <div className="load-more pcheck-more">
              <Button onClick={() => void loadMore()} busy={loadingMore}>
                {loadingMore ? 'Loading…' : 'Show more pictures'}
              </Button>
            </div>
          )}
          <p className="keys-hint" aria-hidden="true">
            <kbd>j</kbd> <kbd>k</kbd> move · <kbd>Space</kbd> show or hide · <kbd>a</kbd> approve · <kbd>r</kbd> remove
          </p>
        </>
      )}
      {removing && (
        <RemoveDialog
          key={removing.caseId}
          item={removing}
          onClose={() => setRemoving(null)}
          onRemove={(policy, note) => {
            const item = removing;
            setRemoving(null);
            void decide(item, { decision: 'remove', policy, ...(note ? { note } : {}) });
          }}
        />
      )}
    </div>
  );
}

function tilesIn(root: ParentNode): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('[data-tile]')];
}

/** J and k move between tiles, from anywhere on the page; never while typing, with a modifier, or with a layer open. */
function useTileKeys(grid: React.RefObject<HTMLUListElement | null>, items: PictureCaseItem[] | null): void {
  useEffect(() => {
    if (!items || items.length === 0) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented || (e.key !== 'j' && e.key !== 'k')) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest('input, textarea, select, [contenteditable], [role="dialog"], [role="alertdialog"]')) return;
      if (document.body.classList.contains('has-layer') || !grid.current) return;
      const tiles = tilesIn(grid.current);
      const at = tiles.findIndex((tile) => tile.contains(document.activeElement));
      const to = e.key === 'j' ? Math.min(tiles.length - 1, at + 1) : Math.max(0, at - 1);
      e.preventDefault();
      tiles[to]?.focus();
      tiles[to]?.scrollIntoView({ block: 'nearest' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [grid, items]);
}

function PictureTile({
  item,
  onApprove,
  onRemove,
}: {
  item: PictureCaseItem;
  onApprove: (item: PictureCaseItem, reveal: Reveal) => void;
  onRemove: (item: PictureCaseItem) => void;
}): React.JSX.Element {
  const reveal = usePictureReveal(item.caseId, item.sensitive);
  const headingId = useId();
  const canDecide = decidable(item);
  const found = findings(item.levels);
  const surface = SURFACE_NAME[item.surface] ?? item.surface;
  const origin = ORIGIN_NAME[item.origin] ?? item.origin;

  // Space, a and r act on the tile with focus. Space on one of its own buttons presses that button instead.
  const onKeyDown = (e: React.KeyboardEvent<HTMLElement>): void => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
    if ((e.target as HTMLElement).closest('input, textarea, select')) return;
    if (e.key === ' ' && e.target === e.currentTarget) {
      e.preventDefault();
      reveal.toggle();
    } else if (e.key === 'a' && canDecide) {
      e.preventDefault();
      onApprove(item, reveal);
    } else if (e.key === 'r' && canDecide) {
      e.preventDefault();
      onRemove(item);
    }
  };

  return (
    <article
      className={`card pcheck-tile${item.sensitive ? ' is-sensitive' : ''}`}
      tabIndex={0}
      data-tile
      data-case={item.caseId}
      aria-labelledby={headingId}
      onKeyDown={onKeyDown}
    >
      <PictureFrame
        reveal={reveal}
        sensitive={item.sensitive}
        alt={`${surface} picture${item.owner ? ` by @${item.owner.username}` : ''}`}
        hint={canDecide ? 'Look before you approve it.' : undefined}
      />
      <div className="pcheck-body">
        <div className="pcheck-head">
          <h2 className="pcheck-title" id={headingId}>
            {surface}
          </h2>
          <span className="badges">
            <Badge tone={item.origin === 'child_safety' ? 'bad' : 'neutral'}>{origin}</Badge>
            <Badge tone={statusTone(item.status)}>{statusName(item.status)}</Badge>
          </span>
        </div>

        {found.length > 0 ? (
          <ul className="pcheck-chips" aria-label="What the check found">
            {found.map((f) => (
              <li key={f.category} className={`pcheck-chip is-${f.level}`}>
                {f.text}
              </li>
            ))}
          </ul>
        ) : item.levels ? (
          <p className="pcheck-line subtle">The check found nothing to name.</p>
        ) : item.checkedBy === 'auto' ? (
          <p className="pcheck-line subtle">No automatic findings.</p>
        ) : null}
        <p className="pcheck-line subtle">{CHECKED_BY_TEXT[item.checkedBy] ?? item.checkedBy}</p>

        <p className="pcheck-owner">
          <UserLink user={item.owner} minor={item.owner?.minor} />
          {item.owner?.displayName && (
            <span className="subtle" dir="auto">
              {item.owner.displayName}
            </span>
          )}
        </p>
        {item.context.groupName && (
          <p className="pcheck-line">
            In the group <strong dir="auto">{item.context.groupName}</strong>
          </p>
        )}
        {item.context.text && (
          <p className="pcheck-context" dir="auto">
            {excerpt(item.context.text)}
          </p>
        )}
        {item.note && (
          <blockquote className="pcheck-note">
            <span className="pcheck-note-label">The owner wrote</span>
            <span dir="auto">{item.note}</span>
          </blockquote>
        )}

        <p className="pcheck-facts">
          {item.reportCount > 0 && (
            <span>
              {item.reportCount} {item.reportCount === 1 ? 'report' : 'reports'}
            </span>
          )}
          {item.decided ? (
            <span>
              {item.decided.outcome === 'approved' ? 'Approved' : 'Removed'} by {item.decided.byUsername ? `@${item.decided.byUsername}` : 'a moderator'}{' '}
              <Time value={item.decided.at} />
            </span>
          ) : (
            <span>
              Waiting <WaitedFor since={item.createdAt} />
            </span>
          )}
        </p>
        {item.sensitive && <p className="pcheck-line subtle">Decided on its case, with the evidence and reporting tools.</p>}

        <div className="pcheck-actions">
          {canDecide && (
            <>
              <Button variant="primary" icon="check" onClick={() => onApprove(item, reveal)} disabled={!reveal.seen} aria-keyshortcuts="a">
                Approve
              </Button>
              <Button variant="danger" icon="trash" onClick={() => onRemove(item)} aria-keyshortcuts="r">
                Remove
              </Button>
            </>
          )}
          <a className={`button-link${item.sensitive ? ' primary' : ''}`} href={`#/moderation/${encodeURIComponent(item.caseId)}`}>
            Open case
            <Icon name="chevronRight" size={16} />
          </a>
        </div>
      </div>
    </article>
  );
}

/** How long it has waited, in words: "5 h", "3 days", with the moment it began on hover. */
function WaitedFor({ since }: { since: string }): React.JSX.Element {
  const at = new Date(since);
  if (Number.isNaN(at.getTime())) return <span className="subtle">—</span>;
  return (
    <time dateTime={at.toISOString()} title={at.toLocaleString()}>
      {duration((Date.now() - at.getTime()) / 1000)}
    </time>
  );
}

function TileSkeletons(): React.JSX.Element {
  return (
    <div role="status">
      <span className="sr-only">Loading pictures…</span>
      <ul className="pcheck-grid" aria-hidden="true">
        {Array.from({ length: SKELETON_TILES }, (_, i) => (
          <li key={i}>
            <div className="card pcheck-tile is-skeleton">
              <div className="media-frame skeleton" />
              <div className="pcheck-body">
                <div className="skeleton" />
                <div className="skeleton" />
                <div className="skeleton is-short" />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The rules a picture can be removed under: every rule but child safety, which goes through its case. */
const REMOVE_RULES = policyOptions().filter((o) => o.value !== 'child_safety');

/** Remove: the rule it breaks (from what the check found), an optional note, and a confirmation with no undo after. */
function RemoveDialog({
  item,
  onClose,
  onRemove,
}: {
  item: PictureCaseItem;
  onClose: () => void;
  onRemove: (policy: ReportCategory, note: string) => void;
}): React.JSX.Element {
  const [policy, setPolicy] = useState<ReportCategory>(() => defaultRule(item.levels));
  const [note, setNote] = useState('');
  const formId = useId();
  return (
    <Dialog
      open
      title="Remove this picture?"
      onClose={onClose}
      dismissable={false}
      alert
      footer={
        <>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form={formId} className="danger-solid">
            Remove picture
          </button>
        </>
      }
    >
      <form
        id={formId}
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          onRemove(policy, note.trim());
        }}
      >
        <p className="dialog-text">
          It is taken off Hevalo{item.owner ? ` and @${item.owner.username} is told` : ', and its owner is told'} which rule it breaks and how to
          appeal. This can’t be undone here; an appeal can bring it back.
        </p>
        <Select
          label="The rule it breaks"
          hint={`${findings(item.levels).length > 0 ? 'Picked from what the check found. ' : ''}Child sexual abuse material is handled on its case instead.`}
          options={REMOVE_RULES}
          value={policy}
          data-autofocus
          onChange={(e) => setPolicy(e.target.value as ReportCategory)}
        />
        <Textarea
          label="Note for the case (optional)"
          hint="Moderators read it in the case history."
          rows={3}
          maxLength={1000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </form>
    </Dialog>
  );
}

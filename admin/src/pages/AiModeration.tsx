import { useState } from 'react';
import { api } from '../api';
import { Badge, Button, PageHeader, Section, Table, Time, UserLink, errorLine, useLoad, useToast, type Column, type Tone } from '../ui';

interface TextFlag {
  id: string;
  surface: string;
  contentType: string;
  contentRef: string | null;
  authorId: string | null;
  action: string;
  topCategory: string | null;
  topScore: number;
  modelVersion: string;
  createdAt: string;
}
interface ImageFlag {
  id: string;
  mediaKey: string;
  surface: string;
  action: string;
  reasons: string[];
  nsfwScore: number;
  violenceScore: number;
  csamMatch: boolean;
  preserveEvidence: boolean;
  modelVersion: string;
  createdAt: string;
}

type Outcome = 'actioned' | 'reversed';
type Kind = 'flags' | 'image-flags';

function short(id: string | null): string {
  return id ? id.slice(0, 8) : '—';
}
/** Auto-actions above `allow` show as amber; hard blocks as red. */
function actionTone(action: string): Tone {
  if (action === 'auto_hide' || action === 'block' || action === 'reject') return 'bad';
  return 'warn';
}
const percent = (score: number): string => `${Math.round(score * 100)}%`;

/**
 * Automated-moderation review (KUR-293 text + KUR-294 image): uphold or
 * overturn what the automatic checks did. On the kit's tables, so a flag is a
 * card on a phone rather than a row scrolled half off the screen, its buttons
 * last and out of sight.
 */
export function AiModeration(): React.JSX.Element {
  const toast = useToast();
  const feed = useLoad(async () => {
    const [text, images] = await Promise.all([
      api<{ flags: TextFlag[] }>('/admin/moderation/flags'),
      api<{ flags: ImageFlag[] }>('/admin/moderation/image-flags'),
    ]);
    return { text: text.flags, images: images.flags };
  }, []);
  const [busy, setBusy] = useState<string | null>(null);

  async function resolve(kind: Kind, id: string, outcome: Outcome): Promise<void> {
    setBusy(id);
    try {
      await api(`/admin/moderation/${kind}/${id}/resolve`, { method: 'POST', body: { outcome } });
      toast.success(outcome === 'actioned' ? `Upheld the automatic action on ${short(id)}.` : `Overturned ${short(id)} as a false positive.`);
      await feed.reload();
    } catch (err) {
      toast.error(errorLine(err, 'automated flags'));
    } finally {
      setBusy(null);
    }
  }

  const textColumns: Column<TextFlag>[] = [
    { key: 'surface', header: 'Surface', card: 'title', cell: (f) => <strong>{f.surface}</strong> },
    { key: 'type', header: 'Type', cell: (f) => f.contentType },
    { key: 'author', header: 'Author', cell: (f) => (f.authorId ? <UserLink user={{ id: f.authorId, username: null }} /> : <span className="subtle">—</span>) },
    { key: 'action', header: 'Action', cell: (f) => <Badge tone={actionTone(f.action)}>{f.action}</Badge> },
    {
      key: 'category',
      header: 'Top category',
      cell: (f) =>
        f.topCategory ? (
          <>
            {f.topCategory} <span className="subtle">({percent(f.topScore)})</span>
          </>
        ) : (
          <span className="subtle">—</span>
        ),
    },
    { key: 'when', header: 'Opened', sort: (a, b) => a.createdAt.localeCompare(b.createdAt), cell: (f) => <Time value={f.createdAt} /> },
  ];

  const imageColumns: Column<ImageFlag>[] = [
    { key: 'media', header: 'Media', card: 'title', cell: (f) => <code className="strong-code">{short(f.mediaKey)}</code> },
    { key: 'surface', header: 'Surface', cell: (f) => f.surface },
    {
      key: 'action',
      header: 'Action',
      cell: (f) => (
        <>
          <span className="badges">
            <Badge tone={actionTone(f.action)}>{f.action}</Badge>
            {f.csamMatch && <Badge tone="bad">CSAM</Badge>}
          </span>
          {/* said on the row rather than in a tooltip on the disabled button, which a finger never brings up */}
          {f.preserveEvidence && <span className="cell-sub">Evidence is kept: it can be upheld, not overturned.</span>}
        </>
      ),
    },
    {
      key: 'reasons',
      header: 'Reasons',
      cell: (f) => (
        <span className="badges">
          {f.reasons.map((r) => (
            <Badge key={r}>{r}</Badge>
          ))}
        </span>
      ),
    },
    { key: 'scores', header: 'Scores', cell: (f) => `nudity ${percent(f.nsfwScore)} · violence ${percent(f.violenceScore)}` },
    { key: 'when', header: 'Opened', sort: (a, b) => a.createdAt.localeCompare(b.createdAt), cell: (f) => <Time value={f.createdAt} /> },
  ];

  return (
    <div>
      <PageHeader
        title="Automated flags"
        subtitle="What the automatic text and picture checks held or hid, waiting for a moderator to uphold it or overturn it."
        actions={
          <Button icon="refresh" onClick={() => void feed.reload()} busy={feed.loading && !!feed.data}>
            Refresh
          </Button>
        }
      />
      <Section title={`Text flags${feed.data ? ` (${feed.data.text.length})` : ''}`} flush>
        <Table
          caption="Text flags"
          columns={textColumns}
          rows={feed.data?.text ?? null}
          rowKey={(f) => f.id}
          loading={feed.loading}
          error={feed.error}
          onRetry={() => void feed.reload()}
          what="automated flags"
          empty="No text flags are waiting."
          wide
          actions={(f) => <Resolve busy={busy === f.id} onResolve={(o) => void resolve('flags', f.id, o)} />}
        />
      </Section>
      <Section title={`Picture flags${feed.data ? ` (${feed.data.images.length})` : ''}`} flush>
        <Table
          caption="Picture flags"
          columns={imageColumns}
          rows={feed.data?.images ?? null}
          rowKey={(f) => f.id}
          loading={feed.loading}
          error={feed.error}
          onRetry={() => void feed.reload()}
          what="automated flags"
          empty="No picture flags are waiting."
          wide
          actions={(f) => (
            <Resolve
              busy={busy === f.id}
              // a preserved-evidence CSAM flag can only be actioned, never overturned
              noReverse={f.preserveEvidence}
              onResolve={(o) => void resolve('image-flags', f.id, o)}
            />
          )}
        />
      </Section>
    </div>
  );
}

function Resolve({ busy, noReverse = false, onResolve }: { busy: boolean; noReverse?: boolean; onResolve: (outcome: Outcome) => void }): React.JSX.Element {
  return (
    <>
      <Button variant="danger" onClick={() => onResolve('actioned')} disabled={busy}>
        Uphold
      </Button>
      <Button onClick={() => onResolve('reversed')} disabled={busy || noReverse}>
        Overturn
      </Button>
    </>
  );
}

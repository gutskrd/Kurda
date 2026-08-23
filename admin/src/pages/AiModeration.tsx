import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api';

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

function short(id: string | null): string {
  return id ? id.slice(0, 8) : '—';
}
function fmt(d: string): string {
  return new Date(d).toLocaleString();
}
/** Auto-actions above `allow` show as amber; hard blocks as red. */
function actionCls(action: string): string {
  if (action === 'auto_hide' || action === 'block' || action === 'reject') return 'hi';
  return 'mid';
}

/** Automated-moderation review (KUR-293 text + KUR-294 image): uphold / overturn. */
export function AiModeration(): React.JSX.Element {
  const [text, setText] = useState<TextFlag[]>([]);
  const [images, setImages] = useState<ImageFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [t, i] = await Promise.all([
        api<{ flags: TextFlag[] }>('/admin/moderation/flags'),
        api<{ flags: ImageFlag[] }>('/admin/moderation/image-flags'),
      ]);
      setText(t.flags);
      setImages(i.flags);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load the moderation feed');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function resolve(kind: 'flags' | 'image-flags', id: string, outcome: Outcome): Promise<void> {
    setBusy(id);
    setMsg(null);
    try {
      await api(`/admin/moderation/${kind}/${id}/resolve`, { method: 'POST', body: { outcome } });
      setMsg(outcome === 'actioned' ? `Upheld the auto-action on ${short(id)}.` : `Overturned ${short(id)} as a false positive.`);
      await load();
    } catch (err) {
      setMsg(err instanceof ApiError ? `❌ ${err.message}` : '❌ Failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="toolbar">
        <div>
          <h1>AI Moderation</h1>
          <div className="subtle">Automated text &amp; image flags awaiting a moderator</div>
        </div>
        <div className="spacer" />
        <button onClick={() => void load()} disabled={loading}>
          Refresh
        </button>
      </div>

      {msg && <div className={msg.startsWith('❌') ? 'error' : 'subtle'} style={{ marginBottom: 12 }}>{msg}</div>}
      {error && <div className="error" style={{ marginBottom: 12 }}>{error}</div>}

      {loading ? (
        <div className="card empty">Loading…</div>
      ) : (
        <>
          <div className="card" style={{ padding: 0, marginBottom: 16 }}>
            <div className="section-title" style={{ margin: '14px 16px 8px' }}>
              Text flags ({text.length})
            </div>
            {text.length === 0 ? (
              <div className="empty">No pending text flags.</div>
            ) : (
              <div className="tablewrap">
                <table>
                  <thead>
                    <tr>
                      <th>Surface</th>
                      <th>Type</th>
                      <th>Author</th>
                      <th>Action</th>
                      <th>Top category</th>
                      <th>Opened</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {text.map((f) => (
                      <tr key={f.id}>
                        <td>{f.surface}</td>
                        <td className="subtle">{f.contentType}</td>
                        <td>
                          <code title={f.authorId ?? ''}>{short(f.authorId)}</code>
                        </td>
                        <td>
                          <span className={`badge ${actionCls(f.action)}`}>{f.action}</span>
                        </td>
                        <td>
                          {f.topCategory ? (
                            <>
                              {f.topCategory} <span className="subtle">({Math.round(f.topScore * 100)}%)</span>
                            </>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="subtle" style={{ whiteSpace: 'nowrap' }}>{fmt(f.createdAt)}</td>
                        <td>
                          <ResolveButtons busy={busy === f.id} onResolve={(o) => resolve('flags', f.id, o)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card" style={{ padding: 0 }}>
            <div className="section-title" style={{ margin: '14px 16px 8px' }}>
              Image flags ({images.length})
            </div>
            {images.length === 0 ? (
              <div className="empty">No pending image flags.</div>
            ) : (
              <div className="tablewrap">
                <table>
                  <thead>
                    <tr>
                      <th>Media</th>
                      <th>Surface</th>
                      <th>Action</th>
                      <th>Reasons</th>
                      <th>Scores</th>
                      <th>Opened</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {images.map((f) => (
                      <tr key={f.id}>
                        <td>
                          <code title={f.mediaKey}>{short(f.mediaKey)}</code>
                        </td>
                        <td className="subtle">{f.surface}</td>
                        <td>
                          <span className={`badge ${actionCls(f.action)}`}>{f.action}</span>
                          {f.csamMatch && <span className="badge hi" style={{ marginLeft: 4 }}>CSAM</span>}
                        </td>
                        <td>
                          <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
                            {f.reasons.map((r) => (
                              <span key={r} className="badge">
                                {r}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="subtle" style={{ whiteSpace: 'nowrap' }}>
                          nsfw {Math.round(f.nsfwScore * 100)}% · viol {Math.round(f.violenceScore * 100)}%
                        </td>
                        <td className="subtle" style={{ whiteSpace: 'nowrap' }}>{fmt(f.createdAt)}</td>
                        <td>
                          <ResolveButtons
                            busy={busy === f.id}
                            // a preserved-evidence CSAM flag can only be actioned, never overturned
                            noReverse={f.preserveEvidence}
                            onResolve={(o) => resolve('image-flags', f.id, o)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function ResolveButtons({
  busy,
  noReverse,
  onResolve,
}: {
  busy: boolean;
  noReverse?: boolean;
  onResolve: (outcome: Outcome) => void;
}): React.JSX.Element {
  return (
    <div className="row" style={{ gap: 6 }}>
      <button className="danger" onClick={() => onResolve('actioned')} disabled={busy}>
        Uphold
      </button>
      <button
        onClick={() => onResolve('reversed')}
        disabled={busy || noReverse}
        title={noReverse ? 'Evidence preserved — this flag cannot be overturned' : undefined}
      >
        Overturn
      </button>
    </div>
  );
}

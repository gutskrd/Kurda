import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import { Button } from '../components/Button';
import { useT } from '../i18n/I18nProvider';
import { GOTIN_KINDS, titleRequired } from './postKinds';

const MAX_TITLE = 200;
const MAX_BODY = 50_000;

/**
 * Post words: a gotin, a çîrok or a helbest.
 *
 * There was no way to write anything from the web at all — the API has had
 * `POST /library/posts` since the library was built, and only the mobile app
 * ever called it.
 *
 * A gotin has no title field, because it has no title. Hiding the field rather
 * than marking it optional is the difference between "you may skip this" and
 * "this does not apply to what you are writing".
 */
export function PostWords({ onPosted }: { onPosted: () => void }): React.JSX.Element {
  const { client } = useAuth();
  const t = useT();
  const [postAs, setPostAs] = useState('gotin');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsTitle = titleRequired(postAs);
  const ready = body.trim().length > 0 && (!needsTitle || title.trim().length > 0);

  async function submit(): Promise<void> {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    const res = await client.post('/library/posts', {
      type: postAs,
      ...(needsTitle ? { title: title.trim() } : {}),
      body: body.trim(),
    });
    setBusy(false);
    if (res.ok) onPosted();
    else setError(describeError(res.error));
  }

  return (
    <div className="post-words">
      <h2 className="friend-heading" style={{ marginTop: 0 }}>{t('post.words.title')}</h2>

      <div className="seg" role="group" aria-label={t('post.kind')}>
        {GOTIN_KINDS.map((k) => (
          <button
            key={k.key}
            type="button"
            className={`seg-btn${postAs === k.postAs ? ' is-active' : ''}`}
            aria-pressed={postAs === k.postAs}
            disabled={busy}
            onClick={() => setPostAs(k.postAs)}
          >
            {k.label}
          </button>
        ))}
      </div>

      {needsTitle && (
        <input
          className="input"
          value={title}
          maxLength={MAX_TITLE}
          placeholder={t('post.titlePlaceholder')}
          aria-label={t('post.title')}
          disabled={busy}
          onChange={(e) => setTitle(e.target.value)}
          style={{ marginTop: 12 }}
        />
      )}

      <textarea
        className="input"
        rows={postAs === 'gotin' ? 3 : 8}
        value={body}
        maxLength={MAX_BODY}
        placeholder={postAs === 'gotin' ? t('post.bodyPrompt') : t('post.bodyPlaceholder')}
        aria-label={t('post.body')}
        disabled={busy}
        onChange={(e) => setBody(e.target.value)}
        style={{ marginTop: 12 }}
      />

      {error && <div className="msg msg-error" role="status">{error}</div>}

      <div className="comment-form-actions">
        <Button size="sm" onClick={() => void submit()} disabled={!ready || busy}>
          {busy ? t('post.submitting') : t('post.submit')}
        </Button>
      </div>
    </div>
  );
}

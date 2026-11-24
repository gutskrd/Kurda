import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  POST_BODY_MAX,
  POST_DRAFT_VERSION,
  POST_PICTURES_MAX,
  POST_SOURCE_MAX,
  POST_TITLE_MAX,
  canPost,
  cleanPostText,
  derivePostType,
  isEmptyDraft,
  pictureUploadPath,
  postTextLength,
  toCreatePostRequest,
  type PostDraft,
  type UpdatePostRequest,
  type WrittenPostType,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { Avatar } from '../components/Avatar';
import { LinkIcon, PhotoIcon, TextIcon } from '../components/icons';
import { PictureEditor } from '../images/PostPicture';
import { useT } from '../i18n/I18nProvider';
import { ComposerDialog } from './ComposerDialog';
import { OldDrafts } from './OldDrafts';
import { PictureDetails, PictureRefusals, PictureTiles, type ComposerPicture } from './PictureTiles';
import { clearDraft, loadDraft, saveDraft } from './draftStore';
import { accountLimitOf, composerErrorText, problemText } from './errors';
import { SendError } from '../reports/SendError';
import { HeldNotice, useAccountHeld } from '../reports/HeldNotice';
import { ParentalNote, useParentalOff } from '../parental/ParentalNote';
import { textDir } from './textDir';
import type { ComposedPost, UploadedPicture } from './types';
import type { ApiError } from '../lib/types';
import './composer.css';

/** How long typing has to pause before the draft is written to the device. */
const SAVE_DELAY_MS = 400;

let seq = 0;
const localId = (): string => `p${Date.now().toString(36)}${(seq++).toString(36)}`;

interface ComposerProps {
  onClose: () => void;
  /** Called with the post as the server now has it. */
  onPosted: (post: ComposedPost) => void;
  /** A post to edit or a server draft to finish; omitted to write a new one. */
  editing?: ComposedPost | null;
}

/**
 * Writing a post: one box for words and up to four pictures. A title is optional and makes the post a çîrok (or a
 * helbest when chosen); without one it is a gotin. The posting rules are the API's own (`@kurda/shared`
 * post-composer), so the Post button and the server agree.
 *
 * - Pictures upload as soon as they are added, each with its own progress and error. "I made this" (on by default)
 *   adds the Hevalo signature at upload, so switching it uploads the picture again. A picture the check holds for a
 *   person can still be posted, and only its author sees the post until then; a refused one says why (pictures/).
 * - The draft is kept on this device as you write (draftStore.ts); closing with something written asks to keep it.
 * - The counter counts as the server does and shows only near the limit.
 * - Ctrl/Cmd+Enter posts. Fields are at least 16px so iOS does not zoom on focus.
 *
 * With `editing`, the box edits that post (words, title, alt text and pictures) and saves with PATCH; a draft saved by
 * the old phone app is finished the same way and then published.
 */
export function Composer({ onClose, onPosted, editing = null }: ComposerProps): React.JSX.Element {
  const { client, user } = useAuth();
  const t = useT();
  // A held account is told before writing anything, rather than when Post is refused.
  const held = useAccountHeld();
  // A teen whose parent switched posting off is told so before writing anything, as a held account is.
  const postsOff = useParentalOff('posts');
  const titleId = useId();
  const titleFieldId = useId();
  const sourceFieldId = useId();
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const userId = user?.id ?? null;

  // The post being edited, if any.
  const [target, setTarget] = useState<ComposedPost | null>(editing);
  const mode: 'create' | 'edit' | 'finish' = !target ? 'create' : target.status === 'draft' ? 'finish' : 'edit';

  const restored = useMemo(() => (!editing && userId ? loadDraft(userId) : null), [editing, userId]);
  const start = restored?.draft;

  const [type, setType] = useState<WrittenPostType | null>(() => initialType(editing) ?? start?.type ?? null);
  const [title, setTitle] = useState(() => editing?.title ?? start?.title ?? '');
  const [body, setBody] = useState(() => editing?.body ?? start?.body ?? '');
  const [meme, setMeme] = useState(() => editing?.meme ?? start?.meme ?? false);
  const [source, setSource] = useState(() => editing?.sourceCredit ?? start?.sourceCredit ?? '');
  const [pictures, setPictures] = useState<ComposerPicture[]>(() => initialPictures(editing, start));
  const [showTitle, setShowTitle] = useState(() => postTextLength(editing?.title ?? start?.title) > 0 || !!start?.type);
  const [showSource, setShowSource] = useState(() => postTextLength(editing?.sourceCredit ?? start?.sourceCredit) > 0);

  const [openPicture, setOpenPicture] = useState<string | null>(null);
  const [editingPicture, setEditingPicture] = useState<string | null>(null);
  const [view, setView] = useState<'write' | 'drafts'>('write');
  const [confirmClose, setConfirmClose] = useState(false);
  const [busy, setBusy] = useState(false);
  /** A refused post; SendError shows an account limit with a link to Account standing. */
  const [error, setError] = useState<ApiError | null>(null);
  const [note, setNote] = useState<string | null>(() =>
    restored ? (restored.droppedPictures > 0 ? t('composer.restoredWithoutPictures') : t('composer.restored')) : null,
  );
  const [oldDrafts, setOldDrafts] = useState<ComposedPost[]>([]);

  // ---- The pictures --------------------------------------------------------

  const patchPicture = useCallback((id: string, patch: Partial<ComposerPicture>) => {
    setPictures((list) => list.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }, []);

  /** Object URLs made here, revoked with their picture and when the composer closes. */
  const urls = useRef(new Set<string>());
  useEffect(() => {
    const made = urls.current;
    return () => {
      for (const u of made) URL.revokeObjectURL(u);
    };
  }, []);
  const previewOf = (file: File): string | null => {
    try {
      const u = URL.createObjectURL(file);
      urls.current.add(u);
      return u;
    } catch {
      return null;
    }
  };

  const upload = useCallback(
    async (id: string, file: File, ownWork: boolean): Promise<void> => {
      patchPicture(id, { status: 'uploading', progress: 0, error: null, mediaKey: null, serverUrl: null, review: null, rejection: null });
      const res = await client.uploadWithProgress<UploadedPicture>(pictureUploadPath(ownWork), file, (progress) =>
        patchPicture(id, { progress }),
      );
      // The picture may have been removed or replaced while it uploaded.
      setPictures((list) =>
        list.map((p) => {
          if (p.id !== id || p.file !== file || p.ownWork !== ownWork) return p;
          return res.ok
            ? { ...p, status: 'ready', progress: 1, mediaKey: res.data.imageMediaId, serverUrl: res.data.url ?? null, review: res.data.review ?? 'clear' }
            : { ...p, status: 'failed', error: composerErrorText(res.error, t), rejection: res.error.rejection ?? null };
        }),
      );
    },
    [client, patchPicture, t],
  );

  function addFiles(files: File[]): void {
    const room = POST_PICTURES_MAX - pictures.length;
    if (files.length === 0) return;
    if (room <= 0) {
      setNote(t('composer.picturesFull', { max: POST_PICTURES_MAX }));
      return;
    }
    const taking = files.slice(0, room);
    setNote(files.length > room ? t('composer.picturesFull', { max: POST_PICTURES_MAX }) : null);
    const added: ComposerPicture[] = taking.map((file) => ({
      id: localId(),
      file,
      previewUrl: previewOf(file),
      mediaKey: null,
      serverUrl: null,
      altText: '',
      ownWork: true,
      status: 'uploading',
      progress: 0,
      error: null,
      review: null,
      rejection: null,
      existing: false,
    }));
    setPictures((list) => [...list, ...added]);
    for (const p of added) void upload(p.id, p.file!, p.ownWork);
  }

  function removePicture(id: string): void {
    setPictures((list) => {
      const gone = list.find((p) => p.id === id);
      if (gone?.previewUrl && urls.current.has(gone.previewUrl)) {
        URL.revokeObjectURL(gone.previewUrl);
        urls.current.delete(gone.previewUrl);
      }
      const next = list.filter((p) => p.id !== id);
      // A meme needs pictures.
      if (next.length === 0) setMeme(false);
      return next;
    });
    if (openPicture === id) setOpenPicture(null);
    // Return focus to the text box, not the top of the page.
    requestAnimationFrame(() => bodyRef.current?.focus());
  }

  function setOwnWork(id: string, own: boolean): void {
    const p = pictures.find((x) => x.id === id);
    if (!p || !p.file || p.existing) return;
    patchPicture(id, { ownWork: own });
    // The signature is added at upload, so the picture uploads again.
    void upload(id, p.file, own);
  }

  function replaceEdited(id: string, edited: File): void {
    const p = pictures.find((x) => x.id === id);
    setEditingPicture(null);
    if (!p) return;
    patchPicture(id, { file: edited, previewUrl: previewOf(edited) ?? p.previewUrl, existing: false });
    void upload(id, edited, p.ownWork);
  }

  // ---- What it is, and whether it can be posted ---------------------------

  const postType = derivePostType({ title, type });
  const content = {
    type,
    title: showTitle ? title : '',
    body,
    pictures: pictures.map((p) => ({ altText: p.altText })),
    meme: meme && pictures.length > 0,
    sourceCredit: showSource ? source : '',
  };
  const verdict = canPost(content);
  const uploading = pictures.some((p) => p.status === 'uploading');
  const failed = pictures.some((p) => p.status === 'failed');
  const refused = pictures.some((p) => p.rejection);
  const empty = !postTextLength(body) && !postTextLength(title) && !postTextLength(source) && pictures.length === 0;
  const blocker = !verdict.ok
    ? empty
      ? null // An empty box needs no explanation.
      : problemText(verdict.problem, t)
    : uploading
      ? t('composer.waitUploads')
      : refused
        ? t('composer.removeRefused')
        : failed
          ? t('composer.fixFailed')
          : null;
  const ready = verdict.ok && !uploading && !failed && !busy && !held && !postsOff;

  const bodyUsed = postTextLength(body);
  const bodyLeft = POST_BODY_MAX - bodyUsed;
  const titleLeft = POST_TITLE_MAX - postTextLength(title);
  const sourceLeft = POST_SOURCE_MAX - postTextLength(source);

  // ---- The draft on this device --------------------------------------------

  const draft = useMemo<PostDraft>(
    () => ({
      version: POST_DRAFT_VERSION,
      type,
      title: showTitle ? title : '',
      body,
      // Only a picture the server has can be shown again after a reload.
      pictures: pictures
        .filter((p) => p.status === 'ready' && p.mediaKey && p.serverUrl)
        .map((p) => ({ mediaKey: p.mediaKey, localUri: p.serverUrl, altText: p.altText, ownWork: p.ownWork })),
      meme: meme && pictures.length > 0,
      sourceCredit: showSource ? source : '',
      savedAt: Date.now(),
    }),
    [type, showTitle, title, body, pictures, meme, showSource, source],
  );

  useEffect(() => {
    if (mode !== 'create' || !userId) return;
    const timer = setTimeout(() => saveDraft(userId, draft), SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [mode, userId, draft]);

  // ---- Drafts the old phone app saved --------------------------------------

  useEffect(() => {
    if (editing || !userId) return;
    let cancelled = false;
    void client.get<{ posts: ComposedPost[] }>('/me/library/drafts?limit=20').then((res) => {
      if (!cancelled && res.ok) setOldDrafts(res.data.posts ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [client, editing, userId]);

  function finishOldDraft(post: ComposedPost): void {
    setTarget(post);
    setType(initialType(post));
    setTitle(post.title ?? '');
    setBody(post.body);
    setMeme(post.meme);
    setSource(post.sourceCredit ?? '');
    setPictures(initialPictures(post, undefined));
    setShowTitle(postTextLength(post.title) > 0);
    setShowSource(postTextLength(post.sourceCredit) > 0);
    setNote(null);
    setError(null);
    setView('write');
    requestAnimationFrame(() => bodyRef.current?.focus());
  }

  // ---- Posting -------------------------------------------------------------

  async function submit(): Promise<void> {
    if (!ready) return;
    setBusy(true);
    setError(null);
    const media = pictures.map((p) => {
      const alt = cleanPostText(p.altText);
      return alt ? { mediaKey: p.mediaKey!, altText: alt } : { mediaKey: p.mediaKey! };
    });

    let res;
    if (!target) {
      // Every uploaded picture, whether or not the server gave it a display address.
      const request = toCreatePostRequest({
        ...draft,
        pictures: pictures.map((p) => ({ mediaKey: p.mediaKey, localUri: p.serverUrl, altText: p.altText, ownWork: p.ownWork })),
      });
      if (!request) {
        setBusy(false);
        return;
      }
      res = await client.post<ComposedPost>('/library/posts', request);
    } else {
      const patch: UpdatePostRequest = {
        type: postType,
        title: showTitle && cleanPostText(title) ? cleanPostText(title) : null,
        body: cleanPostText(body),
        media,
        meme: meme && pictures.length > 0,
        sourceCredit: showSource && cleanPostText(source) ? cleanPostText(source) : null,
      };
      res = await client.patch<ComposedPost>(`/library/posts/${target.id}`, patch);
      // A draft from the old app is saved, then published.
      if (res.ok && target.status === 'draft') res = await client.post<ComposedPost>(`/library/posts/${target.id}/publish`);
    }
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    if (!target && userId) clearDraft(userId);
    onPosted(res.data);
  }

  // ---- Leaving -------------------------------------------------------------

  const changed = target
    ? cleanPostText(title) !== cleanPostText(target.title) ||
      cleanPostText(body) !== cleanPostText(target.body) ||
      cleanPostText(source) !== cleanPostText(target.sourceCredit) ||
      meme !== target.meme ||
      pictures.length !== target.media.length ||
      pictures.some((p, i) => p.mediaKey !== target.media[i]?.mediaKey || cleanPostText(p.altText) !== cleanPostText(target.media[i]?.altText))
    : !isEmptyDraft(draft) || pictures.length > 0;

  function requestClose(): void {
    if (busy) return;
    if (editingPicture) {
      setEditingPicture(null);
      return;
    }
    if (openPicture) {
      setOpenPicture(null);
      return;
    }
    if (confirmClose || !changed) {
      onClose();
      return;
    }
    setConfirmClose(true);
  }

  function discard(): void {
    if (mode === 'create' && userId) clearDraft(userId);
    onClose();
  }

  // ---- The box -------------------------------------------------------------

  function onBodyKeyDown(e: React.KeyboardEvent<HTMLElement>): void {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void submit();
    }
  }

  function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>): void {
    const files = [...e.clipboardData.files].filter((f) => f.type.startsWith('image/'));
    if (files.length === 0) return;
    e.preventDefault();
    addFiles(files);
  }

  // The box grows with its text, up to the panel's own scroll.
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(el.scrollHeight, 96)}px`;
  }, [body, view]);

  const heading = mode === 'create' ? t('composer.title.new') : mode === 'finish' ? t('composer.title.finish') : t('composer.title.edit');
  const postLabel = mode === 'edit' ? t('composer.save') : t('post.submit');
  const pictureEditing = editingPicture ? pictures.find((p) => p.id === editingPicture) : null;
  const openIndex = pictures.findIndex((p) => p.id === openPicture);

  return (
    <ComposerDialog labelledBy={titleId} onRequestClose={requestClose} initialFocus={bodyRef}>
      <header className="cmp-head">
        <button type="button" className="cmp-cancel" onClick={requestClose} disabled={busy}>
          {pictureEditing ? t('composer.back') : t('common.cancel')}
        </button>
        <h2 className="cmp-title" id={titleId}>
          {pictureEditing ? t('photo.title') : heading}
        </h2>
        {!pictureEditing && (
          <button type="button" className="cmp-post" onClick={() => void submit()} disabled={!ready} aria-describedby={blocker ? `${titleId}-why` : undefined}>
            {busy ? t('post.submitting') : postLabel}
          </button>
        )}
      </header>

      {pictureEditing?.file ? (
        <div className="cmp-scroll">
          <PictureEditor
            file={pictureEditing.file}
            handle={user?.username ?? ''}
            onDone={(edited) => replaceEdited(pictureEditing.id, edited)}
            onCancel={() => setEditingPicture(null)}
          />
        </div>
      ) : confirmClose ? (
        <div className="cmp-confirm" role="alertdialog" aria-labelledby={`${titleId}-confirm`}>
          <p id={`${titleId}-confirm`} className="cmp-confirm-q">
            {mode === 'create' ? t('composer.close.keepQuestion') : t('composer.close.discardQuestion')}
          </p>
          {mode === 'create' && <p className="cmp-hint">{t('composer.close.keepHint')}</p>}
          <div className="cmp-confirm-actions">
            {mode === 'create' && (
              <button
                type="button"
                className="cmp-chip cmp-chip-strong"
                onClick={() => {
                  // The last few keystrokes may still be waiting for the save timer.
                  if (userId) saveDraft(userId, draft);
                  onClose();
                }}
                autoFocus
              >
                {t('composer.close.keep')}
              </button>
            )}
            <button type="button" className="cmp-chip cmp-chip-danger" onClick={discard} autoFocus={mode !== 'create'}>
              {mode === 'create' ? t('composer.close.delete') : t('composer.close.discard')}
            </button>
            <button type="button" className="cmp-chip" onClick={() => setConfirmClose(false)}>
              {t('composer.close.stay')}
            </button>
          </div>
        </div>
      ) : held || postsOff ? (
        <div className="cmp-scroll">{held ? <HeldNotice /> : <ParentalNote />}</div>
      ) : view === 'drafts' ? (
        <div className="cmp-scroll">
          <OldDrafts drafts={oldDrafts} onChoose={finishOldDraft} onBack={() => setView('write')} />
        </div>
      ) : (
        <div
          className="cmp-scroll"
          onDragOver={(e) => {
            if ([...e.dataTransfer.types].includes('Files')) e.preventDefault();
          }}
          onDrop={(e) => {
            const files = [...e.dataTransfer.files].filter((f) => f.type.startsWith('image/') || f.type === '');
            if (files.length === 0) return;
            e.preventDefault();
            addFiles(files);
          }}
        >
          {mode === 'create' && oldDrafts.length > 0 && (
            <p className="cmp-banner">
              {t('composer.oldDrafts.banner', { count: oldDrafts.length })}{' '}
              <button type="button" className="link-button" onClick={() => setView('drafts')}>
                {t('composer.oldDrafts.open')}
              </button>
            </p>
          )}

          {note && (
            <p className="cmp-note" role="status">
              {note}
              {restored && mode === 'create' && (
                <>
                  {' '}
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => {
                      if (userId) clearDraft(userId);
                      setType(null);
                      setTitle('');
                      setBody('');
                      setMeme(false);
                      setSource('');
                      setPictures([]);
                      setShowTitle(false);
                      setShowSource(false);
                      setNote(null);
                      bodyRef.current?.focus();
                    }}
                  >
                    {t('composer.startOver')}
                  </button>
                </>
              )}
            </p>
          )}

          {showTitle && (
            <div className="cmp-field">
              <label className="cmp-label" htmlFor={titleFieldId}>
                {t('post.title')}
              </label>
              <input
                id={titleFieldId}
                dir={textDir(title)}
                className="input cmp-input cmp-title-input"
                value={title}
                placeholder={t('post.titlePlaceholder')}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={onBodyKeyDown}
                aria-invalid={titleLeft < 0}
              />
              {titleLeft < 20 && <span className={`cmp-count${titleLeft < 0 ? ' cmp-over' : ''}`}>{titleLeft}</span>}
              <fieldset className="cmp-kind">
                <legend className="sr-only">{t('post.kind')}</legend>
                {(['story', 'poem'] as const).map((k) => (
                  <label key={k} className={`cmp-kind-option${(k === 'poem' ? type === 'poem' : type !== 'poem') ? ' is-on' : ''}`}>
                    <input
                      type="radio"
                      name={`${titleFieldId}-kind`}
                      checked={k === 'poem' ? type === 'poem' : type !== 'poem'}
                      onChange={() => setType(k === 'poem' ? 'poem' : null)}
                    />
                    {k === 'poem' ? t('civak.kind.poem') : t('civak.kind.story')}
                  </label>
                ))}
              </fieldset>
            </div>
          )}

          <div className="cmp-write">
            <Avatar url={user?.avatarUrl} glyphSize={20} />
            <textarea
              ref={bodyRef}
              dir={textDir(body)}
              className="cmp-body"
              value={body}
              rows={3}
              placeholder={pictures.length > 0 ? t('composer.placeholderPictures') : t('composer.placeholder')}
              aria-label={t('composer.bodyLabel')}
              aria-invalid={bodyLeft < 0}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={onBodyKeyDown}
              onPaste={onPaste}
            />
          </div>

          <PictureTiles
            pictures={pictures}
            openId={openPicture}
            onOpen={setOpenPicture}
            onRemove={removePicture}
            onRetry={(id) => {
              const p = pictures.find((x) => x.id === id);
              if (p?.file) void upload(id, p.file, p.ownWork);
            }}
          />
          <PictureRefusals pictures={pictures} />

          {openIndex >= 0 && (
            <PictureDetails
              picture={pictures[openIndex]!}
              index={openIndex}
              onAltChange={(text) => patchPicture(pictures[openIndex]!.id, { altText: text })}
              onOwnWorkChange={(own) => setOwnWork(pictures[openIndex]!.id, own)}
              onEdit={pictures[openIndex]!.file ? () => setEditingPicture(pictures[openIndex]!.id) : undefined}
              onDone={() => setOpenPicture(null)}
            />
          )}

          {pictures.length > 0 && (
            <div className="cmp-switch-row cmp-meme">
              <input
                id={`${titleId}-meme`}
                type="checkbox"
                role="switch"
                className="cmp-switch"
                checked={meme}
                onChange={(e) => setMeme(e.target.checked)}
              />
              <label htmlFor={`${titleId}-meme`} className="cmp-switch-label">
                {t('composer.meme')}
              </label>
            </div>
          )}

          {showSource && (
            <div className="cmp-field">
              <label className="cmp-label" htmlFor={sourceFieldId}>
                {t('composer.source')}
              </label>
              <input
                id={sourceFieldId}
                dir={textDir(source)}
                className="input cmp-input"
                value={source}
                placeholder={t('composer.sourcePlaceholder')}
                onChange={(e) => setSource(e.target.value)}
                onKeyDown={onBodyKeyDown}
                aria-invalid={sourceLeft < 0}
              />
              {sourceLeft < 20 && <span className={`cmp-count${sourceLeft < 0 ? ' cmp-over' : ''}`}>{sourceLeft}</span>}
            </div>
          )}

          <p className="cmp-hint cmp-own">{t('composer.ownHint')}</p>
        </div>
      )}

      {!held && !postsOff && !pictureEditing && !confirmClose && view === 'write' && (
        <footer className="cmp-foot">
          <div className="cmp-tools" role="toolbar" aria-label={t('composer.tools')}>
            <button
              type="button"
              className="cmp-tool"
              onClick={() => fileRef.current?.click()}
              disabled={pictures.length >= POST_PICTURES_MAX || busy}
              aria-label={t('composer.addPicture', { n: pictures.length, max: POST_PICTURES_MAX })}
              title={t('composer.addPicture', { n: pictures.length, max: POST_PICTURES_MAX })}
            >
              <PhotoIcon size={20} />
            </button>
            <button
              type="button"
              className={`cmp-tool${showTitle ? ' is-on' : ''}`}
              aria-pressed={showTitle}
              aria-label={t('composer.addTitle')}
              title={t('composer.addTitle')}
              onClick={() => {
                const next = !showTitle;
                setShowTitle(next);
                // Removing the title makes it a saying again.
                if (!next) {
                  setTitle('');
                  setType(null);
                }
              }}
            >
              <TextIcon size={20} />
            </button>
            <button
              type="button"
              className={`cmp-tool${showSource ? ' is-on' : ''}`}
              aria-pressed={showSource}
              aria-label={t('composer.addSource')}
              title={t('composer.addSource')}
              onClick={() => {
                const next = !showSource;
                setShowSource(next);
                if (!next) setSource('');
              }}
            >
              <LinkIcon size={20} />
            </button>
          </div>

          {/* One live region each, so nothing is read twice: why Post is not ready (polite) and a refusal (assertive). */}
          <div className="cmp-why-wrap">
            <p className="cmp-why" id={`${titleId}-why`} role="status">
              {blocker ?? ''}
            </p>
            {error &&
              (accountLimitOf(error) ? (
                <SendError error={error} className="cmp-why" />
              ) : (
                <p className="cmp-why cmp-why-error" role="alert">
                  {composerErrorText(error, t)}
                </p>
              ))}
          </div>

          {bodyLeft <= POST_BODY_MAX * 0.1 && (
            <span className={`cmp-count${bodyLeft < 0 ? ' cmp-over' : ''}`} aria-label={t('composer.charsLeft', { n: bodyLeft.toLocaleString() })}>
              {bodyLeft.toLocaleString()}
            </span>
          )}

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            aria-label={t('picture.file')}
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              e.target.value = '';
              addFiles(files);
            }}
          />
        </footer>
      )}
    </ComposerDialog>
  );
}

/** The kind a title cannot imply, which is only a helbest. */
function initialType(post: ComposedPost | null | undefined): WrittenPostType | null {
  return post?.type === 'poem' ? 'poem' : null;
}

function initialPictures(post: ComposedPost | null | undefined, draft: PostDraft | undefined): ComposerPicture[] {
  if (post) {
    return post.media.map((m) => ({
      id: localId(),
      file: null,
      previewUrl: m.url,
      mediaKey: m.mediaKey,
      serverUrl: m.url,
      altText: m.altText ?? '',
      // Unknown for a posted picture (PostMediaView does not say), and never shown for one.
      ownWork: true,
      status: 'ready',
      progress: 1,
      error: null,
      // A held post says so on its own page, so the tiles need not.
      review: null,
      rejection: null,
      existing: true,
    }));
  }
  return (draft?.pictures ?? []).map((p) => ({
    id: localId(),
    file: null,
    previewUrl: p.localUri,
    mediaKey: p.mediaKey,
    serverUrl: p.localUri,
    altText: p.altText,
    ownWork: p.ownWork,
    status: 'ready',
    progress: 1,
    error: null,
    // A draft does not keep whether its picture was held; the post says so once posted.
    review: null,
    rejection: null,
    existing: false,
  }));
}

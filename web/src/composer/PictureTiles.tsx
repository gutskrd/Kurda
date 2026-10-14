import { useId } from 'react';
import { POST_ALT_MAX, postTextLength } from '@kurda/shared';
import { CloseIcon, DrawIcon } from '../components/icons';
import { useT } from '../i18n/I18nProvider';
import { textDir } from './textDir';

/** A picture in the composer: what the draft keeps, and what only this page knows. */
export interface ComposerPicture {
  /** this page's own id for it */
  id: string;
  /** the picked file, while this page has it — needed to upload it again (to edit it, or to change "I made this") */
  file: File | null;
  /** what the tile shows: an object URL, or the uploaded picture's address */
  previewUrl: string | null;
  mediaKey: string | null;
  /** the uploaded picture's public address, which a draft keeps to show it again */
  serverUrl: string | null;
  altText: string;
  /** "I made this": the signature goes on at upload */
  ownWork: boolean;
  status: 'uploading' | 'ready' | 'failed';
  /** 0–1 while uploading */
  progress: number;
  error: string | null;
  /** already on the post being edited: its signature is settled */
  existing: boolean;
}

/**
 * The pictures on a post being written: up to four tiles, each with what it
 * needs — how far its upload is, why it failed and a way to try again, a way
 * to take it off, and a way to describe it.
 *
 * "Describe" opens the details under the tiles rather than a dialog over a
 * dialog: the alt text, "I made this", and Edit. A tile says "ALT" until it
 * has a description and shows a tick once it does, so a picture nobody
 * described is visible at a glance.
 */
export function PictureTiles({
  pictures,
  openId,
  onOpen,
  onRemove,
  onRetry,
}: {
  pictures: ComposerPicture[];
  /** whose details are open */
  openId: string | null;
  onOpen: (id: string | null) => void;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
}): React.JSX.Element | null {
  const t = useT();
  if (pictures.length === 0) return null;
  return (
    <ul className={`cmp-tiles cmp-tiles-${pictures.length}`} aria-label={t('composer.pictures')}>
      {pictures.map((p, i) => {
        const n = i + 1;
        const described = postTextLength(p.altText) > 0;
        return (
          <li key={p.id} className={`cmp-tile${openId === p.id ? ' is-open' : ''}${p.status === 'failed' ? ' is-failed' : ''}`}>
            {p.previewUrl ? (
              <img src={p.previewUrl} alt={described ? p.altText : t('composer.pictureN', { n })} />
            ) : (
              <span className="cmp-tile-empty" aria-hidden="true" />
            )}

            {p.status === 'uploading' && (
              <span className="cmp-tile-progress" role="progressbar" aria-label={t('composer.uploadingN', { n })}
                aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p.progress * 100)}>
                <span style={{ width: `${Math.max(4, Math.round(p.progress * 100))}%` }} />
              </span>
            )}

            {p.status === 'failed' && (
              <span className="cmp-tile-failed">
                <span>{p.error}</span>
                {p.file && (
                  <button type="button" className="cmp-chip" onClick={() => onRetry(p.id)}>
                    {t('common.retry')}
                  </button>
                )}
              </span>
            )}

            <button type="button" className="cmp-tile-remove" aria-label={t('composer.removePictureN', { n })} onClick={() => onRemove(p.id)}>
              <CloseIcon size={16} />
            </button>

            {p.status !== 'failed' && (
              <button
                type="button"
                className={`cmp-tile-alt${described ? ' is-done' : ''}`}
                aria-expanded={openId === p.id}
                aria-label={described ? t('composer.editDetailsN', { n }) : t('composer.describeN', { n })}
                onClick={() => onOpen(openId === p.id ? null : p.id)}
              >
                {described ? '✓ ' : ''}
                {t('composer.alt')}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** The open picture's details: what it shows, whether you made it, and Edit. */
export function PictureDetails({
  picture,
  index,
  onAltChange,
  onOwnWorkChange,
  onEdit,
  onDone,
}: {
  picture: ComposerPicture;
  index: number;
  onAltChange: (text: string) => void;
  onOwnWorkChange: (own: boolean) => void;
  /** absent when there is nothing this page can edit (the file is not here) */
  onEdit?: () => void;
  onDone: () => void;
}): React.JSX.Element {
  const t = useT();
  const altId = useId();
  const ownId = useId();
  const used = postTextLength(picture.altText);
  // the signature is decided at upload: only a picture this page still has can go up again
  const canChangeOwn = !picture.existing && picture.file !== null;

  return (
    <section className="cmp-details" aria-label={t('composer.detailsN', { n: index + 1 })}>
      <label className="cmp-label" htmlFor={altId}>
        {t('composer.altLabel')}
      </label>
      <textarea
        id={altId}
        dir={textDir(picture.altText)}
        className="input cmp-input cmp-alt"
        rows={2}
        value={picture.altText}
        placeholder={t('composer.altPlaceholder')}
        aria-describedby={`${altId}-hint`}
        onChange={(e) => onAltChange(e.target.value)}
      />
      <p className="cmp-hint" id={`${altId}-hint`}>
        {t('composer.altHint')}
        {used > POST_ALT_MAX * 0.9 && (
          <span className={used > POST_ALT_MAX ? ' cmp-over' : ''}> {t('composer.charsLeft', { n: (POST_ALT_MAX - used).toLocaleString() })}</span>
        )}
      </p>

      <div className="cmp-switch-row">
        <input
          id={ownId}
          type="checkbox"
          role="switch"
          className="cmp-switch"
          checked={picture.ownWork}
          disabled={!canChangeOwn}
          aria-describedby={`${ownId}-hint`}
          onChange={(e) => onOwnWorkChange(e.target.checked)}
        />
        <label htmlFor={ownId} className="cmp-switch-label">
          {t('composer.ownWork')}
        </label>
      </div>
      <p className="cmp-hint" id={`${ownId}-hint`}>
        {canChangeOwn ? t('composer.ownWorkHint') : t('composer.ownWorkFixed')}
      </p>

      <div className="cmp-details-actions">
        {onEdit && (
          <button type="button" className="cmp-chip" onClick={onEdit}>
            <DrawIcon size={16} />
            {t('composer.editPicture')}
          </button>
        )}
        <button type="button" className="cmp-chip cmp-chip-strong" onClick={onDone}>
          {t('composer.detailsDone')}
        </button>
      </div>
    </section>
  );
}

import { useId } from 'react';
import { POST_ALT_MAX, postTextLength, type PictureRejection, type PictureReviewState } from '@kurda/shared';
import { BlockIcon, CloseIcon, DrawIcon, ShieldIcon } from '../components/icons';
import { useT } from '../i18n/I18nProvider';
import { PictureRefusal } from '../pictures/PictureCheck';
import { textDir } from './textDir';

/** A picture in the composer: what the draft keeps, and what only this page knows. */
export interface ComposerPicture {
  /** This page's own id for it. */
  id: string;
  /** The picked file while this page has it, needed to upload again after an edit or an "I made this" change. */
  file: File | null;
  /** What the tile shows: an object URL or the uploaded picture's address. */
  previewUrl: string | null;
  mediaKey: string | null;
  /** The uploaded picture's public address, which a draft keeps to show it again. */
  serverUrl: string | null;
  altText: string;
  /** "I made this", which adds the signature at upload. */
  ownWork: boolean;
  status: 'uploading' | 'ready' | 'failed';
  /** From 0 to 1 while uploading. */
  progress: number;
  error: string | null;
  /** Uploaded, and shown to others at once (`clear`) or only once a person has checked it (`held`); null before then. */
  review: PictureReviewState | null;
  /** Refused at upload, with its reason and whether a person can be asked to look; uploading it again cannot help. */
  rejection: PictureRejection | null;
  /** Already on the post being edited, so its signature is settled. */
  existing: boolean;
}

/**
 * The pictures on a post being written: up to four tiles with upload progress, errors and retry, remove, and describe.
 * "Describe" opens the details (alt text, "I made this", Edit) below rather than in a nested dialog. A tile says "ALT"
 * until described and shows a tick once it is. A picture held for a person to check is marked, with one line under the
 * tiles saying so; a refused one is dimmed, and why it was refused is said under the tiles (PictureRefusals).
 */
export function PictureTiles({
  pictures,
  openId,
  onOpen,
  onRemove,
  onRetry,
}: {
  pictures: ComposerPicture[];
  /** Whose details are open. */
  openId: string | null;
  onOpen: (id: string | null) => void;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
}): React.JSX.Element | null {
  const t = useT();
  const heldId = useId();
  if (pictures.length === 0) return null;
  const held = pictures.some((p) => p.status === 'ready' && p.review === 'held');
  return (
    <>
      <ul className={`cmp-tiles cmp-tiles-${pictures.length}`} aria-label={t('composer.pictures')}>
        {pictures.map((p, i) => {
          const n = i + 1;
          const described = postTextLength(p.altText) > 0;
          const isHeld = p.status === 'ready' && p.review === 'held';
          return (
            <li
              key={p.id}
              className={`cmp-tile${openId === p.id ? ' is-open' : ''}${p.status === 'failed' ? ' is-failed' : ''}${p.rejection ? ' is-refused' : ''}`}
              aria-describedby={isHeld ? heldId : undefined}
            >
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

              {isHeld && (
                <span className="cmp-tile-held" aria-hidden="true">
                  <ShieldIcon size={14} />
                </span>
              )}

              {p.status === 'failed' && p.rejection && (
                <span className="cmp-tile-failed" aria-hidden="true">
                  <BlockIcon size={26} />
                </span>
              )}
              {p.status === 'failed' && !p.rejection && (
                <span className="cmp-tile-failed">
                  <span className="cmp-tile-why">{p.error}</span>
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
      {held && (
        <p className="cmp-held" id={heldId}>
          <ShieldIcon size={14} />
          {t('pictureCheck.held.upload')}
        </p>
      )}
    </>
  );
}

/** Why each refused picture was refused, with the way to ask a person, numbered when the post has more than one. */
export function PictureRefusals({ pictures }: { pictures: ComposerPicture[] }): React.JSX.Element | null {
  const t = useT();
  const refused = pictures.map((p, i) => ({ p, n: i + 1 })).filter(({ p }) => p.rejection);
  if (refused.length === 0) return null;
  return (
    <div className="cmp-refusals">
      {refused.map(({ p, n }) => (
        <section key={p.id} aria-label={t('composer.pictureN', { n })}>
          {pictures.length > 1 && <h3 className="cmp-refusal-n">{t('composer.pictureN', { n })}</h3>}
          <PictureRefusal rejection={p.rejection!} />
        </section>
      ))}
    </div>
  );
}

/** The open picture's details: its description, whether you made it, and Edit. */
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
  /** Omitted when this page does not have the file to edit. */
  onEdit?: () => void;
  onDone: () => void;
}): React.JSX.Element {
  const t = useT();
  const altId = useId();
  const ownId = useId();
  const used = postTextLength(picture.altText);
  // The signature is set at upload, so only a picture this page still has can be uploaded again.
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

      {picture.existing ? (
        // The server does not say whether a posted picture was signed, so no switch claims either way.
        <p className="cmp-hint cmp-own-posted">{t('composer.ownWorkPosted')}</p>
      ) : (
        <>
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
        </>
      )}

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

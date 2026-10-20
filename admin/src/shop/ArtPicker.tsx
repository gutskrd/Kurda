/**
 * Choosing an item's picture: a file from the picker or dropped on the frame,
 * shown at once, checked here, then uploaded straight away so the server's
 * own checks answer before the form is saved. The frame is the shape the apps
 * draw it in — a background 16:9, an icon square over a checkerboard, so what
 * is see-through looks see-through.
 */
import { useEffect, useId, useRef, useState, type DragEvent } from 'react';
import { apiUpload } from '../api';
import { Icon } from '../ui';
import { ACCEPTED_TYPES, ART_RULES, KIND_NAME, artSrc, checkFile, checkSize, ruleText, uploadProblem } from './art';
import { fileBytes, measureImage } from './measure';
import type { ArtKind } from './model';
import './shop.css';

/** What the server stored: the key to save the item with, and what it made of the picture. */
export interface UploadedArt {
  key: string;
  url: string;
  width: number;
  height: number;
  bytes: number;
  contentType: string;
  trimmed: boolean;
}

type Status = { at: 'idle' } | { at: 'uploading' } | { at: 'done'; art: UploadedArt } | { at: 'failed'; problem: string };

const kb = (bytes: number): string => `${Math.max(1, Math.round(bytes / 1024))} KB`;

export function ArtPicker({
  kind,
  currentUrl,
  onChange,
  onBusy,
  error,
}: {
  kind: ArtKind;
  /** the item's art as it is now (editing), or null for a new item */
  currentUrl: string | null;
  /** a new picture is stored (or the last one failed: null) */
  onChange: (art: UploadedArt | null) => void;
  /** an upload is running: the form waits for it */
  onBusy: (busy: boolean) => void;
  /** the form's own complaint (no picture yet, or one the save refused) */
  error?: string | null;
}): React.JSX.Element {
  const inputId = useId();
  const statusId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>({ at: 'idle' });
  const [dragging, setDragging] = useState(false);
  const [broken, setBroken] = useState(false);
  // a later pick wins over an earlier one still uploading
  const ticket = useRef(0);
  const names = KIND_NAME[kind];

  useEffect(
    () => () => {
      if (preview && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(preview);
    },
    [preview],
  );

  async function take(file: File | undefined): Promise<void> {
    if (!file) return;
    const mine = ++ticket.current;
    const fail = (problem: string): void => {
      if (mine !== ticket.current) return;
      // back to the picture the item has, with what was wrong with this one
      setPreview(null);
      setStatus({ at: 'failed', problem });
      onChange(null);
      onBusy(false);
    };
    setBroken(false);
    setPreview(typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : null);
    const wrongFile = checkFile(file);
    if (wrongFile) return fail(wrongFile);
    setStatus({ at: 'uploading' });
    onBusy(true);
    const size = await measureImage(file);
    // a size the browser could not read is left to the server, which reads every format it takes
    const wrongSize = size ? checkSize(kind, size.width, size.height) : null;
    if (wrongSize) return fail(wrongSize);
    try {
      const type = (ACCEPTED_TYPES as readonly string[]).includes(file.type) ? file.type : 'application/octet-stream';
      const art = await apiUpload<UploadedArt>(`/admin/shop/art/${kind}`, await fileBytes(file), type, 'POST');
      if (mine !== ticket.current) return;
      setStatus({ at: 'done', art });
      onChange(art);
      onBusy(false);
    } catch (err) {
      fail(uploadProblem(kind, err));
    }
  }

  function drop(e: DragEvent): void {
    e.preventDefault();
    setDragging(false);
    void take(e.dataTransfer.files[0]);
  }

  const shown = preview ?? artSrc(currentUrl);
  const problem = status.at === 'failed' ? status.problem : (error ?? null);
  const hasArt = Boolean(shown);

  return (
    <div className="field art-picker">
      <span className="art-picker-label" id={`${inputId}-label`}>
        Picture <span className="field-required" aria-hidden="true">*</span>
      </span>
      <div
        className={`art-frame is-${kind}${dragging ? ' is-dragging' : ''}${problem ? ' has-error' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={drop}
      >
        {shown && !broken ? (
          <img
            src={shown}
            alt={preview ? `The new ${names.one}` : `The ${names.one} as it is now`}
            onError={() => setBroken(true)}
          />
        ) : (
          <div className="art-frame-empty">
            <Icon name="upload" size={22} />
            <span>{broken ? 'This picture can’t be shown here' : `Drop ${names.a} picture here`}</span>
          </div>
        )}
        {status.at === 'uploading' && (
          <div className="art-frame-busy">
            <span className="spinner" aria-hidden="true" />
            Uploading…
          </div>
        )}
      </div>
      <div className="art-picker-row">
        <button type="button" className="art-picker-choose" onClick={() => input.current?.click()} aria-describedby={statusId}>
          <Icon name="upload" />
          {hasArt ? 'Replace picture' : 'Choose a picture'}
        </button>
        <input
          ref={input}
          id={inputId}
          className="sr-only"
          type="file"
          tabIndex={-1}
          aria-label={`${names.one.charAt(0).toUpperCase()}${names.one.slice(1)} picture file`}
          accept={ACCEPTED_TYPES.join(',')}
          onChange={(e) => {
            void take(e.target.files?.[0]);
            // the same file picked again is a new pick (after fixing it elsewhere)
            e.target.value = '';
          }}
        />
      </div>
      <div id={statusId} className="art-picker-status">
        {problem ? (
          <div className="field-error" role="alert">
            {problem}
          </div>
        ) : status.at === 'done' ? (
          <div className="field-hint art-picker-ok">
            <Icon name="check" size={14} />
            Stored at {status.art.width}×{status.art.height}, {kb(status.art.bytes)}
            {status.art.trimmed ? ', a sliver trimmed to make it exactly ' + ART_RULES[kind].shape : ''}.
          </div>
        ) : (
          <div className="field-hint">{ruleText(kind)}</div>
        )}
      </div>
    </div>
  );
}

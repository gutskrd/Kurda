/**
 * Pictures the console shows from the API's own routes rather than from storage: fetched once with the moderator's
 * session and shown as a local copy, so no storage address reaches the browser and the image policy in
 * public/_headers stays closed to other hosts. The copy's address is given back as soon as the picture is hidden.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiBlob } from './api';
import { errorLine } from './ui/errors';

export interface ApiImage {
  /** The local copy's address while shown, else null. */
  src: string | null;
  busy: boolean;
  error: string | null;
  /** Fetch it (the first time only) and show it; false when it could not be fetched. */
  show: () => Promise<boolean>;
  hide: () => void;
  /** The copy did not decode: forget it, so showing it again fetches it again. */
  failed: (message: string) => void;
}

/** A picture at an API path, fetched on the first show and kept while the component lives; a null path shows nothing. */
export function useApiImage(path: string | null, what = 'pictures'): ApiImage {
  const copy = useRef<Blob | null>(null);
  const address = useRef<string | null>(null);
  const alive = useRef(true);
  const [src, setSrc] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const release = useCallback((): void => {
    if (address.current) URL.revokeObjectURL(address.current);
    address.current = null;
  }, []);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      release();
    };
  }, [release]);

  const show = useCallback(async (): Promise<boolean> => {
    if (!path) return false;
    setError(null);
    if (!copy.current) {
      setBusy(true);
      try {
        const blob = await apiBlob(path);
        if (!alive.current) return false;
        copy.current = blob;
      } catch (err) {
        if (alive.current) setError(errorLine(err, what));
        return false;
      } finally {
        if (alive.current) setBusy(false);
      }
    }
    release();
    address.current = URL.createObjectURL(copy.current);
    setSrc(address.current);
    return true;
  }, [path, what, release]);

  const hide = useCallback((): void => {
    release();
    setSrc(null);
  }, [release]);

  const failed = useCallback(
    (message: string): void => {
      copy.current = null;
      release();
      setSrc(null);
      setError(message);
    },
    [release],
  );

  return { src, busy, error, show, hide, failed };
}

/**
 * Where a case's evidence picture is fetched through the API, or null while the API has no such route and the console
 * shows the case's signed link as before. Switching over is this one line.
 */
export function caseEvidenceImagePath(_caseId: string, _mediaKey: string): string | null {
  return null;
}

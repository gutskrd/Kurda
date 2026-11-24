import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { AppState, Linking, Platform, Share } from 'react-native';
import { describeError, isMaintenance } from '../api/errors';
import { useAuth } from '../auth/AuthContext';
import { haptic } from '../feedback/haptics';
import { useI18n } from '../i18n/I18nContext';

/** The copy's state (GET /me/export); a ready one comes with a fresh link that works for 15 minutes. */
export interface ExportStatus {
  status: 'none' | 'pending' | 'ready';
  downloadUrl?: string;
  requestedAt?: string;
  /** When the copy was finished, for "Made on"; an older server sends only when it was asked for. */
  completedAt?: string;
}

/** The day a copy is said to be made on: when it was finished, else when it was asked for. */
export function madeAt(status: ExportStatus | null): string | null {
  return status?.completedAt ?? status?.requestedAt ?? null;
}

/** How often a copy being prepared is asked after: often at first, while it is usually done, then gently. */
export const POLL_FAST_MS = 3000;
export const POLL_SLOW_MS = 15_000;
export const POLL_FAST_FOR_MS = 120_000;

/** The file's name, as the server names its download, by the day the copy was made. */
export function exportFileName(madeOn: string | undefined, now: Date = new Date()): string {
  const day = madeOn && /^\d{4}-\d{2}-\d{2}/.test(madeOn) ? madeOn.slice(0, 10) : now.toISOString().slice(0, 10);
  return `hevalo-data-${day}.json`;
}

type FileSystem = typeof import('expo-file-system');

/**
 * Put the copy where the person can keep it. On an iPhone it is downloaded into the cache and handed to the share
 * sheet, from which it can be saved to Files, sent or AirDropped; on Android and the web the link is opened, and the
 * browser saves it as a file, since the server sends it as an attachment.
 */
export async function saveExport(url: string, fileName: string, title: string): Promise<boolean> {
  try {
    if (Platform.OS === 'ios') {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require('expo-file-system') as FileSystem;
      const file = await fs.File.downloadFileAsync(url, new fs.File(fs.Paths.cache, fileName), { idempotent: true });
      await Share.share({ url: file.uri, title });
      return true;
    }
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

export interface DataExport {
  /** Null until first read. */
  status: ExportStatus | null;
  /** Asking for a copy, or fetching one to save. */
  busy: 'request' | 'download' | null;
  /** What went wrong last, in words, until the next try. */
  failed: string | null;
  /** A new copy was asked for while today's was ready, and today's is what there is: one a day. */
  onceADay: boolean;
  request: () => void;
  download: () => void;
}

/**
 * A copy of the account's data, as a small state machine on the page rather than a series of alerts: none, asked for
 * and being prepared, then ready to save with a fresh link each time. While one is being prepared and the page is in
 * front, it is asked after every few seconds for two minutes, then every fifteen, and never once the page is left.
 */
export function useDataExport(enabled: boolean): DataExport {
  const { client } = useAuth();
  const { t } = useI18n();
  const [status, setStatus] = useState<ExportStatus | null>(null);
  const [busy, setBusy] = useState<DataExport['busy']>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [onceADay, setOnceADay] = useState(false);

  const read = useCallback(async (): Promise<ExportStatus | null> => {
    const res = await client.get<ExportStatus>('/me/export');
    if (!res.ok) {
      if (!isMaintenance(res.error)) setFailed(describeError(res.error, t));
      return null;
    }
    setStatus(res.data);
    return res.data;
  }, [client, t]);

  useFocusEffect(
    useCallback(() => {
      if (enabled) void read();
    }, [enabled, read]),
  );

  const pending = status?.status === 'pending';
  useFocusEffect(
    useCallback(() => {
      if (!enabled || !pending) return;
      const started = Date.now();
      let live = true;
      let timer: ReturnType<typeof setTimeout> | null = null;
      const next = (): void => {
        timer = setTimeout(tick, Date.now() - started < POLL_FAST_FOR_MS ? POLL_FAST_MS : POLL_SLOW_MS);
      };
      const tick = async (): Promise<void> => {
        // Nobody is looking while the app is in the background, so nothing is asked.
        if (AppState.currentState !== 'background') await read();
        if (live) next();
      };
      next();
      return () => {
        live = false;
        if (timer) clearTimeout(timer);
      };
    }, [enabled, pending, read]),
  );

  const request = useCallback(() => {
    if (busy) return;
    setBusy('request');
    setFailed(null);
    setOnceADay(false);
    void client.post<{ requested: boolean; reused?: boolean }>('/me/export').then(async (res) => {
      if (!res.ok) {
        setBusy(null);
        haptic('error');
        if (!isMaintenance(res.error)) setFailed(describeError(res.error, t));
        return;
      }
      await read();
      setBusy(null);
      haptic('tap');
      // The server keeps one copy a day and answers a second ask with the one already made today.
      if (res.data?.reused) setOnceADay(true);
    });
  }, [busy, client, read, t]);

  const download = useCallback(() => {
    if (busy) return;
    setBusy('download');
    setFailed(null);
    void (async () => {
      // A fresh link every time: the one shown may be older than its fifteen minutes.
      const fresh = await read();
      // Unread says why itself; a copy no longer ready shows its new state instead.
      if (!fresh || fresh.status !== 'ready' || !fresh.downloadUrl) {
        setBusy(null);
        return;
      }
      const saved = await saveExport(fresh.downloadUrl, exportFileName(madeAt(fresh) ?? undefined), t('storage.shareTitle'));
      setBusy(null);
      if (!saved) {
        haptic('error');
        setFailed(t('storage.downloadFailed'));
      }
    })();
  }, [busy, read, t]);

  return { status, busy, failed, onceADay, request, download };
}

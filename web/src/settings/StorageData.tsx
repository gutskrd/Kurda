import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { Button } from '../components/Button';
import { useI18n, useT } from '../i18n/I18nProvider';
import { describeError } from '../lib/api';
import { useCountUp } from '../lib/motion';
import { pageVisible } from '../lib/pollWhileVisible';
import type { ApiError } from '../lib/types';
import { calendarDay } from '../parental/words';
import { cacheSize, clearCache, sizeText } from './clearCache';
import { SettingsSection } from './SettingsList';

/**
 * Settings → Storage and data: what this browser keeps, with a way to clear it, and a copy of everything Hevalo holds
 * about you, asked for, prepared and downloaded on this page.
 */
export function StorageData({ onCleared }: { onCleared?: () => void }): React.JSX.Element {
  const t = useT();
  return (
    <>
      <SettingsSection title={t('settings.storage.device')}>
        <li className="settings-block">
          <CacheControl onCleared={onCleared} />
        </li>
      </SettingsSection>
      <SettingsSection title={t('settings.data.title')}>
        <li className="settings-block">
          <YourData />
        </li>
      </SettingsSection>
    </>
  );
}

/** The cache's size where the browser will say, and Clear, which shows the new size counting down to it. */
function CacheControl({ onCleared }: { onCleared?: () => void }): React.JSX.Element {
  const t = useT();
  const { locale } = useI18n();
  const [size, setSize] = useState<{ was: number; now: number } | null>(null);
  const [phase, setPhase] = useState<'idle' | 'clearing' | 'cleared'>('idle');
  const shown = useCountUp(size?.now ?? 0, { from: size?.was ?? 0 });

  useEffect(() => {
    let gone = false;
    void cacheSize().then((bytes) => {
      if (!gone && bytes !== null) setSize({ was: bytes, now: bytes });
    });
    return () => {
      gone = true;
    };
  }, []);

  async function clear(): Promise<void> {
    setPhase('clearing');
    await clearCache();
    const after = await cacheSize();
    setSize((s) => (after === null ? s : { was: s?.now ?? after, now: after }));
    setPhase('cleared');
    onCleared?.();
  }

  return (
    <div className="settings-store">
      <div className="settings-store-head">
        <span className="settings-store-title">{t('settings.cache.title')}</span>
        {size && (
          <span className="settings-store-size" aria-label={sizeText(size.now, locale)}>
            {sizeText(shown, locale)}
          </span>
        )}
      </div>
      <p className="settings-page-intro">{t('settings.cache.help')}</p>
      <div className="settings-store-actions">
        <Button variant="secondary" disabled={phase === 'clearing'} onClick={() => void clear()}>
          {phase === 'clearing' ? t('settings.cache.clearing') : t('settings.cache.clear')}
        </Button>
        <span className="settings-store-said" role="status">
          {phase === 'cleared' ? t('settings.cache.cleared') : ''}
        </span>
      </div>
    </div>
  );
}

/** `GET /me/export`: whether a copy exists, is being made, or is ready with a fresh link. */
interface ExportStatus {
  status: 'none' | 'pending' | 'ready';
  downloadUrl?: string;
  requestedAt?: string;
  completedAt?: string;
}

type Copy =
  | { kind: 'loading' }
  | { kind: 'none' }
  | { kind: 'asking' }
  | { kind: 'pending' }
  | { kind: 'ready'; madeAt: string | null }
  | { kind: 'unavailable' };

/** Poll a copy being made every few seconds for its first two minutes, then every quarter minute, while the page shows. */
const POLL_FAST_MS = 3_000;
const POLL_SLOW_MS = 15_000;
const FAST_FOR_MS = 120_000;

/**
 * A copy of your data as a small state machine: none (ask for one), being prepared (a spinner, checked on while this
 * page is open), ready (download it, or make a new one, of which the server allows one a day). Each download asks for a
 * fresh link, which the server signs to be saved as a file.
 */
function YourData(): React.JSX.Element {
  const { client } = useAuth();
  const t = useT();
  const { locale } = useI18n();
  const [copy, setCopy] = useState<Copy>({ kind: 'loading' });
  const [note, setNote] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const fromStatus = (s: ExportStatus): Copy =>
    s.status === 'ready' ? { kind: 'ready', madeAt: s.completedAt ?? s.requestedAt ?? null } : s.status === 'pending' ? { kind: 'pending' } : { kind: 'none' };
  const said = (error: ApiError): string => (error.code === 'EXPORT_NOT_AVAILABLE' ? t('error.code.exportNotAvailable') : describeError(error, t));

  useEffect(() => {
    let gone = false;
    void client.get<ExportStatus>('/me/export').then((res) => {
      if (gone) return;
      if (res.ok) setCopy(fromStatus(res.data));
      else if (res.error.code === 'EXPORT_NOT_AVAILABLE') setCopy({ kind: 'unavailable' });
      else setCopy({ kind: 'none' });
    });
    return () => {
      gone = true;
    };
    // Read once on opening; the poll below takes over while a copy is made.
  }, [client]);

  // While a copy is made, ask after it; the page closing ends the asking.
  const pending = copy.kind === 'pending';
  const began = useRef(0);
  useEffect(() => {
    if (!pending) return;
    began.current = Date.now();
    let timer = 0;
    let gone = false;
    const next = (): void => {
      timer = window.setTimeout(tick, Date.now() - began.current < FAST_FOR_MS ? POLL_FAST_MS : POLL_SLOW_MS);
    };
    const tick = (): void => {
      if (!pageVisible()) return next();
      void client.get<ExportStatus>('/me/export').then((res) => {
        if (gone) return;
        if (res.ok && res.data.status !== 'pending') setCopy(fromStatus(res.data));
        else next();
      });
    };
    next();
    return () => {
      gone = true;
      window.clearTimeout(timer);
    };
  }, [pending, client]);

  async function ask(): Promise<void> {
    const before = copy.kind === 'ready' ? copy.madeAt : null;
    setNote(null);
    setCopy({ kind: 'asking' });
    const res = await client.post<{ requested: boolean; reused?: boolean }>('/me/export');
    if (!res.ok) {
      if (res.error.code === 'EXPORT_NOT_AVAILABLE') setCopy({ kind: 'unavailable' });
      else {
        setCopy(before !== null ? { kind: 'ready', madeAt: before } : { kind: 'none' });
        setNote(said(res.error));
      }
      return;
    }
    const status = await client.get<ExportStatus>('/me/export');
    if (!status.ok) {
      setCopy({ kind: 'pending' });
      return;
    }
    const now = fromStatus(status.data);
    // One copy a day: asking again the same day keeps the one already made, which is said rather than hidden.
    if (res.data?.reused === true || (now.kind === 'ready' && before !== null && now.madeAt === before)) setNote(t('settings.data.oncePerDay'));
    setCopy(now.kind === 'none' ? { kind: 'pending' } : now);
  }

  async function download(): Promise<void> {
    setNote(null);
    setDownloading(true);
    const res = await client.get<ExportStatus>('/me/export');
    setDownloading(false);
    if (res.ok && res.data.status === 'ready' && res.data.downloadUrl) {
      // The link is signed to arrive as a file, so the browser saves it and this page stays.
      window.location.assign(res.data.downloadUrl);
      return;
    }
    if (res.ok) setCopy(fromStatus(res.data));
    setNote(res.ok ? t('settings.data.downloadFailed') : said(res.error));
  }


  let body: React.ReactNode;
  switch (copy.kind) {
    case 'loading':
      body = <span className="settings-store-wait" aria-hidden="true" />;
      break;
    case 'unavailable':
      body = <p className="settings-page-note">{t('error.code.exportNotAvailable')}</p>;
      break;
    case 'none':
    case 'asking':
      body = (
        <Button variant="secondary" disabled={copy.kind === 'asking'} onClick={() => void ask()}>
          {copy.kind === 'asking' ? t('settings.data.requesting') : t('settings.data.request')}
        </Button>
      );
      break;
    case 'pending':
      body = (
        <div className="settings-store-pending" role="status">
          <span className="spinner settings-store-spinner" aria-hidden="true" />
          <span>
            <span className="settings-store-title">{t('settings.data.preparing')}</span>
            <span className="settings-store-sub">{t('settings.data.preparingHint')}</span>
          </span>
        </div>
      );
      break;
    case 'ready': {
      const date = copy.madeAt ? calendarDay(t, copy.madeAt, locale) : null;
      body = (
        <div className="settings-store-ready">
          <Button disabled={downloading} onClick={() => void download()}>
            {t('settings.data.download')}
          </Button>
          {date && <span className="settings-store-sub">{t('settings.data.madeOn', { date })}</span>}
          <button type="button" className="link-button settings-store-again" onClick={() => void ask()}>
            {t('settings.data.again')}
          </button>
        </div>
      );
      break;
    }
  }

  return (
    <div className="settings-store">
      <p className="settings-page-intro">{t('settings.data.help')}</p>
      {body}
      {note && (
        <p className="settings-page-note" role="status">
          {note}
        </p>
      )}
    </div>
  );
}

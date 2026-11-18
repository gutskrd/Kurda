import { useState } from 'react';
import { shouldShowRefreshNotice, type RefreshedInventory } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { useApiGet } from '../lib/useApi';
import type { InventoryItem } from '../lib/types';
import { Button } from '../components/Button';
import { useT } from '../i18n/I18nProvider';
import './refreshed.css';

/**
 * Telling owners once that their backgrounds or icons have new art and are still theirs (flow in
 * shared/src/cosmetics.ts). The notice stays until dismissed, which is what tells the server.
 */

/** `GET /me/inventory` as this needs it. */
export interface InventoryWithNotice extends Partial<RefreshedInventory> {
  items: InventoryItem[];
}

/** The one-time "we refreshed your items" notice, wherever the inventory has already been loaded. */
export function RefreshedNotice({ inventory }: { inventory: InventoryWithNotice | null | undefined }): React.JSX.Element | null {
  const { client } = useAuth();
  const t = useT();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || !shouldShowRefreshNotice(inventory)) return null;

  function dismiss(): void {
    setDismissed(true);
    // Fire and forget: if it fails, the notice simply comes back next time.
    void client.post('/me/inventory/refreshed/seen');
  }

  return (
    <section className="refresh-notice" aria-labelledby="refresh-notice-title">
      <div className="refresh-notice-text">
        <h2 id="refresh-notice-title" className="refresh-notice-title">
          {t('refresh.title')}
        </h2>
        <p className="refresh-notice-body">{t('refresh.bodyKeep')}</p>
      </div>
      <div className="refresh-notice-actions">
        <Button onClick={dismiss}>{t('refresh.gotIt')}</Button>
      </div>
    </section>
  );
}

/** The notice for a page that has not loaded the inventory itself (Edit Profile). */
export function RefreshedNoticeLoader(): React.JSX.Element | null {
  const inventory = useApiGet<InventoryWithNotice>('/me/inventory');
  return <RefreshedNotice inventory={inventory.data} />;
}

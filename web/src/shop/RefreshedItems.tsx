import { useState } from 'react';
import { shouldShowRefreshNotice, type RefreshedInventory } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { useApiGet } from '../lib/useApi';
import type { InventoryItem } from '../lib/types';
import { Button } from '../components/Button';
import { useT } from '../i18n/I18nProvider';
import './refreshed.css';

/**
 * Backgrounds and icons whose art was replaced, from their owner's side
 * (shared/src/cosmetics.ts has the whole flow).
 *
 * The owner is told once that their items have new art, and that they are
 * still theirs. That is all there is to it: a purchase is final, so nothing
 * here offers anything back. The notice stays until it is dismissed — "once"
 * means once read, not once rendered on a page scrolled past — and dismissing
 * it is what tells the server.
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
    // fire and forget: if it fails, the notice comes back next time, which is
    // the better way round for something about a person's own things
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

/**
 * Trying a look on before buying it: your own profile card as others see it, wearing what you have on now with the
 * item or the bundle laid over it. Nothing is saved and only you see it.
 */
import { useEffect, useState } from 'react';
import { itemCategory, type ProfileWordTag } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import type { ProfileBackground, ProfileIcon, PublicProfile } from '../lib/types';
import { Modal } from '../components/Modal';
import { Button } from '../components/Button';
import { ProfileCard } from '../ui/ProfileCard';
import { useT } from '../i18n/I18nProvider';
import { isVideoArt } from './ItemPicture';

/** What a preview lays over your profile; anything left out stays as you wear it now. */
export interface PreviewLook {
  background?: ProfileBackground;
  icon?: ProfileIcon;
  frame?: { sku: string; url: string };
  tag?: ProfileWordTag;
}

/** A shop item as the part of a look it would be on a profile, or nothing for an item that is not worn. */
export function lookOf(item: { sku: string; name: string; description: string | null; category: string; assetUrl: string | null }): PreviewLook {
  const kind = itemCategory(item.category);
  if (kind === 'tag' && item.sku !== 'tag_kurdish') return { tag: { sku: item.sku, label: item.name, meaning: item.description } };
  if (!item.assetUrl) return {};
  if (kind === 'background') return { background: { sku: item.sku, assetKey: item.sku, url: item.assetUrl, type: isVideoArt(item.assetUrl) ? 'video' : 'image' } };
  if (kind === 'icon') return { icon: { sku: item.sku, assetKey: item.sku, url: item.assetUrl } };
  if (kind === 'frame') return { frame: { sku: item.sku, url: item.assetUrl } };
  return {};
}

/** Whether an item can be tried on: something worn on a profile, with what it needs to be drawn. */
export function canPreview(item: Parameters<typeof lookOf>[0]): boolean {
  return Object.keys(lookOf(item)).length > 0;
}

export function ProfilePreview({ look, onClose, footer }: { look: PreviewLook | null; onClose: () => void; footer?: React.ReactNode }): React.JSX.Element {
  const t = useT();
  const { client, user } = useAuth();
  const [mine, setMine] = useState<PublicProfile | null>(null);

  // What you wear now, read once the first preview opens, as your profile shows it to others.
  useEffect(() => {
    if (!look || mine || !user) return;
    let live = true;
    void client.get<PublicProfile>(`/users/${user.id}`).then((res) => {
      if (live && res.ok) setMine(res.data);
    });
    return () => {
      live = false;
    };
  }, [look, mine, user, client]);

  const name = mine?.displayName || user?.displayName || user?.username || '';
  return (
    <Modal open={look !== null} onClose={onClose} label={t('shop.previewTitle')}>
      {look && (
        <div className="profile-preview">
          <h2 className="profile-preview-title">{t('shop.previewTitle')}</h2>
          <div className="profile-preview-card">
            <ProfileCard
              name={name}
              username={user?.username}
              avatarUrl={mine?.avatarUrl ?? user?.avatarUrl ?? null}
              background={look.background ?? mine?.background ?? null}
              icon={look.icon ?? mine?.icon ?? null}
              frameSku={look.frame?.sku ?? mine?.frameSku ?? null}
              frameUrl={look.frame ? look.frame.url : (mine?.frameUrl ?? null)}
              tag={look.tag ?? mine?.tag ?? null}
              level={mine?.level}
              seed={user?.id}
            />
          </div>
          <p className="muted profile-preview-note">{t('shop.previewNote')}</p>
          <div className="profile-preview-actions">
            {footer}
            <Button variant={footer ? 'secondary' : 'primary'} onClick={onClose}>
              {t('common.close')}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

import { Suspense, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { useT } from '../i18n/I18nProvider';
import { PlusIcon } from '../components/icons';
import { lazyPart } from '../lib/lazyPart';

// Loaded apart from the wall, and fetched before anyone opens it (lib/lazyPart.ts).
const Composer = lazyPart(() => import('../composer/Composer').then((m) => m.Composer));

/** The button that opens the composer (composer/) for any post: the wall's primary button. */
export function PostButton({ onPosted }: { onPosted: () => void }): React.JSX.Element {
  const { status } = useAuth();
  const t = useT();
  const [open, setOpen] = useState(false);

  if (status !== 'signedIn') return <></>;

  return (
    <>
      <button
        type="button"
        className="post-plus"
        onClick={() => setOpen(true)}
        onPointerEnter={Composer.preload}
        onFocus={Composer.preload}
        aria-label={t('post.open')}
        aria-haspopup="dialog"
      >
        <PlusIcon size={18} weight="bold" />
        {/* The word shows on a wide screen, the + on a narrow one. */}
        <span className="post-plus-word">{t('post.button')}</span>
      </button>

      {open && (
        <Suspense fallback={null}>
          <Composer
            onClose={() => setOpen(false)}
            onPosted={() => {
              setOpen(false);
              onPosted();
            }}
          />
        </Suspense>
      )}
    </>
  );
}

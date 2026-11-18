import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { useT } from '../i18n/I18nProvider';
import { PlusIcon } from '../components/icons';
import { Composer } from '../composer/Composer';

/** The button that opens the composer (composer/) for any post: the wall's primary button. */
export function PostButton({ onPosted }: { onPosted: () => void }): React.JSX.Element {
  const { status } = useAuth();
  const t = useT();
  const [open, setOpen] = useState(false);

  if (status !== 'signedIn') return <></>;

  return (
    <>
      <button type="button" className="post-plus" onClick={() => setOpen(true)} aria-label={t('post.open')} aria-haspopup="dialog">
        <PlusIcon size={18} weight="bold" />
        {/* The word shows on a wide screen, the + on a narrow one. */}
        <span className="post-plus-word">{t('post.button')}</span>
      </button>

      {open && (
        <Composer
          onClose={() => setOpen(false)}
          onPosted={() => {
            setOpen(false);
            onPosted();
          }}
        />
      )}
    </>
  );
}

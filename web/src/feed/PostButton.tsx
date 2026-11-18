import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { useT } from '../i18n/I18nProvider';
import { PlusIcon } from '../components/icons';
import { Composer } from '../composer/Composer';

/**
 * The button that opens the composer (composer/) for any post. It is the wall's primary button, drawn quietly when
 * `secondary` because something else comes first, such as today's reward, so a screen has one primary.
 */
export function PostButton({ onPosted, secondary = false }: { onPosted: () => void; secondary?: boolean }): React.JSX.Element {
  const { status } = useAuth();
  const t = useT();
  const [open, setOpen] = useState(false);

  if (status !== 'signedIn') return <></>;

  return (
    <>
      <button type="button" className={`post-plus${secondary ? ' is-secondary' : ''}`} onClick={() => setOpen(true)} aria-label={t('post.open')} aria-haspopup="dialog">
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

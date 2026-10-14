import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { useT } from '../i18n/I18nProvider';
import { PlusIcon } from '../components/icons';
import { Composer } from '../composer/Composer';

/**
 * One button for posting anything.
 *
 * It was "Post a picture", which said the wall was for pictures; then a plus
 * that asked "words or a picture?" before you could start. It opens the one
 * composer now (web/src/composer), where a post is words, pictures or both, and
 * nothing has to be decided before you begin.
 */
export function PostButton({ onPosted }: { onPosted: () => void }): React.JSX.Element {
  const { status } = useAuth();
  const t = useT();
  const [open, setOpen] = useState(false);

  if (status !== 'signedIn') return <></>;

  return (
    <>
      <button type="button" className="post-plus" onClick={() => setOpen(true)} aria-label={t('post.open')} aria-haspopup="dialog">
        <PlusIcon size={18} weight="bold" />
        {/* the word carries it on a wide screen; the + carries it on a narrow one */}
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

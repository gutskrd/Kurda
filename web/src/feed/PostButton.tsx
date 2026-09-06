import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { Modal } from '../components/Modal';
import { FeatherIcon, PhotoIcon, PlusIcon } from '../components/icons';
import { PostWords } from './PostWords';
import { PictureComposer } from '../images/PostPicture';
import type { ImagePost } from '../lib/types';

type Choice = 'words' | 'picture' | null;

/**
 * One button for posting anything.
 *
 * It was "Post a picture", which said the wall was for pictures — and there was
 * no way to write anything from the web at all. A plus makes no claim about what
 * you are about to add, and asks once you have decided to add something.
 */
export function PostButton({ onPosted }: { onPosted: () => void }): React.JSX.Element {
  const { status, user } = useAuth();
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<Choice>(null);

  if (status !== 'signedIn') return <></>;

  const close = (): void => {
    setOpen(false);
    // reset only after it is gone, so the panel does not flicker back to the
    // chooser on the way out
    setTimeout(() => setChoice(null), 200);
  };

  const done = (): void => {
    close();
    onPosted();
  };

  return (
    <>
      <button type="button" className="post-plus" onClick={() => setOpen(true)} aria-label="Post something">
        <PlusIcon size={18} weight="bold" />
        {/* the word carries it on a wide screen; the + carries it on a narrow one */}
        <span className="post-plus-word">Post</span>
      </button>

      <Modal open={open} onClose={close} label="Post something">
        {choice === null ? (
          <div className="post-choice">
            <h2 className="friend-heading" style={{ marginTop: 0 }}>What are you posting?</h2>
            <div className="post-choice-row">
              <button type="button" className="post-choice-card" onClick={() => setChoice('words')}>
                <FeatherIcon size={26} />
                <span className="post-choice-name">Gotin</span>
                <span className="post-choice-sub">A saying, a story or a poem</span>
              </button>
              <button type="button" className="post-choice-card" onClick={() => setChoice('picture')}>
                <PhotoIcon size={26} />
                <span className="post-choice-name">Dîmen</span>
                <span className="post-choice-sub">A picture or a meme</span>
              </button>
            </div>
          </div>
        ) : choice === 'words' ? (
          <PostWords onPosted={done} />
        ) : (
          <PictureComposer handle={user?.username ?? ''} onDone={(_: ImagePost) => done()} />
        )}
      </Modal>
    </>
  );
}

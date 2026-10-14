import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { MessageMenu } from './MessageMenu';
import { ReportSheet, type ReportSheetProps, type ReportTarget } from './ReportSheet';

/**
 * A ⋯ with Report in it, and the sheet it opens — for anything that is not a
 * chat message: a post on the wall or on its own page, a picture post, a
 * comment, a game player.
 *
 * It draws nothing for your own things (you do not report yourself; the
 * server refuses it anyway) or for a guest, who has no account to report
 * with.
 */
export function ReportAction({
  target,
  authorId,
  label,
  name,
  block,
  onBlocked,
  className,
}: {
  target: ReportTarget;
  /** whose it is; nothing is drawn when it is yours */
  authorId?: string | null;
  /** the ⋯'s accessible name, saying what it is about ("More about this post") */
  label: string;
  name?: string;
  block?: ReportSheetProps['block'];
  onBlocked?: () => void;
  className?: string;
}): React.JSX.Element | null {
  const { user, status } = useAuth();
  const [open, setOpen] = useState(false);
  if (status !== 'signedIn' || (authorId && authorId === user?.id)) return null;
  return (
    <span className={`report-action${className ? ` ${className}` : ''}`}>
      <MessageMenu label={label} onReport={() => setOpen(true)} />
      <ReportSheet open={open} onClose={() => setOpen(false)} target={target} name={name} block={block} onBlocked={onBlocked} />
    </span>
  );
}

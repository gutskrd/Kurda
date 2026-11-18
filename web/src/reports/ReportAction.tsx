import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { MessageMenu } from './MessageMenu';
import { ReportSheet, type ReportSheetProps, type ReportTarget } from './ReportSheet';

/**
 * A ⋯ with Report and its sheet, for anything but a chat message: posts, picture posts, comments and game players. It
 * draws nothing for the reader's own things or for a guest.
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
  /** Whose it is; nothing is drawn when it is the reader's. */
  authorId?: string | null;
  /** The ⋯'s accessible name, such as "More about this post". */
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

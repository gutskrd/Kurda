import { Link } from 'react-router-dom';

type Variant = 'primary' | 'secondary' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

function cls(variant: Variant, size: Size, block?: boolean, extra?: string): string {
  return [
    'btn',
    `btn-${variant}`,
    size === 'sm' ? 'btn-sm' : size === 'lg' ? 'btn-lg' : '',
    block ? 'btn-block' : '',
    extra ?? '',
  ]
    .filter(Boolean)
    .join(' ');
}

interface BaseProps {
  variant?: Variant;
  size?: Size;
  block?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  block,
  className,
  children,
  ...rest
}: BaseProps & React.ButtonHTMLAttributes<HTMLButtonElement>): React.JSX.Element {
  return (
    <button className={cls(variant, size, block, className)} {...rest}>
      {children}
    </button>
  );
}

export function LinkButton({
  to,
  state,
  variant = 'primary',
  size = 'md',
  block,
  className,
  children,
}: BaseProps & {
  to: string;
  /** handed to the page it opens, as a Link's `state` */
  state?: unknown;
}): React.JSX.Element {
  return (
    <Link to={to} state={state} className={cls(variant, size, block, className)}>
      {children}
    </Link>
  );
}

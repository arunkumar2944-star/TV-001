import { Link } from 'react-router-dom';

const VARIANTS = {
  default: '',
  primary: 'btn--primary',
  success: 'btn--success',
  danger: 'btn--danger',
  warning: 'btn--warning',
  ghost: 'btn--ghost',
};

const SIZES = { sm: 'btn--sm', md: '', lg: 'btn--lg' };

function classNames(variant, size, block, extra) {
  return ['btn', VARIANTS[variant] || '', SIZES[size] || '', block ? 'btn--block' : '', extra || '']
    .filter(Boolean)
    .join(' ');
}

/**
 * One button component for the whole app.
 * `loading` keeps the label but blocks repeat clicks - important on Publish,
 * where a double click must never create two jobs.
 */
export function Button({
  children,
  variant = 'default',
  size = 'md',
  block = false,
  loading = false,
  disabled = false,
  icon,
  className,
  type = 'button',
  ...rest
}) {
  return (
    <button
      type={type}
      className={classNames(variant, size, block, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className="spinner spinner--inline" aria-hidden="true" /> : icon}
      {children}
    </button>
  );
}

export function LinkButton({ to, children, variant = 'default', size = 'md', className, ...rest }) {
  return (
    <Link to={to} className={classNames(variant, size, false, className)} {...rest}>
      {children}
    </Link>
  );
}

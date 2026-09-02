import { Button } from './Button.jsx';

export function Spinner({ large = false, label = 'Loading' }) {
  return (
    <>
      <span className={`spinner${large ? ' spinner--lg' : ''}`} aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </>
  );
}

export function LoadingState({ label = 'Loading...' }) {
  return (
    <div className="state" role="status" aria-live="polite">
      <Spinner large label={label} />
      <p className="state__text mt-2">{label}</p>
    </div>
  );
}

export function EmptyState({ icon = '\u{1F4ED}', title, text, action }) {
  return (
    <div className="state">
      <div className="state__icon" aria-hidden="true">
        {icon}
      </div>
      <h3 className="state__title">{title}</h3>
      {text && <p className="state__text">{text}</p>}
      {action}
    </div>
  );
}

/** Shows a failed request without leaking anything the API did not send. */
export function ErrorState({ error, onRetry, title = 'Something went wrong' }) {
  const message = error && error.message ? error.message : 'Unexpected error';
  return (
    <div className="state">
      <div className="state__icon" aria-hidden="true">
        {'⚠'}
      </div>
      <h3 className="state__title">{title}</h3>
      <p className="state__text">{message}</p>
      {error && error.requestId && (
        <p className="small muted">
          Reference: <span className="kv">{error.requestId}</span>
        </p>
      )}
      {onRetry && (
        <Button variant="primary" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function Alert({ tone = 'info', title, children }) {
  const glyphs = { info: 'ℹ', success: '✓', warning: '⚠', error: '✕' };
  return (
    <div className={`alert alert--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <span aria-hidden="true">{glyphs[tone]}</span>
      <div>
        {title && <strong>{title}</strong>}
        {title && children ? <div>{children}</div> : children}
      </div>
    </div>
  );
}

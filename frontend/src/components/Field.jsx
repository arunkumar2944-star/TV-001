import { useId } from 'react';

/** Labelled form control with hint + error text, wired up for screen readers. */
export function Field({ label, required, hint, error, children, className, htmlFor }) {
  const generatedId = useId();
  const id = htmlFor || generatedId;
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={`field ${className || ''}`}>
      <label className="field__label" htmlFor={id}>
        {label}
        {required && (
          <span className="field__required" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {typeof children === 'function'
        ? children({ id, 'aria-describedby': describedBy || undefined, 'aria-invalid': error ? true : undefined })
        : children}
      {hint && (
        <span className="field__hint" id={`${id}-hint`}>
          {hint}
        </span>
      )}
      {error && (
        <span className="field__error" id={`${id}-error`} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

export function TextInput({ invalid, className, ...rest }) {
  return <input className={`input ${invalid ? 'input--invalid' : ''} ${className || ''}`} {...rest} />;
}

export function TextArea({ invalid, tall, className, ...rest }) {
  return (
    <textarea
      className={`textarea ${tall ? 'textarea--tall' : ''} ${invalid ? 'textarea--invalid' : ''} ${className || ''}`}
      {...rest}
    />
  );
}

export function Select({ invalid, className, children, ...rest }) {
  return (
    <select className={`select ${invalid ? 'select--invalid' : ''} ${className || ''}`} {...rest}>
      {children}
    </select>
  );
}

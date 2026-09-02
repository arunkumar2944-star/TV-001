import { useToast } from '../context/ToastContext.jsx';

const GLYPHS = {
  success: '✓',
  error: '✕',
  warning: '⚠',
  info: 'ℹ',
};

export function Toaster() {
  const { toasts, dismiss } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="toast-stack" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast--${toast.tone}`} role={toast.tone === 'error' ? 'alert' : 'status'}>
          <span aria-hidden="true">{GLYPHS[toast.tone] || GLYPHS.info}</span>
          <div className="toast__body">
            {toast.title && <div className="toast__title">{toast.title}</div>}
            {toast.message && <div className="toast__message">{toast.message}</div>}
          </div>
          <button type="button" className="toast__close" onClick={() => dismiss(toast.id)} aria-label="Dismiss">
            {'×'}
          </button>
        </div>
      ))}
    </div>
  );
}

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

const ToastContext = createContext(null);

const DEFAULT_DURATION = 5000;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());
  const counter = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (toast) => {
      counter.current += 1;
      const id = counter.current;
      const entry = {
        id,
        tone: toast.tone || 'info',
        title: toast.title || '',
        message: toast.message || '',
        duration: toast.duration === undefined ? DEFAULT_DURATION : toast.duration,
      };

      setToasts((current) => [...current, entry]);

      if (entry.duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), entry.duration)
        );
      }
      return id;
    },
    [dismiss]
  );

  const value = useMemo(
    () => ({
      toasts,
      dismiss,
      push,
      success: (title, message) => push({ tone: 'success', title, message }),
      error: (title, message) => push({ tone: 'error', title, message, duration: 8000 }),
      warning: (title, message) => push({ tone: 'warning', title, message, duration: 7000 }),
      info: (title, message) => push({ tone: 'info', title, message }),
    }),
    [toasts, dismiss, push]
  );

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>');
  return context;
}

import { useEffect, useRef } from 'react';

/**
 * Calls `callback` on an interval while the tab is visible.
 *
 * Deliberately simple: the first version of Trichy Vision refreshes the
 * dashboard and any in-flight publish job by polling. The backend is already
 * shaped so WebSockets can replace this later without touching the pages.
 *
 * @param {Function} callback
 * @param {number} intervalMs 0 or negative disables polling
 * @param {boolean} enabled
 */
export function usePolling(callback, intervalMs, enabled = true) {
  const savedCallback = useRef(callback);

  // Keep the latest callback without restarting the interval. Assigning in an
  // effect (not during render) keeps refs write-safe under concurrent React.
  useEffect(() => {
    savedCallback.current = callback;
  });

  useEffect(() => {
    if (!enabled || !intervalMs || intervalMs <= 0) return undefined;

    let timer = null;

    const tick = () => {
      if (document.visibilityState === 'visible') savedCallback.current();
    };

    const start = () => {
      if (timer) return;
      timer = setInterval(tick, intervalMs);
    };
    const stop = () => {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        savedCallback.current();
        start();
      } else {
        stop();
      }
    };

    start();
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [intervalMs, enabled]);
}

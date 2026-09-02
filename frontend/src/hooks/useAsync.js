import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Runs an async loader and exposes { data, error, isLoading, reload }.
 *
 * In-flight requests are aborted when the inputs change or the component
 * unmounts, so a slow response can never overwrite a newer one.
 *
 * @param {(options:{signal:AbortSignal}) => Promise<any>} loader
 * @param {Array} deps re-run when these change
 * @param {{immediate?:boolean}} [options]
 */
export function useAsync(loader, deps = [], options = {}) {
  const { immediate = true } = options;

  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(immediate);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const controllerRef = useRef(null);
  const mountedRef = useRef(true);
  const loaderRef = useRef(loader);

  // Written in an effect rather than during render so the ref is never mutated
  // mid-render. This effect is declared first, so it always runs before the
  // effect below that invokes the loader.
  useEffect(() => {
    loaderRef.current = loader;
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (controllerRef.current) controllerRef.current.abort();
    };
  }, []);

  const run = useCallback(async ({ quiet = false } = {}) => {
    if (controllerRef.current) controllerRef.current.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    if (quiet) setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);

    try {
      const result = await loaderRef.current({ signal: controller.signal });
      if (!mountedRef.current || controller.signal.aborted) return null;
      setData(result);
      return result;
    } catch (caught) {
      if (caught.name === 'AbortError' || !mountedRef.current) return null;
      setError(caught);
      return null;
    } finally {
      if (mountedRef.current && !controller.signal.aborted) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, []);

  // Loading server data is a synchronisation with an external system, which is
  // what effects exist for. State is set from the promise callback, never
  // synchronously during render.
  useEffect(() => {
    if (!immediate) return undefined;
    run();
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return {
    data,
    error,
    isLoading,
    isRefreshing,
    setData,
    reload: run,
    refreshQuietly: () => run({ quiet: true }),
  };
}

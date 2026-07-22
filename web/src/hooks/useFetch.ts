'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';

interface State<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/** Minimal GET data hook with loading + error + refetch. */
export function useFetch<T = any>(url: string | null, deps: any[] = []): State<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(!!url);
  const [error, setError] = useState<string | null>(null);
  const tick = useRef(0);

  const run = useCallback(() => {
    if (!url) return;
    const id = ++tick.current;
    setLoading(true);
    setError(null);
    api
      .get(url)
      .then((r) => {
        if (id === tick.current) setData(r.data);
      })
      .catch((e) => {
        if (id === tick.current) setError(e?.response?.data?.error || e.message);
      })
      .finally(() => {
        if (id === tick.current) setLoading(false);
      });
  }, [url]);

  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, ...deps]);

  return { data, loading, error, refetch: run };
}

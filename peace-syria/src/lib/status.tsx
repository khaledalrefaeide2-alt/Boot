import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AppStatus } from '../../shared/types';
import { api, errorMessage } from './api';

interface StatusContextValue {
  status: AppStatus | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  setCrisisMode: (value: boolean) => Promise<void>;
}

const StatusContext = createContext<StatusContextValue | null>(null);

/** Shares the server's global state (crisis mode + moderation counters) app-wide. */
export function StatusProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      setStatus(await api.getStatus());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const setCrisisMode = useCallback(async (value: boolean) => {
    setStatus(await api.setCrisisMode(value));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({ status, loading, error, refresh, setCrisisMode }),
    [status, loading, error, refresh, setCrisisMode],
  );

  return <StatusContext.Provider value={value}>{children}</StatusContext.Provider>;
}

export function useStatus(): StatusContextValue {
  const context = useContext(StatusContext);
  if (!context) throw new Error('useStatus must be used inside <StatusProvider>');
  return context;
}

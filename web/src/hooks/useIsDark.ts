'use client';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

/** Resolve whether the effective theme is dark, safe for chart re-rendering. */
export function useIsDark(): boolean {
  const { resolvedTheme } = useTheme();
  const [dark, setDark] = useState(false);
  useEffect(() => {
    setDark(resolvedTheme === 'dark');
  }, [resolvedTheme]);
  return dark;
}

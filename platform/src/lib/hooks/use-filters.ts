'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { FilterOptions } from '@/components/filters/filter-bar';

interface FilterOptionsResponse extends FilterOptions {
  platforms: { id: string; name: string; code: string; color: string | null }[];
  keywords: { id: string; term: string }[];
}

/** خيارات الفلاتر المشتركة — تُجلب مرة وتُخزَّن مؤقتاً */
export function useFilterOptions() {
  return useQuery({
    queryKey: ['filter-options'],
    queryFn: () => api.get<FilterOptionsResponse>('/api/filters/options'),
    staleTime: 5 * 60 * 1000,
  });
}

export const EMPTY_OPTIONS: FilterOptions = { platforms: [], accounts: [], topics: [] };

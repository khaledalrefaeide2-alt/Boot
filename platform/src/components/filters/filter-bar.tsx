'use client';

import { useState } from 'react';
import { Filter, RotateCcw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/field';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  DATE_RANGES,
  POST_TYPE_LABELS,
  SENTIMENT_LABELS,
  LANGUAGE_LABELS,
} from '@/lib/domain/constants';

export interface PostFilterState {
  q: string;
  platformId: string;
  accountId: string;
  postType: string;
  sentiment: string;
  language: string;
  topicId: string;
  hashtag: string;
  country: string;
  range: string;
  from: string;
  to: string;
}

export const EMPTY_FILTERS: PostFilterState = {
  q: '',
  platformId: '',
  accountId: '',
  postType: '',
  sentiment: '',
  language: '',
  topicId: '',
  hashtag: '',
  country: '',
  range: '30d',
  from: '',
  to: '',
};

export interface FilterOptions {
  platforms: { id: string; name: string }[];
  accounts: { id: string; name: string; platformId: string }[];
  topics: { id: string; name: string }[];
}

/** عدد الفلاتر المفعّلة — يُعرض للمستخدم ليعرف لماذا النتائج محدودة */
export function activeFilterCount(filters: PostFilterState): number {
  let count = 0;
  if (filters.q) count += 1;
  if (filters.platformId) count += 1;
  if (filters.accountId) count += 1;
  if (filters.postType) count += 1;
  if (filters.sentiment) count += 1;
  if (filters.language) count += 1;
  if (filters.topicId) count += 1;
  if (filters.hashtag) count += 1;
  if (filters.country) count += 1;
  if (filters.range !== '30d') count += 1;
  return count;
}

/**
 * شريط الفلاتر الموحّد لكل شاشات الرصد.
 * صف واحد فوق المحتوى، والفلاتر المتقدمة تُطوى لتبقى الشاشة هادئة.
 */
export function FilterBar({
  filters,
  options,
  onChange,
  onReset,
  showSearch = true,
  className,
}: {
  filters: PostFilterState;
  options: FilterOptions;
  onChange: (filters: PostFilterState) => void;
  onReset: () => void;
  showSearch?: boolean;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [searchInput, setSearchInput] = useState(filters.q);

  function set<K extends keyof PostFilterState>(key: K, value: PostFilterState[K]) {
    onChange({ ...filters, [key]: value });
  }

  const accounts = filters.platformId
    ? options.accounts.filter((account) => account.platformId === filters.platformId)
    : options.accounts;

  const count = activeFilterCount(filters);

  return (
    <div className={cn('rounded-lg border border-border bg-surface shadow-xs no-print', className)}>
      <div className="flex flex-wrap items-end gap-3 px-4 py-3">
        {showSearch && (
          <form
            className="flex min-w-56 flex-1 items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              set('q', searchInput.trim());
            }}
          >
            <Input
              wrapperClassName="flex-1"
              label="بحث"
              placeholder="ابحث في نص المنشور واسم الحساب والهاشتاغات"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
            <Button type="submit" variant="secondary" aria-label="بحث">
              <Search className="h-4 w-4" aria-hidden />
            </Button>
          </form>
        )}

        <Select
          wrapperClassName="w-40"
          label="الفترة"
          value={filters.range}
          onChange={(event) => set('range', event.target.value)}
        >
          {DATE_RANGES.map((range) => (
            <option key={range.value} value={range.value}>
              {range.label}
            </option>
          ))}
          <option value="all">كل الفترات</option>
        </Select>

        <Select
          wrapperClassName="w-40"
          label="المنصة"
          value={filters.platformId}
          onChange={(event) => onChange({ ...filters, platformId: event.target.value, accountId: '' })}
        >
          <option value="">كل المنصات</option>
          {options.platforms.map((platform) => (
            <option key={platform.id} value={platform.id}>
              {platform.name}
            </option>
          ))}
        </Select>

        <Select
          wrapperClassName="w-48"
          label="الحساب"
          value={filters.accountId}
          onChange={(event) => set('accountId', event.target.value)}
        >
          <option value="">كل الحسابات</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </Select>

        <Button variant="secondary" onClick={() => setExpanded((value) => !value)}>
          <Filter className="h-4 w-4" aria-hidden />
          فلاتر إضافية
          {count > 0 && (
            <Badge tone="primary" size="sm">
              {count}
            </Badge>
          )}
        </Button>

        {count > 0 && (
          <Button
            variant="ghost"
            onClick={() => {
              setSearchInput('');
              onReset();
            }}
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            إعادة ضبط
          </Button>
        )}
      </div>

      {expanded && (
        <div className="grid gap-3 border-t border-border px-4 py-3 sm:grid-cols-2 lg:grid-cols-4">
          {filters.range === 'custom' && (
            <>
              <Input
                label="من تاريخ"
                type="date"
                value={filters.from}
                onChange={(event) => set('from', event.target.value)}
              />
              <Input
                label="إلى تاريخ"
                type="date"
                value={filters.to}
                onChange={(event) => set('to', event.target.value)}
              />
            </>
          )}

          <Select
            label="نوع المنشور"
            value={filters.postType}
            onChange={(event) => set('postType', event.target.value)}
          >
            <option value="">كل الأنواع</option>
            {Object.entries(POST_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>

          <Select
            label="المشاعر"
            value={filters.sentiment}
            onChange={(event) => set('sentiment', event.target.value)}
          >
            <option value="">كل الحالات</option>
            {Object.entries(SENTIMENT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>

          <Select
            label="التصنيف"
            value={filters.topicId}
            onChange={(event) => set('topicId', event.target.value)}
          >
            <option value="">كل التصنيفات</option>
            {options.topics.map((topic) => (
              <option key={topic.id} value={topic.id}>
                {topic.name}
              </option>
            ))}
          </Select>

          <Select
            label="اللغة"
            value={filters.language}
            onChange={(event) => set('language', event.target.value)}
          >
            <option value="">كل اللغات</option>
            {Object.entries(LANGUAGE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>

          <Input
            label="الهاشتاق"
            placeholder="بدون #"
            value={filters.hashtag}
            onChange={(event) => set('hashtag', event.target.value)}
          />

          <Input
            label="الدولة أو الموقع"
            value={filters.country}
            onChange={(event) => set('country', event.target.value)}
          />
        </div>
      )}
    </div>
  );
}

/** تحويل حالة الفلاتر إلى معاملات رابط */
export function filtersToParams(filters: PostFilterState): Record<string, string> {
  const params: Record<string, string> = { range: filters.range };
  if (filters.q) params.q = filters.q;
  if (filters.platformId) params.platformId = filters.platformId;
  if (filters.accountId) params.accountId = filters.accountId;
  if (filters.postType) params.postType = filters.postType;
  if (filters.sentiment) params.sentiment = filters.sentiment;
  if (filters.language) params.language = filters.language;
  if (filters.topicId) params.topicId = filters.topicId;
  if (filters.hashtag) params.hashtag = filters.hashtag;
  if (filters.country) params.country = filters.country;
  if (filters.range === 'custom') {
    if (filters.from) params.from = filters.from;
    if (filters.to) params.to = filters.to;
  }
  return params;
}

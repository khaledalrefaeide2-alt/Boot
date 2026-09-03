'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Hash, Search } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { Table, TBody, TD, TH, THead, TR, TableWrapper } from '@/components/ui/table';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/states';
import { Pagination } from '@/components/ui/pagination';
import { api, ApiClientError, buildQuery } from '@/lib/api-client';
import { formatDate, formatNumber } from '@/lib/utils';

interface HashtagRow {
  id: string;
  tag: string;
  usageCount: number;
  createdAt: string;
  _count: { posts: number };
}

export function HashtagsClient() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');

  const query = useQuery({
    queryKey: ['hashtags', page, search],
    queryFn: () =>
      api.get<{ hashtags: HashtagRow[]; total: number; page: number; pageSize: number }>(
        buildQuery('/api/taxonomy/hashtags', { page, pageSize: 40, q: search }),
      ),
  });

  const data = query.data;

  return (
    <>
      <PageHeader
        title="الهاشتاغات"
        description="الهاشتاغات المكتشفة تلقائياً في المنشورات المستخرجة، مرتبة حسب الاستخدام"
      />

      <Card>
        <form
          className="flex flex-wrap items-end gap-3 border-b border-border px-4 py-3"
          onSubmit={(event) => {
            event.preventDefault();
            setSearch(searchInput.trim());
            setPage(1);
          }}
        >
          <Input
            wrapperClassName="min-w-52 flex-1"
            label="بحث"
            placeholder="بدون #"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
          <Button type="submit" variant="secondary">
            <Search className="h-4 w-4" aria-hidden />
            بحث
          </Button>
        </form>

        {query.isPending ? (
          <SkeletonRows rows={8} />
        ) : query.isError ? (
          <ErrorState description={query.error instanceof ApiClientError ? query.error.message : undefined} />
        ) : !data || data.hashtags.length === 0 ? (
          <EmptyState
            icon={Hash}
            title="لا توجد هاشتاغات بعد"
            description="تُكتشف الهاشتاغات تلقائياً عند استيراد المنشورات"
          />
        ) : (
          <>
            <TableWrapper>
              <Table>
                <THead>
                  <TR>
                    <TH>الهاشتاق</TH>
                    <TH>مرات الاستخدام</TH>
                    <TH>المنشورات</TH>
                    <TH>أول ظهور</TH>
                    <TH className="text-end">إجراءات</TH>
                  </TR>
                </THead>
                <TBody>
                  {data.hashtags.map((hashtag) => (
                    <TR key={hashtag.id}>
                      <TD className="font-medium text-primary">#{hashtag.tag}</TD>
                      <TD className="num">{formatNumber(hashtag.usageCount)}</TD>
                      <TD className="num">{formatNumber(hashtag._count.posts)}</TD>
                      <TD className="text-xs text-muted-foreground">{formatDate(hashtag.createdAt)}</TD>
                      <TD className="text-end">
                        <Link href={`/posts?hashtag=${encodeURIComponent(hashtag.tag)}&range=all`}>
                          <Button size="sm" variant="secondary">
                            عرض المنشورات
                          </Button>
                        </Link>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrapper>
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPageChange={setPage} />
          </>
        )}
      </Card>
    </>
  );
}

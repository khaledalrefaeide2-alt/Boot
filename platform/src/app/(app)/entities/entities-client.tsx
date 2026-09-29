'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useInfiniteQuery } from '@tanstack/react-query';
import { AtSign, Search } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardBody } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/field';
import { Segmented } from '@/components/ui/button-group';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/states';
import { InfiniteSentinel } from '@/components/ui/infinite-scroll';
import { Table, TBody, TD, TH, THead, TR, TableWrapper } from '@/components/ui/table';
import {
  FilterBar,
  EMPTY_FILTERS,
  filtersToParams,
  type PostFilterState,
} from '@/components/filters/filter-bar';
import { useFilterOptions, EMPTY_OPTIONS } from '@/lib/hooks/use-filters';
import { ENTITY_TYPE_LABELS, ENTITY_TYPE_TONE, STANCE_METRIC } from '@/lib/domain/constants';
import { api, ApiClientError, buildQuery } from '@/lib/api-client';
import { formatNumber, formatPercent } from '@/lib/utils';
import type { EntityType } from '@/generated/prisma';

interface EntityRow {
  id: string;
  name: string;
  type: EntityType;
  posts: number;
  negative: number;
  positive: number;
}

interface EntitiesResponse {
  entities: EntityRow[];
  page: number;
  pageSize: number;
  hasMore: boolean;
}

const PAGE_SIZE = 30;

const TYPE_OPTIONS: { value: '' | EntityType; label: string }[] = [
  { value: '', label: 'الكلّ' },
  { value: 'PERSON', label: 'أشخاص' },
  { value: 'ORGANIZATION', label: 'مؤسسات' },
  { value: 'PLACE', label: 'أماكن' },
  { value: 'OTHER', label: 'أخرى' },
];

/**
 * من ذُكر في المنشورات، لا ما قيل عنه.
 *
 * ★ محورٌ ثالث إلى جانب التصنيف والموضوع.
 *
 *   التصنيف يقول «سلبيّ تجاه الخدمات» ولا يقول عمّن. والبحث النصّي عن
 *   اسمٍ يُسقط صوره الأخرى بلا أن يقول إنه أسقطها: الاسم يرد بالهمزة
 *   وبلا همزة، وبالمنصب وبالاسم. فيُستخرَج الكيان عند التحليل مرّةً
 *   ويُجمَع على مفتاح موحَّد — ويصير السؤال عدّاً لا بحثاً.
 *
 * ★ وكلّ رقم هنا محسوبٌ من منشورات القارئ وفلاتره.
 *
 *   لا عدّاد مخزَّن على الكيان يُقرأ كما هو. من نطاقه ثلاثة حسابات يرى
 *   عدد الثلاثة، ومن فتح آخر سبعة أيام يرى عدد الأسبوع — وإلّا عُرض
 *   لصاحب النطاق المحدود رقمُ المنصّة كلّها، وهو كشفٌ لحجم ما لا يراه.
 */
export function EntitiesClient() {
  const [filters, setFilters] = useState<PostFilterState>(EMPTY_FILTERS);
  const [type, setType] = useState<'' | EntityType>('');
  const [sort, setSort] = useState<'mentions' | 'negative'>('mentions');
  const [nameInput, setNameInput] = useState('');
  const [name, setName] = useState('');

  const optionsQuery = useFilterOptions();

  const params = {
    ...filtersToParams(filters),
    ...(type ? { type } : {}),
    ...(name ? { name } : {}),
    sort,
    pageSize: PAGE_SIZE,
  };

  const query = useInfiniteQuery({
    queryKey: ['entities', params],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      api.get<EntitiesResponse>(buildQuery('/api/entities', { ...params, page: pageParam })),
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
  });

  const entities = query.data?.pages.flatMap((page) => page.entities) ?? [];

  return (
    <>
      <PageHeader
        eyebrow="الرصد"
        title="الكيانات"
        description="الأشخاص والمؤسسات والأماكن التي ذُكرت في المنشورات — مستخرَجة بالتحليل الذكي ومجموعة على اسمٍ موحَّد"
        leading={<AtSign className="h-5 w-5 text-muted-foreground" aria-hidden />}
      />

      <FilterBar
        className="mb-4"
        filters={filters}
        options={optionsQuery.data ?? EMPTY_OPTIONS}
        onChange={setFilters}
        onReset={() => setFilters(EMPTY_FILTERS)}
        /*
         * بحث الشريط مُطفأ هنا وله بديلٌ أدناه.
         *
         * `q` في الشريط يبحث في نصّ المنشور، والمطلوب في هذه الشاشة البحث
         * في اسم الكيان. وحقلان متجاوران أحدهما «بحث» والآخر «بحث» يعني
         * أن يكتب الموظّف في أحدهما ويرى نتيجةً لا يفهم سببها.
         */
        showSearch={false}
      />

      <Card className="mb-4 no-print">
        <CardBody className="flex flex-wrap items-end gap-3">
          <form
            className="flex min-w-56 flex-1 items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              setName(nameInput.trim());
            }}
          >
            <Input
              wrapperClassName="flex-1"
              label="بحث باسم الكيان"
              placeholder="مثل: وزارة الكهرباء"
              value={nameInput}
              onChange={(event) => setNameInput(event.target.value)}
              hint="يتجاوز فروق الهمزة والتشكيل — «الأسد» و«الاسد» بحثٌ واحد"
            />
            <Button type="submit" variant="secondary">
              <Search className="h-4 w-4" aria-hidden />
              بحث
            </Button>
          </form>

          <Segmented
            label="نوع الكيان"
            value={type}
            onChange={setType}
            options={TYPE_OPTIONS}
            variant="pills"
            size="sm"
          />

          <Segmented
            label="الترتيب"
            value={sort}
            onChange={setSort}
            options={[
              { value: 'mentions', label: 'الأكثر ذكراً' },
              { value: 'negative', label: 'الأكثر ذكراً سلبياً' },
            ]}
            size="sm"
          />
        </CardBody>
      </Card>

      {query.isPending ? (
        <SkeletonRows rows={8} />
      ) : query.isError ? (
        <ErrorState
          description={
            query.error instanceof ApiClientError ? query.error.message : 'تعذّر جلب الكيانات'
          }
          action={
            <Button variant="secondary" onClick={() => query.refetch()}>
              إعادة المحاولة
            </Button>
          }
        />
      ) : entities.length === 0 ? (
        <EmptyState
          icon={AtSign}
          title="لا كيانات في هذه الفترة"
          description="تُستخرَج الكيانات عند تحليل المنشور. وسّع النطاق الزمني، أو راجع «التحليل الذكي» إن كان كثير من المنشورات ما يزال بلا تصنيف."
        />
      ) : (
        <>
          <TableWrapper>
            <Table>
              <THead>
                <TR>
                  <TH>الكيان</TH>
                  <TH className="text-center">النوع</TH>
                  <TH className="text-center">المنشورات</TH>
                  <TH className="text-center">سلبي</TH>
                  <TH className="text-center">إيجابي</TH>
                  <TH className="text-center">نسبة السلبي</TH>
                </TR>
              </THead>
              <TBody>
                {entities.map((entity) => (
                  <TR key={entity.id}>
                    <TD>
                      <Link
                        href={`/entities/${entity.id}`}
                        className="font-medium text-foreground hover:text-primary hover:underline"
                      >
                        {entity.name}
                      </Link>
                    </TD>
                    <TD className="text-center">
                      <Badge tone={ENTITY_TYPE_TONE[entity.type]} size="sm">
                        {ENTITY_TYPE_LABELS[entity.type]}
                      </Badge>
                    </TD>
                    <TD className="num text-center">{formatNumber(entity.posts)}</TD>
                    <TD className="num text-center text-danger">
                      {formatNumber(entity.negative)}
                    </TD>
                    <TD className="num text-center text-success">
                      {formatNumber(entity.positive)}
                    </TD>
                    {/*
                      النسبة من المنشورات المذكور فيها لا من كلّ المنشورات.
                      وهي تقرأ «من بين ما ذُكر فيه، كم كان سلبياً» — وهو
                      السؤال الذي تُفتح هذه الشاشة من أجله.
                    */}
                    <TD className="num text-center">
                      {entity.posts > 0
                        ? formatPercent((entity.negative / entity.posts) * 100)
                        : '—'}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrapper>

          <InfiniteSentinel
            hasMore={query.hasNextPage}
            isLoading={query.isFetchingNextPage}
            onLoad={() => query.fetchNextPage()}
            loaded={entities.length}
            label="كياناً"
          />
        </>
      )}

      <p className="mt-4 text-2xs text-subtle-foreground">{STANCE_METRIC.caveat}</p>
    </>
  );
}

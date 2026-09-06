'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/states';
import { Pagination } from '@/components/ui/pagination';
import { useToast } from '@/components/ui/toast';
import { api, ApiClientError, buildQuery } from '@/lib/api-client';
import { NOTIFICATION_SEVERITY_TONE, NOTIFICATION_TYPE_LABELS } from '@/lib/domain/constants';
import { formatRelativeTime } from '@/lib/utils';
import { cn } from '@/lib/utils';
import type { NotificationSeverity, NotificationType } from '@/generated/prisma';

interface NotificationRow {
  id: string;
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  body: string | null;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

export function NotificationsClient() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);

  const query = useQuery({
    queryKey: ['notifications', page, unreadOnly],
    queryFn: () =>
      api.get<{
        notifications: NotificationRow[];
        total: number;
        page: number;
        pageSize: number;
        unreadCount: number;
      }>(buildQuery('/api/notifications', { page, pageSize: 30, unreadOnly: String(unreadOnly) })),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['notifications'] });

  const readMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/api/notifications/${id}`),
    onSuccess: () => void invalidate(),
  });

  const readAllMutation = useMutation({
    mutationFn: () => api.post<{ updated: number }>('/api/notifications/read-all'),
    onSuccess: (data) => {
      toast.success(`عُلّم ${data.updated} تنبيهاً كمقروء`);
      void invalidate();
    },
    onError: (error) =>
      toast.error('تعذّر التحديث', error instanceof ApiClientError ? error.message : undefined),
  });

  const data = query.data;

  return (
    <>
      <PageHeader
        title="التنبيهات"
        description="تنبيهات داخل الموقع فقط — لا يوجد إرسال خارجي في النسخة الأولى"
        action={
          <>
            <Button
              variant={unreadOnly ? 'soft' : 'secondary'}
              onClick={() => {
                setUnreadOnly((value) => !value);
                setPage(1);
              }}
            >
              {unreadOnly ? 'عرض الكل' : 'غير المقروءة فقط'}
              {data && data.unreadCount > 0 && (
                <Badge tone="danger" size="sm">
                  {data.unreadCount}
                </Badge>
              )}
            </Button>
            {data && data.unreadCount > 0 && (
              <Button onClick={() => readAllMutation.mutate()} loading={readAllMutation.isPending}>
                <CheckCheck className="h-4 w-4" aria-hidden />
                تعليم الكل كمقروء
              </Button>
            )}
          </>
        }
      />

      <Card>
        {query.isPending ? (
          <SkeletonRows rows={8} />
        ) : query.isError ? (
          <ErrorState description={query.error instanceof ApiClientError ? query.error.message : undefined} />
        ) : !data || data.notifications.length === 0 ? (
          <EmptyState
            icon={Bell}
            title={unreadOnly ? 'لا توجد تنبيهات غير مقروءة' : 'لا توجد تنبيهات'}
            description="ستظهر هنا تنبيهات نتائج الاستخراج والمنشورات المرتفعة التفاعل والكلمات المهمة"
          />
        ) : (
          <>
            <ul className="divide-y divide-border">
              {data.notifications.map((notification) => (
                <li
                  key={notification.id}
                  className={cn(
                    'flex flex-wrap items-start gap-3 px-4 py-3.5 transition-colors',
                    !notification.isRead && 'bg-primary-soft/30',
                  )}
                >
                  <Badge tone={NOTIFICATION_SEVERITY_TONE[notification.severity]} className="mt-0.5">
                    {NOTIFICATION_TYPE_LABELS[notification.type]}
                  </Badge>

                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-sm font-medium text-foreground">{notification.title}</p>
                    {notification.body && (
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        {notification.body}
                      </p>
                    )}
                    <p className="text-2xs text-subtle-foreground">
                      {formatRelativeTime(notification.createdAt)}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {notification.link && (
                      <Link href={notification.link}>
                        <Button size="sm" variant="secondary">
                          فتح
                        </Button>
                      </Link>
                    )}
                    {!notification.isRead && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => readMutation.mutate(notification.id)}
                      >
                        تعليم كمقروء
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPageChange={setPage} />
          </>
        )}
      </Card>
    </>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { Building2 } from 'lucide-react';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { getAccountScope } from '@/lib/auth/account-scope';
import { can, PERMISSIONS } from '@/lib/auth/rbac';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardBody } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/states';
import { ENTITY_STATUS_LABELS } from '@/lib/domain/constants';
import { formatCompactNumber, formatNumber } from '@/lib/utils';

export const metadata: Metadata = { title: 'المنصات' };

export default async function PlatformsPage() {
  const user = await getSession();

  /*
   * البطاقات كلها محصورة بنطاق المستخدم: المنصات المعروضة، وعدد الحسابات
   * والمنشورات داخل كل بطاقة، ومجموع التفاعل. لو حُصرت القائمة وحدها لبقيت
   * الأرقام تكشف حجم ما لا يراه المستخدم على المنصة نفسها.
   */
  const scope = await getAccountScope();
  const accountFilter = scope === null ? {} : { accountId: { in: scope } };

  const platforms = await prisma.platform.findMany({
    where: {
      status: 'ACTIVE',
      ...(scope === null ? {} : { accounts: { some: { id: { in: scope } } } }),
    },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      code: true,
      status: true,
      _count: {
        select: {
          accounts: scope === null ? true : { where: { id: { in: scope } } },
          posts: scope === null ? true : { where: { accountId: { in: scope } } },
        },
      },
    },
  });

  // مجاميع التفاعل لكل منصة من جدول المنشورات مباشرة
  const engagement = await prisma.post.groupBy({
    by: ['platformId'],
    where: { isHidden: false, ...accountFilter },
    _sum: { engagementTotal: true },
  });
  const engagementMap = new Map(
    engagement.map((row) => [row.platformId, row._sum.engagementTotal ?? 0]),
  );

  return (
    <>
      <PageHeader
        title="المنصات"
        description="المنصات الإعلامية المرصودة وحجم المحتوى المستخرج منها"
        action={
          can(user, PERMISSIONS.PLATFORMS_MANAGE) && (
            <Link href="/admin/platforms">
              <Button variant="secondary">إدارة المنصات</Button>
            </Link>
          )
        }
      />

      {platforms.length === 0 ? (
        <Card>
          <EmptyState icon={Building2} title="لا توجد منصات مفعّلة" />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {platforms.map((platform) => (
            <Link key={platform.id} href={`/platforms/${platform.id}`}>
              <Card className="h-full transition-colors hover:border-border-strong">
                <CardBody className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary-soft">
                        <Building2 className="h-5 w-5 text-primary-soft-foreground" aria-hidden />
                      </div>
                      <div>
                        <p className="font-semibold text-foreground">{platform.name}</p>
                        <p className="ltr text-xs text-muted-foreground">{platform.code}</p>
                      </div>
                    </div>
                    <Badge tone="success">{ENTITY_STATUS_LABELS[platform.status]}</Badge>
                  </div>

                  <div className="grid grid-cols-3 gap-2 border-t border-border pt-3 text-center">
                    <div>
                      <p className="num text-lg font-bold text-foreground">
                        {formatNumber(platform._count.accounts)}
                      </p>
                      <p className="text-xs text-muted-foreground">حساب</p>
                    </div>
                    <div>
                      <p className="num text-lg font-bold text-foreground">
                        {formatCompactNumber(platform._count.posts)}
                      </p>
                      <p className="text-xs text-muted-foreground">منشور</p>
                    </div>
                    <div>
                      <p className="num text-lg font-bold text-primary">
                        {formatCompactNumber(engagementMap.get(platform.id) ?? 0)}
                      </p>
                      <p className="text-xs text-muted-foreground">تفاعل</p>
                    </div>
                  </div>
                </CardBody>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

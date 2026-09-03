import { PageHeader } from '@/components/layout/page-header';
import { Card, CardBody } from '@/components/ui/card';

export default function AdminHomePage() {
  return (
    <>
      <PageHeader title="لوحة تحكم الإدارة" description="حالة النظام والعمليات" />
      <Card>
        <CardBody>
          <p className="text-sm text-muted-foreground">قيد الإنشاء…</p>
        </CardBody>
      </Card>
    </>
  );
}

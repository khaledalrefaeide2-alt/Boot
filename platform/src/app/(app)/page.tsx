import { PageHeader } from '@/components/layout/page-header';
import { Card, CardBody } from '@/components/ui/card';

export default function OverviewPage() {
  return (
    <>
      <PageHeader title="النظرة العامة" description="ملخص نشاط المنصات المرصودة" />
      <Card>
        <CardBody>
          <p className="text-sm text-muted-foreground">قيد الإنشاء…</p>
        </CardBody>
      </Card>
    </>
  );
}

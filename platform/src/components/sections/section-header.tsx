import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * ترويسة قسم داخل الصفحة.
 *
 * أدنى من ترويسة الصفحة وأعلى من ترويسة البطاقة: القسم يجمع بطاقاتٍ عدّة
 * تحت سؤال واحد — «أبرز المنشورات تفاعلاً» — فيحتاج عنواناً يقول السؤال،
 * وشرحاً يقول كيف يُقرأ الجواب، ومخرجاً إلى الشاشة الكاملة.
 */
export function SectionHeader({
  title,
  description,
  href,
  hrefLabel = 'عرض الكل',
  children,
  className,
}: {
  title: string;
  description?: string;
  href?: string;
  hrefLabel?: string;
  /** صفّ الخيارات أسفل العنوان — أقراص المقاييس عادةً */
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-3', className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-bold tracking-[-0.01em] text-heading sm:text-lg">
            {title}
          </h2>
          {description && (
            <p className="mt-0.5 max-w-prose text-xs text-muted-foreground sm:text-sm">
              {description}
            </p>
          )}
        </div>

        {href && (
          <Link href={href} className="no-print shrink-0">
            {/*
              السهم إلى اليسار في واجهة من اليمين إلى اليسار: هو اتجاه
              «إلى الأمام» هنا، فالسهم المنطقي يتبع اتجاه القراءة لا اسمه.
            */}
            <Button variant="primary" size="sm" endIcon={<ArrowLeft aria-hidden />}>
              {hrefLabel}
            </Button>
          </Link>
        )}
      </div>

      {children && <div className="mt-3 no-print">{children}</div>}
    </div>
  );
}

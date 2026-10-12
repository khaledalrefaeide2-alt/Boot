import { cn } from '@/lib/utils';
import { PageIcon } from './page-icon';

/**
 * رأس الصفحة — العنوان في البداية (يمين)، والإجراءات في النهاية (يسار).
 *
 * ★ العنوان أكبر ما في الصفحة، وبجانبه أيقونة قسمه.
 *
 *   30px وزن 700: هو أوّل ما تقع عليه العين فيقول «أين أنا» قبل أن يُقرأ
 *   شيءٌ آخر. والأيقونة تُشتقّ من التنقّل (`PageIcon`) فتطابق ما في
 *   القائمة الجانبية حرفاً بحرف. ومن مرّر `leading` (صورة حسابٍ مثلاً)
 *   حلّت محلّها.
 *
 * ★ والإجراءات تلتفّ تحت العنوان على الشاشة الضيّقة ولا تُقصّ.
 *
 *   صفٌّ واحد على 390px يضغط العنوان إلى كلمة في سطر، أو يدفع الأزرار
 *   خارج الشاشة. فالحاوية تلتفّ: العنوان صفٌّ كامل، والإجراءات صفٌّ تحته.
 */
export function PageHeader({
  title,
  description,
  /** عنوان فرعي صغير فوق العنوان — يسمّي المقطع الذي تنتمي إليه الصفحة */
  eyebrow,
  /** عنصر يتصدّر العنوان — صورة حساب أو أيقونة؛ وبدونه تُشتقّ أيقونة القسم */
  leading,
  action,
  /**
   * أُبقيت للتوافق مع الصفحات التي تمرّرها، ولم يعد لها أثرٌ بصري.
   *
   * كانت تضع تدرّجاً ملوّناً خلف الترويسة الأولى. والهوية الآن هادئة:
   * العنوان على الأرضية نفسها في كلّ صفحة، فلا تبدو صفحةٌ أهمّ من أخرى
   * لأنّها كُتبت أوّلاً.
   */
  hero: _hero = false,
  className,
}: {
  title: string;
  description?: string;
  eyebrow?: string;
  leading?: React.ReactNode;
  action?: React.ReactNode;
  hero?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('mb-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-4', className)}>
      <div className="flex min-w-0 items-center gap-4">
        {leading ?? <PageIcon />}
        <div className="min-w-0 space-y-1">
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h1 className="text-2xl font-bold leading-tight tracking-[-0.01em] text-heading sm:text-3xl">
            {title}
          </h1>
          {description && <p className="max-w-prose text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      {action && (
        <div className="flex flex-wrap items-center gap-2 no-print max-sm:w-full max-sm:[&>*]:flex-1">
          {action}
        </div>
      )}
    </div>
  );
}

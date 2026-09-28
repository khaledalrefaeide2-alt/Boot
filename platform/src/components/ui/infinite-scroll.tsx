'use client';

import { useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatNumber } from '@/lib/utils';

/*
 * ذيل القائمة اللانهائية.
 *
 * ★ زرٌّ حقيقي أوّلاً، والمراقب يضغطه.
 *
 *   التمرير اللانهائي المبنيّ على المراقب وحده يُقصي من لا يمرّر: من
 *   يتنقّل بلوحة المفاتيح لا يبلغ ما لم يُحمَّل، وقارئ الشاشة لا يجد ما
 *   يُعلن له أنّ بعده مزيداً. فالزرّ هو الواجهة، والمراقب تسهيلٌ فوقه —
 *   لا العكس.
 *
 *   وهو يحمي من عطبٍ آخر: المراقب قد لا يعمل (متصفّح قديم، أو طبقة
 *   تُعطّله)، وحينها تبقى القائمة صامتة عند آخر صفحة بلا ما يقول إنّ
 *   بعدها شيئاً. والزرّ يبقى ظاهراً يعمل.
 */

export function InfiniteSentinel({
  hasMore,
  isLoading,
  onLoad,
  loaded,
  total,
  label = 'منشوراً',
}: {
  hasMore: boolean;
  isLoading: boolean;
  onLoad: () => void;
  loaded: number;
  total: number;
  label?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hasMore || isLoading) return;
    const element = ref.current;
    if (!element) return;

    /*
     * `rootMargin` يسبق الحافّة بأربعمئة بكسل.
     *
     * والتحميل عند الحافّة تماماً يعني أن يرى المستخدم فراغاً ثم ينتظر:
     * الطلب يبدأ حين يصل، لا قبله. وأربعمئة بكسل تكفي ليصل الردّ قبل أن
     * يبلغ القارئ آخر بطاقة، فيبدو التمرير متّصلاً بلا انقطاع.
     */
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onLoad();
      },
      { rootMargin: '400px' },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [hasMore, isLoading, onLoad]);

  return (
    <div ref={ref} className="flex flex-col items-center gap-2 py-6">
      {hasMore ? (
        <>
          <Button variant="secondary" onClick={onLoad} loading={isLoading}>
            {isLoading ? 'جارٍ التحميل…' : 'تحميل المزيد'}
          </Button>
          {/*
            العدّاد يقول أين وصل القارئ من الكلّ.

            وقائمةٌ تطول بلا حدّ بلا رقم تُفقد الإحساس بالموضع: لا يدري
            أقرأ عُشر النتائج أم تسعة أعشارها، ولا متى يتوقّف.
          */}
          <p className="num text-2xs text-subtle-foreground" aria-live="polite">
            {formatNumber(loaded)} من {formatNumber(total)} {label}
          </p>
        </>
      ) : (
        <p className="num text-2xs text-subtle-foreground" aria-live="polite">
          {isLoading ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              جارٍ التحميل…
            </span>
          ) : (
            `عُرضت كل النتائج — ${formatNumber(loaded)} ${label}`
          )}
        </p>
      )}
    </div>
  );
}

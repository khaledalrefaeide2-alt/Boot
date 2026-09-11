'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { DURATION, EASE_OUT_EXPO, STAGGER_MS, prefersReducedMotion } from '@/lib/motion';

interface RevealProps {
  children: ReactNode;
  /** ترتيب العنصر داخل مجموعته — يضرب في فاصل التتابع */
  index?: number;
  /** المسافة التي يقطعها العنصر صعوداً، بالبكسل */
  distance?: number;
  className?: string;
  /** عنصر الغلاف — للحفاظ على دلالة HTML داخل القوائم والجداول */
  as?: 'div' | 'li' | 'section' | 'article';
}

/**
 * كشف عند دخول الإطار — بـ IntersectionObserver لا بمكتبة حركة.
 *
 * المنصة أداة تشغيل تُفتح يومياً، ووزن مكتبة حركة كاملة يُدفع في كل صفحة من
 * ثلاثين صفحة مقابل أثر يُرى مرة واحدة عند التمرير. والمراقب واجهة أصلية في
 * المتصفح، وتكلفتها صفر بعد التحميل.
 *
 * ثلاثة قرارات تستحق الذكر:
 *
 * ١) الحالة الابتدائية مخفية **بعد التركيب لا قبله**. لو بدأ العنصر مخفياً
 *    في HTML المُصيَّر على الخادم، لبقي مخفياً عند من عطّل JavaScript أو
 *    فشل تحميله — وهو محتوى لا زينة. فيُصيَّر ظاهراً ثم يُخفى في أول إطار.
 *
 * ٢) المراقب يفصل نفسه بعد أول ظهور. الكشف حدث مرة واحدة، وإبقاء المراقب
 *    يعني إعادة تشغيل الحركة كلما مرّ العنصر — وهو مزعج لا جميل.
 *
 * ٣) مع تقليل الحركة: يظهر المحتوى فوراً بلا انتقال ولا تأخير تتابع. لا
 *    «حركة أخف» بل لا حركة.
 */
export function Reveal({
  children,
  index = 0,
  distance = 18,
  className,
  as: Tag = 'div',
}: RevealProps) {
  const ref = useRef<HTMLElement>(null);
  const [state, setState] = useState<'server' | 'hidden' | 'shown'>('server');

  useEffect(() => {
    if (prefersReducedMotion()) {
      setState('shown');
      return;
    }

    const node = ref.current;
    if (!node) return;

    setState('hidden');

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          setState('shown');
          observer.disconnect();
        }
      },
      // الهامش السالب أسفل الإطار: يبدأ الكشف قبل أن يصل العنصر إلى الحافة
      // بقليل، فلا يرى المستخدم عنصراً يظهر بعد أن صار تحت عينه أصلاً.
      { rootMargin: '0px 0px -12% 0px', threshold: 0.01 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const hidden = state === 'hidden';

  return (
    <Tag
      ref={ref as never}
      className={cn('motion-reduce:!translate-y-0 motion-reduce:!opacity-100', className)}
      style={{
        opacity: hidden ? 0 : 1,
        transform: hidden ? `translate3d(0, ${distance}px, 0)` : 'translate3d(0, 0, 0)',
        transition:
          state === 'server'
            ? undefined
            : `opacity ${DURATION.reveal}ms ${EASE_OUT_EXPO} ${index * STAGGER_MS}ms, transform ${DURATION.reveal}ms ${EASE_OUT_EXPO} ${index * STAGGER_MS}ms`,
        willChange: state === 'shown' ? undefined : 'opacity, transform',
      }}
    >
      {children}
    </Tag>
  );
}

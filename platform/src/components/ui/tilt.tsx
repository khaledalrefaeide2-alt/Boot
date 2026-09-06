'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * غلاف يميل مع مؤشر الفأرة ميلاً ثلاثي الأبعاد.
 *
 * ثلاثة قيود تحكم هذا المكوّن، وكلها من قواعد الإتاحة لا من الذوق:
 *
 * أولاً، الميل لا يعمل إلا مع مؤشر دقيق (`pointer: fine`). على شاشة اللمس
 * لا يوجد «تحويم» يسبق النقر، فالأثر إما لا يظهر أصلاً أو يظهر بعد اللمس
 * فيبدو عطلاً. واللمس يحصل على الارتفاع الثابت وحده.
 *
 * ثانياً، تفضيل تقليل الحركة يُقرأ حيّاً لا مرة واحدة عند التركيب. قراءته
 * لقطةً واحدة تعني أن من يغيّر الإعداد في نظامه أثناء الجلسة يبقى يرى
 * الحركة — وهو بالضبط من فعّل الإعداد لأنها تؤذيه.
 *
 * ثالثاً، الحركة على `transform` وحدها. تحريك الأبعاد أو المواضع يُجبر
 * المتصفح على إعادة التخطيط في كل إطار فيسقط معدّل الإطارات.
 */
export function Tilt({
  children,
  className,
  max,
}: {
  children: React.ReactNode;
  className?: string;
  /** أقصى ميل بالدرجات — الافتراضي من الرمز --tilt-max */
  max?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const frame = useRef<number | null>(null);
  const [interactive, setInteractive] = useState(false);

  useEffect(() => {
    const fine = window.matchMedia('(pointer: fine)');
    const still = window.matchMedia('(prefers-reduced-motion: reduce)');

    const sync = () => setInteractive(fine.matches && !still.matches);
    sync();

    fine.addEventListener('change', sync);
    still.addEventListener('change', sync);
    return () => {
      fine.removeEventListener('change', sync);
      still.removeEventListener('change', sync);
    };
  }, []);

  // الميل يُلغى فور توقف التفاعل، وإلا بقيت البطاقة مائلة إلى الأبد
  useEffect(() => {
    if (interactive) return;
    const node = ref.current;
    if (node) node.style.removeProperty('transform');
  }, [interactive]);

  function onMove(event: React.MouseEvent<HTMLDivElement>) {
    if (!interactive) return;
    const node = ref.current;
    if (!node) return;

    const { clientX, clientY } = event;
    // القراءة والكتابة في إطار واحد: الحساب هنا والتطبيق داخل rAF
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const box = node.getBoundingClientRect();
      const limit = max ?? 6;
      // -1..1 من مركز البطاقة
      const x = (clientX - box.left) / box.width - 0.5;
      const y = (clientY - box.top) / box.height - 0.5;
      node.style.transform =
        `perspective(900px) rotateX(${(-y * limit * 2).toFixed(2)}deg) ` +
        `rotateY(${(x * limit * 2).toFixed(2)}deg)`;
    });
  }

  function onLeave() {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    const node = ref.current;
    if (node) node.style.removeProperty('transform');
  }

  useEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
  }, []);

  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      className={cn('transition-transform duration-300 ease-out will-change-transform', className)}
      style={{ transformStyle: 'preserve-3d' }}
    >
      {children}
    </div>
  );
}

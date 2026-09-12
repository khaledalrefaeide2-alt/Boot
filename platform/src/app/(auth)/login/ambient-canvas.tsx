'use client';

import { useEffect, useRef } from 'react';
import { prefersReducedMotion } from '@/lib/motion';

/**
 * حقل نقاط منجرف خلف شاشة الدخول — على canvas ثنائي الأبعاد لا WebGL.
 *
 * المواصفة تقترح جسيمات WebGL. ورُفضت هنا لا تكاسلاً: محرّك رسوميات كامل
 * يعني حزمة إضافية تُحمَّل وسياق GPU يُنشأ ووحدات تظليل تُترجم — كل ذلك
 * مقابل خلفية تُرى ثوانيَ قبل تسجيل الدخول، على منصة داخلية قد تُفتح من
 * أجهزة مكتبية قديمة بلا تسريع رسومي. والـ canvas الثنائي يعطي الأثر نفسه
 * عملياً بتكلفة إطار واحد من الرسم.
 *
 * أربعة قيود مفروضة على الحلقة، وكلها مسائل صحّة لا تحسين:
 *
 * ١) مع تقليل الحركة: يُرسم إطار واحد ساكن ثم تتوقف الحلقة. لا حركة أبطأ
 *    بل لا حركة — ومع ذلك يبقى المشهد لا فراغاً.
 *
 * ٢) عند إخفاء التبويب تتوقف الحلقة. requestAnimationFrame يتوقف وحده في
 *    أغلب المتصفحات، لكن ليس في كلها ولا في النوافذ المصغّرة — وحلقة رسم
 *    تعمل في تبويب مخفي تستنزف بطارية جهاز الموظف بلا أن يرى شيئاً.
 *
 * ٣) نسبة البكسل مسقوفة عند 2. شاشة بنسبة 3 تُضاعف مساحة الرسم تسعة
 *    أضعاف مقابل فرق لا يُرى في نقاط قطرها بكسلان.
 *
 * ٤) كل شيء يُلغى عند التفكيك: الحلقة والمراقب والمستمعون. وإلا بقيت
 *    ترسم بعد انتقال المستخدم إلى الصفحة التالية.
 */
export function AmbientCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const reduced = prefersReducedMotion();
    let frame = 0;
    let width = 0;
    let height = 0;

    type Dot = { x: number; y: number; vx: number; vy: number; r: number };
    let dots: Dot[] = [];

    function seed() {
      // الكثافة بالمساحة لا بعدد ثابت: عدد ثابت يزدحم على الجوال ويتبدّد
      // على شاشة عريضة. ونقطة لكل 16 ألف بكسل مربّع، بسقف يمنع الانفجار.
      const target = Math.min(90, Math.round((width * height) / 16000));
      dots = Array.from({ length: target }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.18,
        vy: (Math.random() - 0.5) * 0.18,
        r: Math.random() * 1.4 + 0.6,
      }));
    }

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas!.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas!.width = Math.round(width * dpr);
      canvas!.height = Math.round(height * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    }

    /** لون التفاعل يُقرأ من رمز اللوحة لا يُكتب هنا — فيتبع تبديل السمة */
    function accent(): string {
      const value = getComputedStyle(document.documentElement)
        .getPropertyValue('--primary')
        .trim();
      return value || '#e3a184';
    }

    function draw() {
      const color = accent();
      ctx!.clearRect(0, 0, width, height);

      for (const dot of dots) {
        if (!reduced) {
          dot.x += dot.vx;
          dot.y += dot.vy;
          if (dot.x < 0 || dot.x > width) dot.vx *= -1;
          if (dot.y < 0 || dot.y > height) dot.vy *= -1;
        }
        ctx!.beginPath();
        ctx!.arc(dot.x, dot.y, dot.r, 0, Math.PI * 2);
        ctx!.fillStyle = color;
        ctx!.globalAlpha = 0.35;
        ctx!.fill();
      }

      // الوصلات بين المتجاورين — هي ما يحوّل نقاطاً متناثرة إلى شبكة
      ctx!.lineWidth = 0.6;
      for (let i = 0; i < dots.length; i++) {
        for (let j = i + 1; j < dots.length; j++) {
          const a = dots[i]!;
          const b = dots[j]!;
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const distance = Math.hypot(dx, dy);
          if (distance > 110) continue;
          ctx!.beginPath();
          ctx!.moveTo(a.x, a.y);
          ctx!.lineTo(b.x, b.y);
          ctx!.strokeStyle = color;
          ctx!.globalAlpha = 0.12 * (1 - distance / 110);
          ctx!.stroke();
        }
      }
      ctx!.globalAlpha = 1;
    }

    function loop() {
      draw();
      frame = requestAnimationFrame(loop);
    }

    function start() {
      cancelAnimationFrame(frame);
      if (reduced) {
        draw();
        return;
      }
      frame = requestAnimationFrame(loop);
    }

    function onVisibility() {
      if (document.hidden) cancelAnimationFrame(frame);
      else start();
    }

    resize();
    start();

    const observer = new ResizeObserver(() => {
      resize();
      if (reduced) draw();
    });
    observer.observe(canvas);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  );
}

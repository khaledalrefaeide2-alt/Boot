'use client';

import { useEffect, useRef, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { cn } from '@/lib/utils';

type LoadState = 'loading' | 'loaded' | 'failed';

/**
 * صورة وسائط من مصدر خارجي، بحالاتها الثلاث.
 *
 * نخزّن الروابط فقط ولا نحمّل الملفات، فالصورة تُطلب من خادم المنصة مباشرة
 * من جهاز الموظف. يترتب على ذلك أمران:
 *
 * - `referrerPolicy="no-referrer"` يمنع تسريب عنوان المنصة الداخلية وصفحاتها
 *   إلى الخوادم الخارجية في ترويسة Referer مع كل صورة تُعرض.
 * - التحميل يستغرق وقتاً وقد يفشل (شبكة معزولة، أو حُذف المحتوى من مصدره).
 *   لذلك هيكل تحميل يشغل المساحة نفسها ثم تظهر الصورة بتلاشٍ لطيف، فلا
 *   يقفز التخطيط ولا تظهر أيقونة الصورة المكسورة.
 *
 * الأبعاد تأتي من `className` على الحاوية، والصورة تملؤها.
 */
export function RemoteMedia({
  src,
  mediaKey,
  className,
  fallback = 'placeholder',
  fallbackLabel = 'تعذّر عرض الوسائط',
}: {
  src: string;
  /**
   * مفتاح المصغّرة المحفوظة عندنا — يُفضَّل على المصدر حين يوجد.
   *
   * روابط المنصات موقّعة وتنتهي صلاحيتها، فالمصدر يموت والمصغّرة تبقى.
   * ويُسقَط إلى المصدر حين لا مصغّرة: منشورٌ استُورد قبل المخزن، أو صورةٌ
   * تعذّر جلبها.
   */
  mediaKey?: string | null;
  className?: string;
  /** `hide` يزيل العنصر كلياً، و`placeholder` يُبقي مكانه محجوزاً */
  fallback?: 'hide' | 'placeholder';
  fallbackLabel?: string;
}) {
  const [state, setState] = useState<LoadState>('loading');
  const [useSource, setUseSource] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);

  const stored = mediaKey ? `/api/media/${mediaKey}` : null;
  const url = stored && !useSource ? stored : src;

  /*
   * الصورة المخزّنة في ذاكرة المتصفح تكتمل قبل أن يربط React مستمع onLoad،
   * فلا يُستدعى المستمع أبداً وتبقى الصورة شفافة تماماً رغم تحميلها بنجاح.
   * لذلك نسأل العنصر عن حالته عند التركيب بدل انتظار الحدث وحده.
   */
  useEffect(() => {
    const image = imageRef.current;
    if (!image?.complete) return;
    setState(image.naturalWidth > 0 ? 'loaded' : 'failed');
  }, [url]);

  /*
   * فشلُ المصغّرة ليس فشلاً نهائياً.
   *
   * الملف قد يكون حُذف في تنظيف المخزن، والمصدر قد يكون ما زال حيّاً.
   * فتُجرَّب المرّة الثانية على المصدر قبل أن يُعلن العجز.
   */
  const handleError = () => {
    if (stored && !useSource) {
      setUseSource(true);
      setState('loading');
      return;
    }
    setState('failed');
  };

  if (state === 'failed' && fallback === 'hide') return null;

  return (
    <span className={cn('relative block overflow-hidden bg-surface-2', className)}>
      {state === 'loading' && <span className="skeleton absolute inset-0" aria-hidden />}

      {state === 'failed' ? (
        <span
          className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-2 text-center text-muted-foreground"
          role="img"
          aria-label={`${fallbackLabel} من مصدرها`}
        >
          <ImageOff className="h-5 w-5 opacity-70" aria-hidden />
          <span className="text-2xs leading-tight">{fallbackLabel}</span>
        </span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={imageRef}
          key={url}
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={() => setState('loaded')}
          onError={handleError}
          className={cn(
            'absolute inset-0 h-full w-full object-cover transition-opacity duration-500',
            state === 'loaded' ? 'opacity-100' : 'opacity-0',
          )}
        />
      )}
    </span>
  );
}

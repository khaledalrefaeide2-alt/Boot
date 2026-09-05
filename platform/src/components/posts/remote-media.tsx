'use client';

import { useState } from 'react';
import { ImageOff } from 'lucide-react';

/**
 * صورة وسائط من مصدر خارجي.
 *
 * نخزّن الروابط فقط ولا نحمّل الملفات، فالصورة تُطلب من خادم المنصة مباشرة
 * من جهاز الموظف. لذلك:
 *
 * - `referrerPolicy="no-referrer"` يمنع تسريب عنوان المنصة الداخلية وصفحاتها
 *   إلى الخوادم الخارجية في ترويسة Referer مع كل صورة تُعرض.
 * - المنصة قد تعمل على شبكة معزولة أو يُحذف المحتوى من مصدره، فيفشل تحميل
 *   الصورة. البديل عنصر محايد بدل أيقونة الصورة المكسورة.
 */
export function RemoteMedia({
  src,
  className,
  fallback = 'placeholder',
}: {
  src: string;
  className?: string;
  /** `hide` يخفي العنصر كلياً، و`placeholder` يعرض بديلاً محايداً */
  fallback?: 'hide' | 'placeholder';
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    if (fallback === 'hide') return null;
    return (
      <div
        className={`flex items-center justify-center bg-surface-2 text-subtle-foreground ${className ?? ''}`}
        role="img"
        aria-label="تعذّر عرض الوسائط من مصدرها"
      >
        <ImageOff className="h-5 w-5" aria-hidden />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      className={className}
      onError={() => setFailed(true)}
    />
  );
}

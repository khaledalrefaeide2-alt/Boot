'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { RemoteMedia } from '@/components/posts/remote-media';

/**
 * معرض وسائط المنشور مع عارض موسّع.
 *
 * الشبكة تعرض المصغّرات بنسبة موحّدة، والنقر يفتح الصورة بحجمها الكامل.
 * التصفّح بلوحة المفاتيح معكوس الاتجاه عمداً: الواجهة عربية والصور تترتب
 * من اليمين إلى اليسار، فالسهم الأيسر ينتقل إلى التالي كما تتوقع العين،
 * لا كما يفعل في الواجهات اللاتينية.
 */
export function MediaGallery({ urls }: { urls: string[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const total = urls.length;

  const close = useCallback(() => setOpenIndex(null), []);
  const step = useCallback(
    (delta: number) => setOpenIndex((current) => (current === null ? null : (current + delta + total) % total)),
    [total],
  );

  useEffect(() => {
    if (openIndex === null) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
      // الاتجاه معكوس لأن ترتيب الصور من اليمين إلى اليسار
      else if (event.key === 'ArrowLeft') step(1);
      else if (event.key === 'ArrowRight') step(-1);
    };

    document.addEventListener('keydown', onKey);
    // منع تمرير الصفحة خلف العارض
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [openIndex, close, step]);

  if (total === 0) return null;

  return (
    <>
      {/*
        صورة واحدة تُعرض عريضة كما تُنشر عادةً، وأكثر من صورة تُعرض في شبكة
        مربّعات متساوية. المربّع الموحّد يُبقي الصفوف مستوية مهما اختلفت أبعاد
        الأصل، ولو مُنحت الأولى مساحة أكبر لتفاوتت ارتفاعات الصف الواحد.
        النسبة على الزر نفسه لا على الصورة، فتملأ الصورة الخانة دون أشرطة فارغة.
      */}
      <div className={total === 1 ? 'mt-4' : 'mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3'}>
        {urls.map((url, index) => (
          <button
            key={url}
            type="button"
            onClick={() => setOpenIndex(index)}
            className={`group relative block w-full overflow-hidden rounded-md border border-border transition-colors hover:border-primary focus-visible:border-primary ${
              total === 1 ? 'aspect-video' : 'aspect-square'
            }`}
            aria-label={`تكبير الصورة ${index + 1} من ${total}`}
          >
            <RemoteMedia
              src={url}
              className="h-full w-full transition-transform duration-500 ease-out group-hover:scale-[1.04]"
            />
          </button>
        ))}
      </div>

      {openIndex !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={`عارض الوسائط — ${openIndex + 1} من ${total}`}
          onClick={close}
        >
          <button
            type="button"
            onClick={close}
            className="absolute top-4 end-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
            aria-label="إغلاق العارض"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>

          {total > 1 && (
            <>
              {/*
                الصور تترتب من اليمين إلى اليسار، فالسابق يمين والتالي يسار،
                والسهم يشير إلى جهة الانتقال لا إلى عكسها.
              */}
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  step(-1);
                }}
                className="absolute start-4 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
                aria-label="الصورة السابقة"
              >
                <ChevronRight className="h-6 w-6" aria-hidden />
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  step(1);
                }}
                className="absolute end-4 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
                aria-label="الصورة التالية"
              >
                <ChevronLeft className="h-6 w-6" aria-hidden />
              </button>
            </>
          )}

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={urls[openIndex]}
            alt=""
            referrerPolicy="no-referrer"
            className="max-h-[85vh] max-w-[90vw] rounded-lg object-contain shadow-elev-4"
            onClick={(event) => event.stopPropagation()}
          />

          {total > 1 && (
            <span className="absolute bottom-5 rounded-full bg-white/10 px-3 py-1 text-sm text-white">
              <span className="num">
                {openIndex + 1} / {total}
              </span>
            </span>
          )}
        </div>
      )}
    </>
  );
}

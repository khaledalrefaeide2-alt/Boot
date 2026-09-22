'use client';

import Link from 'next/link';
import { Play, Images } from 'lucide-react';
import { RemoteMedia } from '@/components/posts/remote-media';
import { cn } from '@/lib/utils';

/**
 * صورة المنشور في البطاقة.
 *
 * نسبة ثابتة لكل الصور بدل ارتفاع ثابت: مصادر المنشورات تُرجع صوراً بأبعاد
 * شديدة الاختلاف (ريل طولي، صورة عريضة، مربّعة)، والنسبة الموحّدة تُبقي
 * صفوف الشبكة مستوية فتُقرأ اللوحة دفعةً واحدة بدل أن تتعرّج.
 *
 * ما فوق الصورة:
 * - تدرّج سفلي يضمن قراءة الشارات فوق الصور الفاتحة.
 * - زر تشغيل في الوسط للفيديو والريل — الشارة الصغيرة في الزاوية لا تُقرأ
 *   بلمحة، وزر التشغيل اصطلاح يفهمه الجميع بلا نص.
 * - عدّاد للألبومات يقول كم صورة أخرى في المنشور.
 */
export function PostThumb({
  postId,
  src,
  isVideo,
  extraCount = 0,
  mediaKey,
  className,
}: {
  postId: string;
  src: string;
  isVideo?: boolean;
  extraCount?: number;
  /** مفتاح المصغّرة المحفوظة — يُفضَّل على رابط المصدر المنتهي */
  mediaKey?: string | null;
  /** زوايا الصورة وحدودها تتبع موضعها: ملتصقة بحافة البطاقة أو منزاحة داخلها */
  className?: string;
}) {
  return (
    <Link
      href={`/posts/${postId}`}
      className={cn(
        'group relative block aspect-[16/10] overflow-hidden bg-surface-2',
        className,
      )}
      aria-label="فتح تفاصيل المنشور"
    >
      <RemoteMedia
        src={src}
        mediaKey={mediaKey}
        className="h-full w-full transition-transform duration-500 ease-out group-hover:scale-[1.04]"
      />

      <span
        className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/50 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        aria-hidden
      />

      {isVideo && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/55 ring-1 ring-white/25 backdrop-blur-[2px] transition-transform duration-300 group-hover:scale-110">
            <Play className="h-5 w-5 translate-x-px fill-white text-white" aria-hidden />
          </span>
          <span className="sr-only">منشور فيديو</span>
        </span>
      )}

      {extraCount > 0 && (
        <span className="pointer-events-none absolute bottom-2 start-2 flex items-center gap-1 rounded bg-black/65 px-1.5 py-0.5 text-2xs font-medium text-white backdrop-blur-[2px]">
          <Images className="h-3 w-3" aria-hidden />
          <span className="num">+{extraCount}</span>
          <span className="sr-only">صور إضافية في المنشور</span>
        </span>
      )}
    </Link>
  );
}

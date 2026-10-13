'use client';

import { RemoteMedia } from '@/components/posts/remote-media';
import { cn } from '@/lib/utils';

/**
 * صورة حسابٍ أو صفحة.
 *
 * الحرف الأوّل يُرسم دائماً والصورة تعلوه — لا «إن وُجد رابط فصورة وإلا
 * فحرف». الرابط قد يوجد ثمّ يفشل تحميله، والصور الشخصية على شبكات التوصيل
 * تنتهي صلاحيتها، فيكشف الفشلُ الحرفَ من تحته بلا دائرة فارغة ولا حالة
 * ثالثة تُكتب في كل موضع على حدة.
 */
const SIZES = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-11 w-11 text-base',
} as const;

export function AccountAvatar({
  name,
  src,
  mediaKey,
  size = 'lg',
  className,
}: {
  name: string;
  src: string | null | undefined;
  /**
   * مفتاح الصورة المحفوظة عندنا — يُقرأ أوّلاً، والرابط بعده.
   *
   * رابط المنصة يموت بعد أيام، والنسخة المحفوظة لا تموت. فمن مرّر المفتاح
   * رأى الصورة بعد شهر كما رآها يوم استُخرجت.
   */
  mediaKey?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const trimmed = src?.trim();

  return (
    <span
      className={cn(
        'relative flex shrink-0 items-center justify-center overflow-hidden rounded-full',
        'bg-brand-100 font-semibold text-brand-800 ring-1 ring-border',
        SIZES[size],
        className,
      )}
    >
      <span aria-hidden>{name.trim().charAt(0) || '؟'}</span>
      {(trimmed || mediaKey) && (
        <RemoteMedia
          src={trimmed ?? ''}
          mediaKey={mediaKey}
          fallback="hide"
          className="absolute inset-0 h-full w-full"
        />
      )}
      <span className="sr-only">{name}</span>
    </span>
  );
}

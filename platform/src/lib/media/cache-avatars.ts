import 'server-only';
import { prisma } from '@/lib/db';
import { isFetchableMedia, storeThumbnail } from '@/lib/media/store';
import type { Prisma } from '@/generated/prisma';

/*
 * حفظ الصور الشخصية للحسابات — بالمخزن نفسه الذي تُحفظ فيه مصغّرات المنشورات.
 *
 * ★ لماذا لا يكفي الرابط؟
 *
 *   الصورة الشخصية كانت تُحفظ رابطاً كما يرسله المشغّل. وروابط فيسبوك
 *   وإنستغرام موقّعة تنتهي صلاحيتها بعد أيام، فبعد أسبوعٍ يفشل تحميلها
 *   في كلّ بطاقة ويظهر الحرف الأوّل من اسم الحساب مكانها. والمنشورات لم
 *   تُصَب بهذا لأنّ صورها تُجلب لحظة الاستيراد وتُحفظ عندنا.
 *
 * ★ والحالات ثلاث، ويحملها عمود `avatarCheckedAt` مع المفتاح:
 *
 *   - نجح الحفظ: المفتاح مكتوب، والتاريخ مكتوب — انتهى أمر هذا الرابط.
 *   - فشلٌ نهائي (403، 410 — توقيعٌ انتهى أو صورةٌ حُذفت): التاريخ وحده
 *     مكتوب، فلا تعود المكنسة إلى رابطٍ ميّت في كلّ دورة. والمفتاح القديم
 *     إن وُجد يبقى: صورةٌ سابقة خيرٌ من حرف.
 *   - فشلٌ عابر (انقطاع، مهلة): لا شيء يُكتب، فتعود المكنسة في الدورة
 *     التالية.
 *
 *   ورابطٌ جديد من الاستخراج يُصفّر التاريخ، فيُحاوَل من جديد.
 */

export interface AvatarCacheResult {
  attempted: number;
  stored: number;
  gone: number;
  retry: number;
}

/** الحساب ينتظر الحفظ: له رابط، ولم يُحسم أمر هذا الرابط بعد */
export const PENDING_AVATAR_WHERE: Prisma.AccountWhereInput = {
  avatarUrl: { not: null },
  avatarCheckedAt: null,
};

export async function pendingAvatarCount(): Promise<number> {
  return prisma.account.count({ where: PENDING_AVATAR_WHERE });
}

/**
 * ما يُكتب في الحساب بعد محاولة حفظ رابطٍ واحد — دالّةٌ خالصة.
 *
 * مفصولةٌ عن الجلب لأنّها القرار كلّه: الاستخراج والمكنسة يقرّران بها
 * معاً، فلا يفترقان في معنى «نجح» و«مات» و«يُعاد».
 */
export function avatarUpdateFor(
  outcome: Awaited<ReturnType<typeof storeThumbnail>>,
  now: Date,
): Prisma.AccountUpdateInput {
  if (outcome.ok) return { avatarKey: outcome.key, avatarCheckedAt: now };
  if (outcome.permanent) return { avatarCheckedAt: now };
  return { avatarCheckedAt: null };
}

/**
 * حفظ صورة حسابٍ واحد من رابطٍ وصل للتوّ — يُستدعى من الاستخراج.
 *
 * هذه هي اللحظة الوحيدة التي يكون فيها الرابط حيّاً بيقين. والرابط
 * يُكتب مع النتيجة في تحديثٍ واحد، فلا يبقى حسابٌ برابطٍ جديد وتاريخٍ
 * قديم يُعلن أنّ رابطه حُسم.
 *
 * لا يرمي أبداً: فشلُ صورةٍ لا يُفشل استخراجاً نجح.
 */
export async function storeAccountAvatar(accountId: string, url: string): Promise<void> {
  const outcome = isFetchableMedia(url)
    ? await storeThumbnail(url)
    : ({ ok: false, permanent: true, reason: 'مضيف غير مسموح' } as const);

  await prisma.account
    .update({
      where: { id: accountId },
      data: { avatarUrl: url, ...avatarUpdateFor(outcome, new Date()) },
    })
    .catch(() => undefined);
}

/**
 * المكنسة: الحسابات التي لها رابط لم يُحسم بعد.
 *
 * الحسابات بالمئات لا بالآلاف، فالدفعة صغيرة والتوازي اثنان — ولا يبدو
 * طلبنا على شبكة توزيع المنصة هجوماً.
 */
export async function cacheAccountAvatars(limit = 25): Promise<AvatarCacheResult> {
  const accounts = await prisma.account.findMany({
    where: PENDING_AVATAR_WHERE,
    select: { id: true, avatarUrl: true },
    orderBy: { updatedAt: 'desc' },
    take: limit,
  });

  const result: AvatarCacheResult = { attempted: 0, stored: 0, gone: 0, retry: 0 };
  let cursor = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const account = accounts[cursor];
      cursor += 1;
      if (!account?.avatarUrl) return;

      result.attempted += 1;
      const outcome = isFetchableMedia(account.avatarUrl)
        ? await storeThumbnail(account.avatarUrl)
        : ({ ok: false, permanent: true, reason: 'مضيف غير مسموح' } as const);

      if (outcome.ok) result.stored += 1;
      else if (outcome.permanent) result.gone += 1;
      else result.retry += 1;

      const data = avatarUpdateFor(outcome, new Date());
      // العابر لا يكتب شيئاً — يبقى معلّقاً للدورة التالية
      if (outcome.ok || outcome.permanent) {
        await prisma.account
          .updateMany({
            // والرابط شرطٌ في التحديث: إن غيّره استخراجٌ أثناء الجلب فنتيجتنا عن رابطٍ قديم
            where: { id: account.id, avatarUrl: account.avatarUrl },
            data: data as Prisma.AccountUpdateManyMutationInput,
          })
          .catch(() => undefined);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(2, accounts.length) }, worker));
  return result;
}

import 'server-only';
import { cachePostThumbnails, pendingMediaCount, type CacheResult } from './cache-posts';

/*
 * مكنسة الوسائط.
 *
 * ★ هذه هي الحلقة المفقودة.
 *
 *   المصغّرة كانت تُجلب مرّةً واحدة: عند الاستيراد، بسقف أربعمئة منشور في
 *   التشغيل، وبلا إعادة محاولة أبداً. فثلاثة تسرّبات تُنتج العَرَض نفسه:
 *
 *     ١) تشغيلٌ جلب خمسمئة منشور — مئةٌ منها لم تُحاوَل أصلاً.
 *     ٢) صورةٌ تعثّر جلبها لحظتها (شبكة، أو رفضٌ عابر) — لا تُعاد أبداً.
 *     ٣) ملفٌّ حذفه التقليم — والمفتاح باقٍ يشير إلى لا شيء.
 *
 *   وفي الحالات الثلاث تُعرض «تعذّر عرض الوسائط»، ولا يعرف أحد أيّها وقع.
 *   وحين يُكتشف النقص يكون رابط المنصة قد انتهت صلاحيته — فلا استرجاع.
 *
 *   والمكنسة تُغلق الثلاثة: تلتقط كلّ منشورٍ بلا مفتاح ما دامت محاولاته
 *   دون الحدّ، وتُعيد إليه. والسرعة هي كل شيء هنا — الرابط يعيش ساعات.
 *
 * ★ ولا تكلفة على المزوّد فيها.
 *
 *   الصور تُجلب من شبكات توزيع المنصات، لا من OpenAI ولا من Apify. فلا
 *   سقف يوميّ لها كسقف التصنيف: الحدّ الوحيد ألّا تبدو طلباتُنا هجوماً،
 *   وهو ما يضبطه حجم الدفعة والتوازي الرباعي في `cache-posts`.
 */

/**
 * دورة كل أربع دقائق — أقصر من كلّ المكانس الأخرى.
 *
 * لأنّ ما تلاحقه يموت: رابط فيسبوك الموقّع يعيش ساعات، فالمنشور الذي
 * يُستورد الآن يُنقذ الآن أو لا يُنقذ. والتصنيف والفهرسة تعملان على نصٍّ
 * مخزَّن عندنا لا يذهب، فتأخيرهما يكلّف انتظاراً لا فقداً.
 */
export const MEDIA_SWEEP_INTERVAL_MS = 4 * 60 * 1000;

export type MediaSweepOutcome =
  | { swept: false; reason: string }
  | (CacheResult & { swept: true; remaining: number });

/**
 * دورة واحدة من مكنسة الوسائط.
 *
 * لا ترمي أبداً — تعمل في مؤقّت بلا من يلتقط خطأها، والاستثناء الخارج
 * منها يسقط العامل الخلفي كله.
 */
export async function sweepMedia(options: {
  batch: number;
  maxAttempts: number;
}): Promise<MediaSweepOutcome> {
  try {
    const before = await pendingMediaCount(options.maxAttempts);
    if (before === 0) return { swept: false, reason: 'كل الصور محفوظة' };

    const result = await cachePostThumbnails({}, options.batch, options.maxAttempts);
    if (result.attempted === 0) return { swept: false, reason: 'لا صور تنتظر' };

    const remaining = await pendingMediaCount(options.maxAttempts);
    return { swept: true, ...result, remaining };
  } catch (error) {
    console.error(
      '[media] تعثّرت دورة حفظ الصور:',
      error instanceof Error ? error.message : error,
    );
    return { swept: false, reason: 'خطأ غير متوقّع' };
  }
}

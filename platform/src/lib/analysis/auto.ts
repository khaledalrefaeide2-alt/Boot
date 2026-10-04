import 'server-only';
import { prisma } from '@/lib/db';
import { getAnalysisSettings } from '@/lib/settings';
import { isAssistantConfigured } from '@/lib/assistant/config';
import { postFiltersSchema } from '@/lib/validation/posts';
import { AnalysisRunError, activeRun, createAnalysisRun, reapStaleRuns } from './run';

/*
 * المكنسة — التصنيف يجري من تلقاء نفسه.
 *
 * كان التصنيف ينتظر إنساناً يفتح شاشة ويضغط زرّاً، فالمنشور الوارد ليلاً
 * يبقى «غير محسوم» إلى أن ينتبه أحد. ولوحةٌ نصفُ منشوراتها بلا تصنيف لا
 * تُقرأ: النِّسب فيها محسوبة على ما صُنّف وحده، وهي تبدو نسباً كاملة.
 *
 * وهذه تعمل في العامل الخلفي كل بضع دقائق، وتلتقط ما وصل بلا تصنيف —
 * الوارد الجديد وما أخفق في جولة سابقة. مكنسةٌ واحدة تكفي عن مسارين: لا
 * حاجة إلى تعليقها بنهاية الاستخراج، ولا إلى مسارٍ ثانٍ يُصلح ما فات
 * الأول — ما يفوتها الآن تلتقطه بعد دقائق.
 *
 * ★ ولا تلمس ما صُنّف. الشرط `analysis IS NULL` يُبقيها على غير المصنَّف
 *   وحده، فلا تُعيد تصنيف شيء ولا تكتب فوق تصحيح مراجع. وإعادة التصنيف
 *   قرارٌ يُطلب من الشاشة بقصد.
 *
 * ★ وتبلغ كلّ منشورٍ مستخرَج — الوارد اليوم أوّلاً ثم المتراكم نزولاً.
 *
 *   حدُّ `analysis.startDate` لا يزال قائماً ويُضبط من شاشة الإعدادات،
 *   غير أنّ افتراضه صار فارغاً — بلا حدّ. وكان تاريخاً يُسقط كلّ ما
 *   استُخرج قبله، وُضع يوم كانت الجولة تبدأ بأقدم منشورٍ في القاعدة:
 *   فبلا حدٍّ تُصرف دفعاتُ اليوم كلّها على أرشيفٍ لا ينظر إليه أحد، ولا
 *   تبلغ منشورَ الصباح أبداً.
 *
 *   والعلّة عولجت في موضعها لا هنا: الجولة تبدأ بالأحدث، فالوارد قبل
 *   ساعة أوّلُ ما يُصنَّف مهما كان خلفه. وبقي الحدّ أثراً جانبياً وحده —
 *   منشوراتٌ لا تُصنَّف أبداً ولا شيء يقول كم — فرُفع.
 *
 *   والقياس `createdAt` لا `publishedAt` — «المستخرج بعد التاريخ» لا
 *   «المنشور بعده». ومنشورٌ نُشر قبل سنة ودخل قاعدتنا هذا الصباح يدخل.
 */

/** كل كم تعمل المكنسة — دقائق لا ثوانٍ: التصنيف ليس عاجلاً */
export const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

export type SweepOutcome =
  | { swept: false; reason: string }
  | { swept: true; runId: string; total: number; pending: number };

/**
 * المنشورات التي تنتظر تصنيفاً الآن.
 *
 * `since` إلزامي لا اختياري: القيمة الافتراضية «بلا حدّ» تعني أنّ نسيانها
 * في موضعٍ واحد يُظهر على الشاشة عدّاً لعشرات الآلاف لن تلمسها المكنسة —
 * رقمٌ صحيحٌ عن سؤالٍ لم يُسأل. فيُصرَّح به في كل نداء.
 */
export async function pendingCount(since: Date | null): Promise<number> {
  return prisma.post.count({
    /*
     * بلا شرط النصّ: المنشور المصوَّر يُصنَّف من صورته، وما لا مادّة فيه
     * تُسجَّل إحالته.
     *
     * و`analyzedAt: null` لا `analysis: { is: null }` — والفرق في الثمن
     * لا في المعنى: الثاني ضمٌّ معاكس على جدول التحاليل يُقرأ كلّ خمس
     * دقائق على جدولٍ من عشرات الآلاف، والأول بادئةُ فهرسٍ تضيق كلّما
     * صُنّف منشور. والعمودان يُكتبان في معاملة واحدة فلا يفترقان.
     */
    where: {
      isHidden: false,
      analyzedAt: null,
      ...(since ? { createdAt: { gte: since } } : {}),
    },
  });
}

/**
 * ما صنّفته المكنسة في آخر أربع وعشرين ساعة.
 *
 * يُحسب من الجولات التلقائية وحدها: التشغيل اليدوي قرارٌ صريح من صاحب
 * المنصة، ولا يصحّ أن يستهلك السقف الذي يحمي من الإنفاق غير المقصود ثمّ
 * يوقف الأتمتة بسببه.
 *
 * ويُحسب من `done` لا من `total`: الجولة التي أُلغيت بعد عشرة منشورات
 * دفعت ثمن عشرة لا ثمن مئتين.
 */
export async function analyzedToday(): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const rows = await prisma.analysisRun.aggregate({
    where: { trigger: 'AUTO', createdAt: { gte: since } },
    _sum: { done: true },
  });
  return rows._sum.done ?? 0;
}

/**
 * دورة واحدة من المكنسة.
 *
 * لا ترمي أبداً — تعمل في مؤقّت بلا من يلتقط خطأها، والاستثناء الخارج
 * منها يسقط العامل الخلفي كله ومعه الاستخراج والصيانة.
 */
export async function sweepAutoAnalysis(): Promise<SweepOutcome> {
  try {
    const settings = await getAnalysisSettings();
    if (!settings.auto) return { swept: false, reason: 'التصنيف التلقائي مُطفأ من الإعدادات' };

    if (!isAssistantConfigured()) {
      return { swept: false, reason: 'مفتاح OpenAI غير معرّف' };
    }

    // الجولة الميتة تُغلق أولاً، وإلا قفلت المكنسة إلى الأبد
    await reapStaleRuns();

    const running = await activeRun();
    if (running) return { swept: false, reason: 'جولة قائمة' };

    /*
     * التاريخ يُقرأ مرّةً في الدورة ثمّ يُمرَّر إلى العدّ وإلى الجولة
     * معاً — فلا يختلف ما عُدّ عمّا صُنّف.
     */
    const since = settings.startDate;

    const pending = await pendingCount(since);
    if (pending === 0) {
      return {
        swept: false,
        reason: since
          ? `لا منشورات مستخرجة بعد ${since.toISOString().slice(0, 10)} تنتظر التصنيف`
          : 'لا منشورات تنتظر التصنيف',
      };
    }

    if (settings.dailyCap > 0) {
      const used = await analyzedToday();
      if (used >= settings.dailyCap) {
        return { swept: false, reason: `بُلغ سقف اليوم (${settings.dailyCap})` };
      }
      // الدفعة الأخيرة تُقصّ على ما بقي من السقف فلا تتجاوزه
      const room = settings.dailyCap - used;
      if (room < settings.autoBatch) settings.autoBatch = room;
    }

    /*
     * الفلاتر مفتوحة والنطاق كامل.
     *
     * المكنسة ليست مستخدماً له نطاق حسابات: هي النظام يصنّف ما في قاعدته.
     * وحصرُها بنطاقٍ ما يترك حسابات بلا تصنيف إلى الأبد — لا أحد سيمرّ
     * عليها، لأن المرور هو ما ألغيناه.
     *
     * و`range: 'all'` لأن الحصر الزمني ليس من شأن `PostFilters`: تلك
     * تُرشِّح بتاريخ النشر في المنصة، والمطلوب هنا تاريخ الاستيراد عندنا.
     * فيُمرَّر `createdSince` مستقلّاً، وتبقى الفلاتر مفتوحة.
     */
    const result = await createAnalysisRun({
      filters: postFiltersSchema.parse({ range: 'all' }),
      scope: null,
      reanalyze: false,
      limit: settings.autoBatch,
      requestedById: null,
      trigger: 'AUTO',
      createdSince: since,
    });

    return { swept: true, runId: result.run.id, total: result.run.total, pending };
  } catch (error) {
    /*
     * «جولة قائمة» و«لا منشورات» ليستا خطأً بل حالتين عاديتين في مكنسة
     * تعمل كل خمس دقائق. وطباعتهما في السجلّ كل دورة تُغرقه بما لا يُقرأ،
     * فيضيع فيه العطب الحقيقي حين يقع.
     */
    if (error instanceof AnalysisRunError) {
      return { swept: false, reason: error.message };
    }
    console.error(
      '[auto-analysis] تعثّرت دورة المكنسة:',
      error instanceof Error ? error.message : error,
    );
    return { swept: false, reason: 'خطأ غير متوقّع' };
  }
}

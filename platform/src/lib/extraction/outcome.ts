/**
 * تصنيف نتيجة عملية الاستخراج.
 *
 * قاعدة خالصة بلا قاعدة بيانات ولا طابور ولا شبكة، في وحدة مستقلة عن
 * `service.ts` عمداً: هي أهم قرار يراه المستخدم في الجدول، ويجب أن
 * تُفحص وحدها دون تشغيل المنظومة كلها.
 */

export interface RunOutcomeInput {
  fetched: number;
  saved: number;
  updated: number;
  failed: number;
  firstReason: string | null;
}

/**
 * تصنيف نتيجة التشغيل بما خُزّن فعلاً لا بمجرد بلوغ نهايته.
 *
 * كان كل تشغيل يصل إلى آخره يُسمّى «ناجحة» ولو رُفض كل عنصر أعاده
 * الـ Actor، فيرى المستخدم صفّاً أخضر وصفراً في خانة «حفظ» ولا يدري أين
 * الخلل: أفي رابط الحساب أم في الـ Actor أم في النطاق الزمني. والحالة
 * التي تحتاج انتباهاً يجب أن تبدو كذلك.
 *
 * والتفريق بين حالتَي «لم يُحفظ شيء» مقصود: رفضُ كل ما وصل خلل يُبحث عن
 * سببه، أما وصولُ عناصر سليمة كلها خارج النطاق المطلوب فليس خللاً بل
 * نطاقاً ضيّقاً — ولكلٍّ رسالته وإجراؤه.
 */
export function classifyRunOutcome(input: RunOutcomeInput): {
  status: 'SUCCEEDED' | 'FAILED' | 'NO_RESULTS';
  message: string | null;
} {
  if (input.saved > 0 || input.updated > 0) return { status: 'SUCCEEDED', message: null };

  if (input.failed > 0) {
    const reason = input.firstReason ? ` ${input.firstReason}.` : '';
    return {
      status: 'FAILED',
      message:
        `وصل ${input.fetched} عنصراً من الـ Actor ورُفضت كلها فلم يُحفظ شيء.${reason}` +
        ' راجع «عيّنة من مخرجات الـ Actor» أسفل هذه الصفحة لترى ما أعاده بالضبط.',
    };
  }

  return {
    status: 'NO_RESULTS',
    message:
      `وصل ${input.fetched} عنصراً ولم يقع منها شيء داخل النطاق الزمني المطلوب —` +
      ' وسّع النطاق وأعد المحاولة.',
  };
}

/*
 * صياغة كتلة التعلّم — دوال نقيّة بلا قاعدة بيانات.
 *
 * فُصلت عن `learning.ts` لتُفحَص وحدها: القيد الذي يمنع الأمثلة من إلغاء
 * القواعد قيدٌ نصّي، يحفظه ترتيبُ الكتلة لا نوعٌ في TypeScript. فلو
 * انقلب الترتيب يوماً أو حُذفت جملة الحصانة في إعادة صياغة، لما اشتكى
 * `tsc` ولا فشل البناء. ووحدةٌ بلا استيراد خادمي تُشغَّل في فحص مستقل.
 */

export interface CorrectionExample {
  excerpt: string;
  stance: string | null;
  sentiment: string | null;
  riskFlags: string[];
  note: string | null;
  similarity: number;
}

const SCOPE_LABEL: Record<string, string> = {
  STANCE: 'الموقف',
  SENTIMENT: 'المشاعر',
  RISK: 'إشارات المحتوى الضارّ',
  GENERAL: 'عام',
};

const STANCE_LABEL: Record<string, string> = {
  SUPPORTIVE: 'مؤيّد',
  OPPOSED: 'معارض',
  NEUTRAL: 'محايد',
  MIXED: 'مختلط',
  UNCLEAR: 'غير واضح',
};

/** صياغة التوجيهات والأمثلة كتلةً تُضاف إلى الدليل */
export function buildLearningBlock(
  guidance: { scope: string; instruction: string }[],
  examples: CorrectionExample[],
): string {
  if (guidance.length === 0 && examples.length === 0) return '';

  const parts: string[] = [];

  if (guidance.length > 0) {
    parts.push(
      `## توجيهات الإدارة

هذه قواعد أضافها مسؤولو المنصة، وتُطبَّق ما لم تخالف القواعد الأساسية أعلاه:

${guidance.map((g) => `- [${SCOPE_LABEL[g.scope] ?? g.scope}] ${g.instruction}`).join('\n')}`,
    );
  }

  if (examples.length > 0) {
    parts.push(
      `## أمثلة من مراجعات سابقة

منشورات مشابهة صحّح مراجعون بشريّون تصنيفها. استرشد بها في الحالات
المشابهة، ولا تنسخ منها ما يخالف القواعد الأساسية:

${examples
  .map((ex, i) => {
    const lines = [`مثال ${i + 1}: «${ex.excerpt.slice(0, 300)}»`];
    if (ex.stance) lines.push(`  الموقف الصحيح: ${STANCE_LABEL[ex.stance] ?? ex.stance}`);
    if (ex.riskFlags.length > 0) lines.push(`  إشارات: ${ex.riskFlags.join('، ')}`);
    else if (ex.stance) lines.push('  إشارات: لا شيء');
    if (ex.note) lines.push(`  تعليل المراجع: ${ex.note}`);
    return lines.join('\n');
  })
  .join('\n\n')}`,
    );
  }

  /*
   * جملة الحصانة تُكتب أخيراً قصداً.
   *
   * النماذج تتأثّر بآخر ما تقرأ قبل السؤال أكثر من أوّله. فالقيد الذي
   * يمنع الأمثلة من إلغاء القواعد يوضع بعدها لا قبلها.
   */
  parts.push(
    `★ تذكير: القواعد الأساسية في أعلى الدليل هي المرجع. لا يجوز لمثال أو
توجيه أن يجعل النقد السياسي محتوى ضارّاً، ولا أن يُلغي قاعدةً منصوصة.
إن تعارض مثال مع قاعدة أساسية، فالقاعدة أولى.`,
  );

  return parts.join('\n\n');
}

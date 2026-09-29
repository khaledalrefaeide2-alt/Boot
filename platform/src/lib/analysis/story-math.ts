/*
 * رياضيات تجميع الأحداث — بلا قاعدة ولا مزوّد.
 *
 * مفصولةٌ عن المكنسة عمداً: التجميع حسابٌ صامت نتيجتُه أرقامٌ تُقرأ في
 * شاشة بلا من يراجع كيف خرجت، فخطؤه لا يظهر خطأً بل يظهر رقماً معقولاً.
 * وهنا وحدها يمكن أن يُفحص بلا خادم ولا بيانات — دوالُّ خالصة تأخذ
 * أرقاماً وتُعيد أرقاماً.
 */

export interface StoryCandidate {
  id: string;
  centroid: number[];
  members: number;
  firstPostAt: Date;
  lastPostAt: Date;
}

/**
 * توحيد طول المتّجه.
 *
 * متّجهات المزوّد مُوحَّدة الطول أصلاً، فجيب التمام بينها ضربُ نقطة. أمّا
 * متوسّط عدّة متّجهات فليس مُوحَّداً، فيُعاد توحيده بعد كلّ ضمّ — وإلا
 * صارت المقارنة التالية تقيس الطول مع الاتجاه، فتُفضّل العناقيد الكبيرة
 * على المتشابهة.
 *
 * دالّة خالصة — تُفحص وحدها.
 */
export function normalizeVector(vector: number[]): number[] {
  let sum = 0;
  for (const value of vector) sum += value * value;
  const norm = Math.sqrt(sum);
  if (!Number.isFinite(norm) || norm === 0) return [];
  return vector.map((value) => value / norm);
}

/**
 * جيب التمام بين متّجهين مُوحَّدَي الطول — ضربُ نقطة لا غير.
 *
 * والطولان يُقارَنان أوّلاً: متّجهان بطولين مختلفين ليسا «أقلّ تشابهاً»
 * بل غير قابلين للمقارنة، والجواب صفرٌ لا رقمٌ محسوب على ما تقاطع منهما.
 *
 * دالّة خالصة — تُفحص وحدها.
 */
export function similarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let total = 0;
  for (let index = 0; index < a.length; index += 1) total += a[index]! * b[index]!;
  return total;
}

/**
 * ضمّ متّجه إلى مركز عنقود.
 *
 * متوسّطٌ مرجّح بعدد الأعضاء ثم إعادة توحيد. وإعادة التوحيد في كلّ خطوة
 * تجعل المركز تقريباً للمتوسّط لا متوسّطاً تامّاً — وهو مقصود: البديل
 * حفظُ مجموعٍ غير مُوحَّد يكبر بلا حدّ، أو قراءةُ متّجهات الأعضاء كلّهم
 * في كلّ ضمّ.
 *
 * دالّة خالصة — تُفحص وحدها.
 */
export function mergeCentroid(
  centroid: number[],
  members: number,
  vector: number[],
): number[] {
  if (centroid.length !== vector.length || members < 1) return normalizeVector(vector);
  const merged = new Array<number>(centroid.length);
  for (let index = 0; index < centroid.length; index += 1) {
    merged[index] = (centroid[index]! * members + vector[index]!) / (members + 1);
  }
  return normalizeVector(merged);
}

/**
 * أقرب عنقود إلى المنشور — إن بلغ العتبة وكان في النافذة.
 *
 * ولا يُكتفى بالأقرب: الأقرب موجودٌ دائماً، والعتبة هي التي تقول إن كان
 * قريباً بما يكفي. وبلا عتبة يدخل كلّ منشور في عنقود، ويصير «الحدث»
 * اسماً آخر لـ«المنشور».
 *
 * دالّة خالصة — تُفحص وحدها.
 */
export function pickStory(
  vector: number[],
  publishedAt: Date,
  candidates: StoryCandidate[],
  threshold: number,
  windowMs: number,
): { candidate: StoryCandidate; score: number } | null {
  let best: { candidate: StoryCandidate; score: number } | null = null;
  const at = publishedAt.getTime();

  for (const candidate of candidates) {
    // النافذة تُفحص قبل الحساب: أرخص من ألفٍ وخمسمئة عملية ضرب
    if (at < candidate.firstPostAt.getTime() - windowMs) continue;
    if (at > candidate.lastPostAt.getTime() + windowMs) continue;

    const score = similarity(vector, candidate.centroid);
    if (score < threshold) continue;
    if (!best || score > best.score) best = { candidate, score };
  }

  return best;
}


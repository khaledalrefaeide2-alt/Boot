/**
 * تقطيع المدى الطويل إلى نوافذ.
 *
 * تشغيلةٌ واحدة لا تستطيع أن تغطّي سنوات: سقف العناصر لكل تشغيلة ألف،
 * والمشغّل يُرجع الأحدث فالأحدث، فطلبُ خمس سنوات بسقف ألف يُرجع أحدث ألف
 * عنصر ويترك الباقي — ولا يظهر النقص في أي عدّاد، لأن ما لم يُجلب لا أثر له.
 *
 * فالمدى يُقطَّع نوافذَ قصيرة، ولكلّ نافذة تشغيلةٌ بسقفها. والنافذة القصيرة
 * تحوي من المنشورات ما هو دون السقف عادةً، فلا يُقتطع منها شيء.
 *
 * والترتيب من الأحدث إلى الأقدم: من أوقف الاستخراج في منتصفه يكون قد ربح
 * أقرب السنوات إليه لا أبعدها عنه.
 */

export interface Chunk {
  /** ترتيب المقطع — يبدأ من ١ */
  seq: number;
  /** بداية النافذة YYYY-MM-DD — شاملة */
  from: string;
  /** نهاية النافذة YYYY-MM-DD — شاملة */
  to: string;
}

/*
 * سقف عدد المقاطع.
 *
 * لا يوجد ليمنع مدىً طويلاً، بل ليمنع مدىً مكتوباً بالخطأ: سنةٌ زيادة في
 * خانة التاريخ تصير آلاف التشغيلات وفاتورةً بقدرها. وأربعمئة مقطع بنافذة
 * شهر تغطّي ثلاثاً وثلاثين سنة — وهو أبعد ممّا تحفظه أي منصة.
 */
export const MAX_CHUNKS = 400;
export const MIN_CHUNK_DAYS = 1;
export const MAX_CHUNK_DAYS = 90;

export class ChunkPlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChunkPlanError';
  }
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function toUtcDate(value: string, label: string): Date {
  if (!DATE_PATTERN.test(value)) {
    throw new ChunkPlanError(`${label} بصيغة غير صحيحة — المطلوب YYYY-MM-DD`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new ChunkPlanError(`${label} تاريخ غير صالح`);
  return date;
}

function format(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/** عدد الأيام بين تاريخين — شاملاً الطرفين */
export function inclusiveDays(from: string, to: string): number {
  const start = toUtcDate(from, 'تاريخ البداية');
  const end = toUtcDate(to, 'تاريخ النهاية');
  return Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
}

/**
 * خطة التقطيع كاملةً — تُحسب قبل إنشاء أي تشغيلة.
 *
 * تُستدعى في الخادم لإنشاء المقاطع، وفي الواجهة لعرض عددها وسقف عناصرها
 * قبل الضغط على زرّ يُنفق حصةً مدفوعة.
 */
export function planChunks(from: string, to: string, chunkDays: number): Chunk[] {
  if (!Number.isInteger(chunkDays) || chunkDays < MIN_CHUNK_DAYS || chunkDays > MAX_CHUNK_DAYS) {
    throw new ChunkPlanError(`طول النافذة بين ${MIN_CHUNK_DAYS} و${MAX_CHUNK_DAYS} يوماً`);
  }

  const start = toUtcDate(from, 'تاريخ البداية');
  const end = toUtcDate(to, 'تاريخ النهاية');
  if (start > end) throw new ChunkPlanError('تاريخ البداية بعد تاريخ النهاية');

  const total = Math.ceil(inclusiveDays(from, to) / chunkDays);
  if (total > MAX_CHUNKS) {
    throw new ChunkPlanError(
      `المدى يحتاج ${total} مقطعاً والحدّ ${MAX_CHUNKS} — وسّع طول النافذة أو اقسم المدى`,
    );
  }

  const chunks: Chunk[] = [];
  let windowEnd = end;
  let seq = 1;

  while (windowEnd >= start) {
    const raw = addDays(windowEnd, -(chunkDays - 1));
    const windowStart = raw < start ? start : raw;
    chunks.push({ seq, from: format(windowStart), to: format(windowEnd) });
    seq += 1;
    windowEnd = addDays(windowStart, -1);
  }

  return chunks;
}

/** سقف العناصر الذي قد تستهلكه الخطة كاملةً — أعلى تقدير لا توقّعاً */
export function ceilingItems(chunkCount: number, maxItemsPerChunk: number): number {
  return chunkCount * maxItemsPerChunk;
}

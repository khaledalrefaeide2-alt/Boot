import 'server-only';
import { cache } from 'react';
import { prisma } from '@/lib/db';

/** قيم الإعدادات الافتراضية إذا لم تُعرَّف في القاعدة */
const DEFAULTS: Record<string, unknown> = {
  'app.name': 'منصة رصد وتحليل المنصات الإعلامية',
  'app.organization': '',
  'data.retentionDays': 365,
  'extraction.defaultMaxItems': 100,
  'extraction.defaultWindowDays': 30,
  'extraction.hourlyLimit': 0,
  'extraction.excludeReplies': true,
  'alerts.highEngagementThreshold': 1000,
  'alerts.negativeSentimentRatio': 0.4,
};

/** قراءة كل الإعدادات دفعة واحدة — مُخزّنة على مستوى الطلب */
export const getAllSettings = cache(async (): Promise<Record<string, unknown>> => {
  try {
    const rows = await prisma.setting.findMany({ select: { key: true, value: true } });
    const map: Record<string, unknown> = { ...DEFAULTS };
    for (const row of rows) map[row.key] = row.value;
    return map;
  } catch {
    return { ...DEFAULTS };
  }
});

/** قراءة إعداد واحد بنوع محدد */
export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const settings = await getAllSettings();
  const value = settings[key];
  return (value === undefined || value === null ? fallback : value) as T;
}

/** اسم المنصة المعروض في الترويسة والتقارير */
export async function getAppName(): Promise<string> {
  return getSetting('app.name', 'منصة رصد وتحليل المنصات الإعلامية');
}

/** الإعدادات التي يحتاجها منطق الاستخراج والتنبيهات */
export async function getOperationalSettings() {
  const settings = await getAllSettings();
  return {
    defaultMaxItems: Number(settings['extraction.defaultMaxItems'] ?? 100),
    defaultWindowDays: Number(settings['extraction.defaultWindowDays'] ?? 30),
    highEngagementThreshold: Number(settings['alerts.highEngagementThreshold'] ?? 1000),
    negativeSentimentRatio: Number(settings['alerts.negativeSentimentRatio'] ?? 0.4),
    retentionDays: Number(settings['data.retentionDays'] ?? 365),
    organization: String(settings['app.organization'] ?? ''),
    appName: String(settings['app.name'] ?? 'منصة رصد وتحليل المنصات الإعلامية'),
  };
}

/**
 * سقف عمليات الاستخراج في الساعة للمستخدم الواحد — و0 تعني بلا سقف.
 *
 * كان رقماً ثابتاً في الشيفرة، فكان تغييره يستلزم نشراً جديداً. وهو قرار
 * تشغيلي لا هندسي: من يرصد أربعين حساباً يحتاج أربعين عملية في الجلسة
 * الواحدة، ومن يرصد خمسة لا يحتاج ذلك. فصار إعداداً يُضبط من شاشة
 * الإعدادات ويسري فوراً.
 *
 * والافتراضي «بلا سقف» لأن هذه منصة داخلية يُدير مستخدميها المسؤول نفسه:
 * الحاجز الفعلي على الإنفاق هو سقف المنشورات في كل تشغيل — وهو إلزامي
 * ويُمرَّر إلى المزوّد — لا عدد العمليات.
 */
export async function getExtractionHourlyLimit(): Promise<number> {
  const raw = await getSetting<unknown>('extraction.hourlyLimit', 0);
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value);
}

/**
 * هل تُستبعد الردود من استخراج إكس؟
 *
 * افتراضه صحيح: الحساب المرصود يردّ على متابعيه عشرات المرات يومياً،
 * وتلك محادثات لا مواقف تُحلَّل. ومن يحتاج سلاسل التغريدات كاملة يُعطّله
 * — فإكس يعدّ متابعة السلسلة ردّاً، فتسقط معها.
 */
export async function getExcludeReplies(): Promise<boolean> {
  const raw = await getSetting<unknown>('extraction.excludeReplies', true);
  if (typeof raw === 'boolean') return raw;
  if (raw === 'false' || raw === 0) return false;
  return true;
}

/**
 * إعدادات التصنيف التلقائي.
 *
 * التصنيف يجري من تلقاء نفسه على ما يصل من منشورات — لا ينتظر أحداً
 * يفتح شاشة ويضغط زرّاً. والمكنسة تعمل في العامل الخلفي وتلتقط كل منشور
 * بلا تصنيف: الجديد الوارد، والمتراكم القديم، وما أخفق في جولة سابقة.
 *
 * والسقف اليومي ليس تحفّظاً على الأتمتة بل شرطُ أن تكون آمنة: كلّ منشور
 * استدعاءٌ مدفوع، وحسابٌ واحد يُضاف بخطأ وينشر ألفاً في اليوم يصير فاتورةً
 * لا أحد طلبها. والسقف يوقف المكنسة ولا يوقف التشغيل اليدوي، فيبقى
 * لصاحب المنصة أن يتجاوزه بقصد.
 *
 * و`startDate` تاريخُ بدءٍ: لا تُصنَّف المكنسةُ ما استُخرج قبله. وافتراضه
 * اليوم **فارغ** — بلا حدّ — وهذا تحوّلٌ عن قيمةٍ سابقة يستحقّ أن يُفسَّر.
 *
 * ★ الجدار كان علاجَ عَرَضٍ لا علّة.
 *
 *   وُضع يوم كانت الجولة تبدأ بأقدم منشورٍ في القاعدة. فبلا جدارٍ تُصرف
 *   دفعاتُ اليوم كلّها على أرشيفٍ لا ينظر إليه أحد، ولا تبلغ منشورَ
 *   الصباح أبداً — وصاحب المنصة يفتح لوحته فيجد اليوم كلّه «غير محسوم».
 *
 *   والعلّة عولجت في موضعها: الجولة تبدأ بالأحدث (`orderBy: id desc` في
 *   `executeAnalysisRun`)، فمنشورُ هذه الساعة أوّلُ ما يُصنَّف مهما كان
 *   خلفه، ويتبعه المتراكم نزولاً. وبهذا لم يبقَ للجدار إلا أثرُه الجانبي:
 *   كلّ ما استُخرج قبل التاريخ لا يُصنَّف أبداً ولا شيء يقول كم.
 *
 *   فصار فارغاً: كلّ منشورٍ مستخرَج يُصنَّف، والأحدث أوّلاً. ومن أراد
 *   الجدار — لقاعدةٍ ضخمةٍ لا يعنيه قديمها — يكتب التاريخ من شاشة
 *   الإعدادات، ويبقى الترتيب يحمي وارد اليوم في الحالين.
 *
 * والقياس `createdAt` (لحظة الاستيراد) لا `publishedAt` (لحظة النشر في
 * المنصة): المنشور الذي نُشر قبل شهر واستُخرج اليوم يدخل — وهو المقصود
 * بـ«المستخرج بعد هذا التاريخ».
 */
/**
 * قراءة تاريخ البدء من الإعدادات.
 *
 * ★ والمشوَّه يُقرأ «بلا حدّ» لا `Invalid Date`.
 *
 *   `new Date('غداً')` لا يرمي، و`createdAt: { gte: Invalid Date }` يمرّ
 *   إلى Postgres فيرفضه، أو — أسوأ — يُقرأ شرطاً لا يطابق شيئاً فتتوقّف
 *   المكنسة عن التصنيف كلّه بصمت. والسقوط إلى «بلا حدّ» يُصنّف أكثر
 *   ممّا طُلب، وهو أهون من التوقّف الصامت.
 *
 * ويُثبَّت على بداية اليوم: من كتب `2026-09-30` يقصد يومه كلّه لا لحظة
 * منتصف ليله، وما استُخرج ذلك اليوم قبل أن يكتبه يجب أن يدخل.
 */
function parseStartDate(raw: unknown): Date | null {
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  if (text === '') return null;

  const parsed = new Date(text);
  if (!Number.isFinite(parsed.getTime())) return null;

  parsed.setHours(0, 0, 0, 0);
  return parsed;
}

export async function getAnalysisSettings(): Promise<{
  auto: boolean;
  autoBatch: number;
  dailyCap: number;
  /** أقدم لحظة استيراد تدخل التصنيف التلقائي — null تعني بلا حدّ */
  startDate: Date | null;
}> {
  const settings = await getAllSettings();

  const rawAuto = settings['analysis.auto'];
  const auto = rawAuto === undefined ? true : rawAuto !== false && rawAuto !== 'false' && rawAuto !== 0;

  const startDate = parseStartDate(settings['analysis.startDate']);

  const batch = Number(settings['analysis.autoBatch'] ?? 200);
  const cap = Number(settings['analysis.dailyCap'] ?? 10_000);

  return {
    auto,
    startDate,
    // حدّان صلبان حول ما يُقرأ من القاعدة: قيمةٌ مشوَّهة لا توقف العمل ولا تُطلقه
    autoBatch: Number.isFinite(batch) ? Math.min(2000, Math.max(1, Math.floor(batch))) : 200,
    dailyCap: Number.isFinite(cap) && cap > 0 ? Math.floor(cap) : 0,
  };
}

/**
 * إعدادات الفهرسة الدلالية.
 *
 * المساعد يقرأ نصوص المنشورات عبر المتّجهات وحدها، والمتّجه لا يُبنى إلا
 * بفهرسة. وكانت يدويةً لا يُشغّلها أحد، فبقي المساعد يرى الأرقام ولا
 * يقرأ نصّاً — ويجيب عن «أهمّ المنشورات» بأن لا بيانات.
 *
 * والسقف اليومي يُقاس بالمقاطع لا بالمنشورات: المنشور الطويل يُقطَّع
 * مقاطع، وكلّ مقطع استدعاء. وهو أعلى كثيراً من سقف التصنيف لأن نموذج
 * التضمين جزءٌ من ثمن نموذج المحادثة، والمقاطع تُرسَل دفعةً واحدة.
 */
export async function getIndexSettings(): Promise<{
  auto: boolean;
  batch: number;
  dailyCap: number;
}> {
  const settings = await getAllSettings();

  const rawAuto = settings['assistant.autoIndex'];
  const auto = rawAuto === undefined ? true : rawAuto !== false && rawAuto !== 'false' && rawAuto !== 0;

  const batch = Number(settings['assistant.indexBatch'] ?? 100);
  const cap = Number(settings['assistant.indexDailyCap'] ?? 50_000);

  return {
    auto,
    batch: Number.isFinite(batch) ? Math.min(500, Math.max(1, Math.floor(batch))) : 100,
    dailyCap: Number.isFinite(cap) && cap > 0 ? Math.floor(cap) : 0,
  };
}

/**
 * إعدادات حفظ صور المنشورات.
 *
 * ولا سقف يوميّ لها: الصور تُجلب من شبكات توزيع المنصات لا من مزوّد
 * مدفوع، فالحدّ الوحيد ألّا تبدو طلباتنا هجوماً — وهو ما يضبطه حجم الدفعة
 * والتوازي الرباعي في طبقة الجلب.
 *
 * و`maxAttempts` أهمّها: بدونه تعود المكنسة في كلّ دورة إلى عشرات الآلاف
 * من الروابط الميتة فلا تبلغ الحيّ منها أبداً.
 */
export async function getMediaSettings(): Promise<{
  auto: boolean;
  batch: number;
  maxAttempts: number;
}> {
  const settings = await getAllSettings();

  const rawAuto = settings['media.autoCache'];
  const auto =
    rawAuto === undefined ? true : rawAuto !== false && rawAuto !== 'false' && rawAuto !== 0;

  const batch = Number(settings['media.batch'] ?? 120);
  const attempts = Number(settings['media.maxAttempts'] ?? 4);

  return {
    auto,
    batch: Number.isFinite(batch) ? Math.min(600, Math.max(10, Math.floor(batch))) : 120,
    maxAttempts: Number.isFinite(attempts) ? Math.min(10, Math.max(1, Math.floor(attempts))) : 4,
  };
}

/**
 * إعدادات تجميع الأحداث.
 *
 * التجميع يقرأ المتّجهات ولا يُنشئ غيرها، فلا سقف يومي له: ليس فيه نداءٌ
 * على المزوّد يُحسب. والحدّ الوحيد حجم الدفعة — وهو حدّ ذاكرةٍ وزمنِ
 * دورة لا حدّ كلفة.
 *
 * والعتبة تُقصّ إلى مداها هنا وفي المكنسة معاً: قيمةٌ خاطئة في الإعدادات
 * — صفرٌ مثلاً — تجعل كلّ منشورٍ عضواً في أوّل عنقود يُقارَن به.
 */
export async function getStorySettings(): Promise<{
  auto: boolean;
  batch: number;
  threshold: number;
  windowDays: number;
}> {
  const settings = await getAllSettings();

  const rawAuto = settings['stories.auto'];
  const auto =
    rawAuto === undefined ? true : rawAuto !== false && rawAuto !== 'false' && rawAuto !== 0;

  const batch = Number(settings['stories.batch'] ?? 200);
  const threshold = Number(settings['stories.threshold'] ?? 0.72);
  const windowDays = Number(settings['stories.windowDays'] ?? 3);

  return {
    auto,
    batch: Number.isFinite(batch) ? Math.min(1000, Math.max(10, Math.floor(batch))) : 200,
    threshold: Number.isFinite(threshold) ? Math.min(0.95, Math.max(0.5, threshold)) : 0.72,
    windowDays: Number.isFinite(windowDays)
      ? Math.min(30, Math.max(1, Math.floor(windowDays)))
      : 3,
  };
}

/**
 * هل يبحث المساعد في الويب؟
 *
 * يُمرَّر إلى OpenAI أداةَ بحثٍ مدمجة، فيصير المساعد قادراً على جلب ما
 * لا يملكه: خبرٌ وقع اليوم، أو سياقُ حدثٍ خارج منصّتك، أو مرجعٌ تُبنى
 * عليه توصية.
 *
 * ★ ولا يمسّ ذلك قاعدة الأرقام. أرقام هذه المنصة تبقى من قاعدتها وحدها،
 *   والويب لا يُستشار فيها أبداً: رقمٌ عن منشوراتك جاء من مقالٍ على
 *   الإنترنت ليس تقريباً بل اختلاقاً بمصدر.
 *
 * والبحث يُكلّف فوق كلفة الرسالة، فيُطفأ لمن لا يحتاجه.
 */
export async function getWebSearchEnabled(): Promise<boolean> {
  const raw = await getSetting<unknown>('assistant.webSearch', true);
  if (typeof raw === 'boolean') return raw;
  if (raw === 'false' || raw === 0) return false;
  return true;
}

/**
 * هل يستعلم المساعد من القاعدة بنفسه؟
 *
 * بدونه يقرأ ملخّصاً جاهزاً عن نافذة ثابتة يختارها المستخدم من قائمة،
 * فلا يجيب عمّا خرج عنها: «قارن حسابين في شهرين»، «منشورات حساب بعينه
 * عن الكهرباء»، «كيف تغيّر بين الربعين». وبه يحدّد المدى ويرشّح ويجمّع
 * ويقرأ النصّ كاملاً — وهو الفرق بين من يقرأ تقريراً ومن يجلس إلى
 * القاعدة.
 *
 * والأدوات قراءةٌ فقط، ونطاق حسابات صاحب الجلسة مفروضٌ عليها في الخادم.
 *
 * وإطفاؤه يُعيد المسار السابق كاملاً: ملخّصٌ جاهز واستدعاءٌ واحد. وهو
 * أرخص وأسرع، وأعجزُ عن كل سؤال خارج النافذة.
 */
export async function getAgentEnabled(): Promise<boolean> {
  const raw = await getSetting<unknown>('assistant.agent', true);
  if (typeof raw === 'boolean') return raw;
  if (raw === 'false' || raw === 0) return false;
  return true;
}

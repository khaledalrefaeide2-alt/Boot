import 'server-only';
import type { EntityType, Prisma } from '@/generated/prisma';
import { normalizeArabic } from './text';

/*
 * الكيانات المذكورة في المنشورات.
 *
 * التصنيف يقول «سلبيّ تجاه الخدمات»، ولا يقول عمّن قيل. وسؤالٌ مثل «ما
 * قيل عن وزارة الكهرباء هذا الشهر» لا يُجاب عنه ببحثٍ نصّي: الاسم يرد
 * بصيغ لا تُحصى — بالهمزة وبلا همزة، بالتاء المربوطة وبالهاء، بالمنصب
 * وبالاسم — فالبحث عن صورةٍ واحدة يُسقط الباقي بلا أن يقول إنه أسقطه.
 *
 * فيُستخرج الكيان مرّةً عند التحليل، ويُجمَع على مفتاحٍ موحَّد، ويُربط
 * بالمنشور. وبعدها يصير السؤال عدّاً لا بحثاً.
 *
 * ★ ثلاثة قيود تحكم هذا الملف:
 *
 * ١) لا يُخترع كيان. ما يعيده النموذج يُطابَق بنصّ المنشور، وما لم يظهر
 *    فيه يُسقَط. ونموذجٌ يضيف «وزارة الكهرباء» إلى منشورٍ لم يذكرها
 *    يُنشئ رقماً يقرأه مسؤولٌ بوصفه حقيقة.
 *
 * ٢) التطبيع للمطابقة لا للعرض. المفتاح مطبَّع ليجمع الصور، والاسم
 *    المعروض يبقى كما ورد — وإلا رأى القارئ «وزاره الكهرباء».
 *
 * ٣) لا عدّاد مخزَّن. العدد يُحسب بالاستعلام ضمن نطاق القارئ ونافذته،
 *    فلا ينحرف بإعادة التحليل ولا يُظهر لصاحب النطاق المحدود رقم
 *    المنصّة كلّها.
 */

/** أقصى ما يُقبل من كيانات في المنشور الواحد — يطابق ما تطلبه السياسة */
export const MAX_ENTITIES = 10;

/** أقصر مفتاح مقبول — ما دونه حرفٌ أو حرفان لا يدلّان على كيان */
const MIN_KEY_LENGTH = 3;

/** أطول اسم مقبول — ما زاد جملةٌ اقتُطعت لا اسمُ علم */
const MAX_NAME_LENGTH = 80;

/**
 * إشاراتٌ عامّة لا كيانات.
 *
 * النموذج يعيدها كثيراً لأنها تبدو مؤسسات، وهي في الحقيقة أسماء أجناس:
 * «الحكومة» في منشورٍ من حلب و«الحكومة» في منشورٍ من درعا ليستا الشيء
 * نفسه بالضرورة، وجمعهما تحت كيانٍ واحد يصنع أكبر كيان في الجدول ولا
 * يقول شيئاً. والجهة المقصودة — إن حُدِّدت — يحملها حقل `target`.
 */
const GENERIC = new Set(
  [
    'الحكومة',
    'الدولة',
    'الوزارة',
    'البلدية',
    'المحافظة',
    'المديرية',
    'الجهات المعنية',
    'الجهات المختصة',
    'المسؤولون',
    'المسؤولين',
    'المواطنون',
    'المواطنين',
    'الناس',
    'الشعب',
    'الأهالي',
    'السلطات',
    'الشركة',
  ].map(entityKey),
);

export interface CleanEntity {
  /** الاسم كما ورد في المنشور — للعرض */
  name: string;
  /** الشكل المطبَّع — عليه يقع الدمج */
  key: string;
  type: EntityType;
}

/**
 * مفتاح الدمج.
 *
 * `normalizeArabic` يوحّد التشكيل والهمزات والتاء المربوطة، ويبقى إسقاط
 * الترقيم وتوحيد المسافات: الاسم يرد بين قوسين أو متبوعاً بفاصلة أو
 * موزّعاً على سطرين، وكلّها صورةٌ واحدة يجب أن تعطي مفتاحاً واحداً.
 *
 * دالّة خالصة — تُفحص وحدها.
 */
export function entityKey(name: string): string {
  return normalizeArabic(name)
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * هل ورد الاسم في النصّ فعلاً؟
 *
 * المطابقة على الشكل المطبَّع لا الحرفيّ — بخلاف مقتطف الدليل.
 *
 *   الفرق مقصود: الدليل يُعرض بين قوسين اقتباساً، فيجب أن يكون حرفاً
 *   بحرف وإلا نُسب إلى الكاتب ما لم يكتبه. والكيان مفتاحُ مطابقةٍ لا
 *   اقتباس، والتطبيع هو عمله أصلاً — فردُّ «الأسد» لأن النصّ كتبها
 *   «الاسد» يُسقط كياناً صحيحاً بلا فائدة لأحد.
 *
 * دالّة خالصة — تُفحص وحدها.
 */
export function mentionAppearsIn(text: string, name: string): boolean {
  const needle = entityKey(name);
  if (needle.length < MIN_KEY_LENGTH) return false;
  return entityKey(text).includes(needle);
}

/**
 * تنقية ما أعاده النموذج.
 *
 * `text` نصّ المنشور حين يوجد، و`null` حين يكون التصنيف من صورة: لا نصّ
 * عندها يُطابَق به، فتُقبل الأسماء بلا مطابقة ويبقى الباقي من القيود.
 *
 * دالّة خالصة — تُفحص وحدها.
 */
export function cleanEntities(
  raw: { name: string; type: EntityType }[] | undefined | null,
  text: string | null,
): CleanEntity[] {
  if (!Array.isArray(raw)) return [];

  const seen = new Set<string>();
  const out: CleanEntity[] = [];

  for (const item of raw) {
    if (out.length >= MAX_ENTITIES) break;
    if (!item || typeof item.name !== 'string') continue;

    const name = item.name.trim().replace(/\s+/g, ' ');
    if (name.length === 0 || name.length > MAX_NAME_LENGTH) continue;

    const key = entityKey(name);
    if (key.length < MIN_KEY_LENGTH) continue;
    if (GENERIC.has(key)) continue;
    // اسمٌ كلّه أرقام ليس كياناً — تاريخٌ أو مبلغٌ التقطه النموذج
    if (/^[\p{N}\s]+$/u.test(key)) continue;
    if (seen.has(key)) continue;
    if (text !== null && !mentionAppearsIn(text, name)) continue;

    seen.add(key);
    out.push({ name, key, type: item.type ?? 'OTHER' });
  }

  return out;
}

/**
 * ربط المنشور بكياناته داخل معاملة التحليل نفسها.
 *
 * ★ الروابط تُستبدل ولا تُضاف.
 *
 *   إعادة التحليل جزءٌ من تشغيل هذه المنصة: تتغيّر السياسة فيُعاد تحليل
 *   ما سبق. ولو أُضيفت الروابط فوق سابقتها لبقي كيانٌ سقط من النتيجة
 *   الجديدة مربوطاً بالمنشور إلى الأبد، ولظهر في عدّاده منشورٌ لم يعد
 *   النموذج يرى فيه ذكراً له — وهو خطأٌ لا يُكتشف لأن الرقم يبدو سليماً.
 *
 * ويُمرَّر `tx` لا `prisma`: الكتابة جزءٌ من معاملة حفظ التحليل، فإمّا أن
 * يُحفظ التصنيف وروابطه معاً أو لا يُحفظ شيء.
 */
export async function linkEntities(
  tx: Prisma.TransactionClient,
  postId: string,
  entities: CleanEntity[],
): Promise<number> {
  if (entities.length === 0) {
    await tx.postEntity.deleteMany({ where: { postId } });
    return 0;
  }

  const now = new Date();
  const ids: string[] = [];

  /*
   * الإدراج واحداً واحداً لأن المعرّف يُولَّد في الشيفرة لا في القاعدة،
   * فلا سبيل إلى معرفته قبل الكتابة. والعدد عشرةٌ على الأكثر، وكلّها
   * استعلامات على فهرس فريد — والنداء على المزوّد قبلها أغلى منها مجتمعة.
   *
   * و`update` لا يمسّ الاسم ولا النوع: أوّل صورة وردت هي المعروضة، وإلا
   * تبدّل اسم الكيان في كلّ صفحةٍ يفتحها الموظّف بحسب آخر منشور حُلِّل.
   */
  for (const entity of entities) {
    const row = await tx.entity.upsert({
      where: { key: entity.key },
      create: { key: entity.key, name: entity.name, type: entity.type },
      update: { lastSeenAt: now },
      select: { id: true },
    });
    ids.push(row.id);
  }

  await tx.postEntity.deleteMany({ where: { postId, entityId: { notIn: ids } } });
  await tx.postEntity.createMany({
    data: entities.map((entity, index) => ({
      postId,
      entityId: ids[index]!,
      mention: entity.name,
    })),
    skipDuplicates: true,
  });

  return ids.length;
}

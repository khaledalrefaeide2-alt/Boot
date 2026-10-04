import 'server-only';
import type { Prisma } from '@/generated/prisma';
import type { PostFilters } from '@/lib/validation/posts';
import { resolveDateRange } from '@/lib/validation/common';
import { intersectScope, type AccountScope } from '@/lib/auth/account-scope';
import { parseSearchTerms } from '@/lib/domain/search-terms';
import { normalizeForSearch } from '@/lib/analysis/text';

/** تحويل قيمة قد تكون نصاً أو مصفوفة إلى مصفوفة نظيفة */
function toArray(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return (Array.isArray(value) ? value : [value]).filter(Boolean);
}

/**
 * بناء شرط Prisma الموحّد من فلاتر المنشورات.
 * يُستخدم في العرض والإحصاءات والتصدير معاً، فلا تختلف النتائج بينها.
 *
 * `scope` إلزامي لا اختياري: هو الحاجز الذي يمنع مستخدماً مقيّداً من رؤية
 * بيانات حساب خارج نطاقه. لو كان اختيارياً لصار كل موضع استدعاء منسيّ
 * تسريباً صامتاً؛ وبكونه إلزامياً يصير خطأ تصريف يظهر قبل التشغيل.
 */
export function buildPostWhere(
  filters: PostFilters,
  scope: AccountScope,
): Prisma.PostWhereInput {
  const { from, to } = resolveDateRange({
    range: filters.range,
    from: filters.from,
    to: filters.to,
  });

  const platformIds = toArray(filters.platformId);
  // الحصر على تقاطع ما طُلب مع ما هو مسموح، فلا يُتجاوز النطاق بمعامل طلب
  const accountIds = intersectScope(scope, toArray(filters.accountId));

  const where: Prisma.PostWhereInput = {
    ...(filters.includeHidden === 'true' ? {} : { isHidden: false }),
    ...(platformIds.length === 1 ? { platformId: platformIds[0] } : {}),
    ...(platformIds.length > 1 ? { platformId: { in: platformIds } } : {}),
    ...(accountIds === null ? {} : { accountId: { in: accountIds } }),
    ...(filters.postType ? { postType: filters.postType } : {}),
    ...(filters.language ? { language: filters.language } : {}),
    ...(filters.topicId ? { topicId: filters.topicId } : {}),
    ...(filters.sentiment ? { sentiment: filters.sentiment } : {}),
    ...(filters.country ? { country: { contains: filters.country, mode: 'insensitive' } } : {}),
    ...(filters.hashtag ? { hashtags: { has: filters.hashtag.replace(/^#/, '') } } : {}),
    ...(filters.keywordId ? { keywordLinks: { some: { keywordId: filters.keywordId } } } : {}),
    /*
     * فلتر الكيان يمرّ عبر جدول الربط كالكلمة المفتاحية.
     *
     * والفرق أنّ الكلمة تُطابَق نصّياً والكيان يُستخرَج بالنموذج: «وزارة
     * الكهرباء» تظهر هنا وإن كتبها المنشور «وزارة الكهربا» — لأن الربط
     * وقع على مفتاح موحَّد لا على صورة الكلمة.
     */
    ...(filters.entityId ? { postEntities: { some: { entityId: filters.entityId } } } : {}),
    // الحدث حقلٌ على المنشور نفسه — الإسناد وقع مرّةً عند التجميع
    ...(filters.storyId ? { storyId: filters.storyId } : {}),
    /*
     * فلتر المجموعة يمرّ عبر الحساب لا عبر المنشور.
     *
     * المنشور لا يحمل مجموعة — المجموعة صفة الحساب الذي نشره. وربطها
     * بالحساب لا بنسخ القيمة إلى المنشور مقصود: نقل حساب من «وزارات» إلى
     * «محافظات» يجب أن ينقل تاريخه كله معه، ولو كانت القيمة منسوخة في كل
     * منشور لبقيت آلاف المنشورات على التصنيف القديم بلا من يصحّحها.
     *
     * والتكلفة مقبولة: accounts.groupId مفهرس، والانضمام على مفتاح أجنبي.
     */
    ...(filters.groupId ? { account: { groupId: filters.groupId } } : {}),
  };

  /*
   * فلترا الوسم والخطورة يجتمعان في شرطٍ واحد على التحليل.
   *
   * ★ ولو كُتب كلٌّ منهما كائناً مستقلّاً (`analysis: {...}` مرّتين)
   *   لكتب الثاني فوق الأول صامتاً: من طلب «كراهية بخطورة ٤» يحصل على
   *   «كل ما خطورته ٤» — نتيجةٌ أوسع ممّا طلب، تبدو صحيحة ولا تُكتشف.
   *
   * والشرط على العلاقة يستبعد المنشور بلا تحليل ضمناً، وهو الصواب:
   * غيرُ المصنَّف ليس «بلا خطورة» بل «لم يُنظر فيه».
   */
  const analysisWhere: Prisma.PostAnalysisWhereInput = {
    ...(filters.label ? { labels: { has: filters.label as never } } : {}),
    ...(filters.minSeverity ? { severityLevel: { gte: filters.minSeverity } } : {}),
  };

  /*
   * وحالُ التصنيف يسبقهما: «بانتظار التصنيف» يعني لا صفّ تحليلٍ أصلاً.
   *
   * ★ واجتماعُه مع وسمٍ أو خطورة طلبٌ متناقض، وجوابُه الصادق فراغ —
   *   ويُكتب الفراغُ صراحةً لا يُترك للصدفة.
   *
   *   وكان الشرطان يُكتب أحدهما على `where.analysis` فيغلب الثاني:
   *   `analyzed=no&minSeverity=4` يُرجع كلّ ما لم يُصنَّف، أي أوسع ممّا
   *   طُلب لا أضيق. وهو أسوأ أنواع الخطأ في فلتر: نتيجةٌ كلّ صفوفها
   *   صحيحةٌ في ذاتها عن سؤالٍ لم يُسأل. وقد كشفه فحصٌ على قاعدة حقيقية
   *   بعد أن مرّ على التوكيدات النصّية كلها.
   *
   *   والشاشة تمنع اجتماعهما أصلاً (انظر `setAnalyzed` في `filter-bar`)،
   *   وهذا للرابط المكتوب باليد.
   */
  if (filters.analyzed === 'no') {
    // العمود لا الضمّ المعاكس: الشاشة تسأل السؤال الذي تسأله المكنسة، فتُجيبه بالفهرس نفسه
    where.analyzedAt = null;
    if (Object.keys(analysisWhere).length > 0) where.id = { in: [] };
  } else if (filters.analyzed === 'yes') {
    where.analyzedAt = { not: null };
    if (Object.keys(analysisWhere).length > 0) where.analysis = { is: analysisWhere };
  } else if (Object.keys(analysisWhere).length > 0) {
    where.analysis = { is: analysisWhere };
  }

  if (from || to) {
    where.publishedAt = {
      ...(from ? { gte: from } : {}),
      ...(to ? { lte: to } : {}),
    };
  }

  Object.assign(where, postSearchWhere(filters.q, filters.qMode));

  return where;
}

/**
 * الحقل الذي يُطابَق فيه الحدّ الواحد — واحدٌ بعد أن كان خمسة.
 *
 * كانت: النصّ، واسم الكاتب، واسم الحساب، والهاشتاغ، والكلمة المكتشفة.
 * وأربعةٌ منها تخصّ المنشور، فجُمعت في `searchText` — عمودٍ مطبَّع عليه
 * فهرس ثلاثيّات.
 *
 * ★ والمطابقة مطبَّعةٌ على مطبَّع.
 *
 *   كان الحدّ يُطابَق على النصّ الخام، فـ«وزاره» لا تجد «وزارة» —
 *   والمنصّة نفسها تطبّع عند الاستيراد لتربط الكلمات المفتاحية. فالكلمة
 *   التي ربطت المنشور لا يجدها من كتبها في الشاشة.
 *
 * ★ واسم الحساب خرج من البحث النصّي — وهذا قرارٌ مقيس لا تبسيط.
 *
 *   هو في جدولٍ آخر، فشرطُه يُجبر المخطِّط على مسح الجدول كلّه: بوّابةُ
 *   `OR` بين عمودٍ مفهرس وجدولٍ آخر لا تُبنى بخريطة بتّات. والقياس على
 *   خمسين ألف منشور — عدُّ نتائج بحثٍ بمرادفين:
 *
 *       بفرع اسم الحساب:  Seq Scan · ٣٥١٦ صفحة · ٣٦ مللي ثانية
 *       بدونه:            Bitmap   ·  ١١٤ صفحة · ٠٫٧ مللي ثانية
 *
 *   وثمنُ إخراجه محدود: اسمُ الكاتب داخلٌ في العمود، وهو في صفحات
 *   المنصّات اسمُ الصفحة نفسه. ومن أراد حساباً بعينه فله فلترُ الحساب —
 *   والشاشة تقترحه عليه حين يكتب اسماً يطابق حساباً (انظر `filter-bar`)،
 *   فلا يُترك أمام نتيجةٍ فارغة لا يفهم سببها.
 */
function searchFields(term: string): Prisma.PostWhereInput[] {
  return [{ searchText: { contains: normalizeForSearch(term) } }];
}

/** مجموعةُ مرادفاتٍ تتحقّق بأيّ عنصرٍ منها */
function groupCondition(group: string[]): Prisma.PostWhereInput {
  return { OR: group.flatMap(searchFields) };
}

/**
 * شرط البحث النصّي — مجموعاتُ مرادفاتٍ لا حدوداً مفردة.
 *
 * ★ `AND` بين المجموعات و`OR` داخلها — وهذا ما يجعل البحث يبلغ موضوعاً.
 *
 *   الموضوع عائلتان من الكلمات تجتمعان: («كهرباء» أو «تيار») مع
 *   («انقطاع» أو «تقنين»). و«كلّها» تطلب الأربع مجتمعةً فلا تجد شيئاً،
 *   و«أيّها» تقبل أيّةَ واحدة فتعيد كلّ ما فيه «قطع» من أيّ سياق.
 *
 * ★ والحدّ الواحد يبقى كما كان.
 *
 *   الكلمة المفردة مجموعةٌ من عنصرٍ واحد، فتعطي `AND: [{ OR: [...] }]` —
 *   عين ما كان يعطيه البحث القديم. فلا يتغيّر سلوك سطرٍ قديم، ويُضاف
 *   التعدّد فوقه.
 *
 * ★ والاستبعاد نفيٌ لاجتماعها لا اجتماعُ نفيَيْها.
 *
 *   `NOT: { OR: [أ، ب] }` تعني «لا أ ولا ب» — وهي المقصودة. أمّا
 *   `NOT: [أ، ب]` في Prisma فتعني «ليس (أ و ب) معاً»، فتمرّ منشورات فيها
 *   أحدهما. والفرق لا يظهر إلا حين يُستبعد حدّان، وحينها يكون الجدول
 *   مليئاً بما طُلب إخراجه.
 *
 * ويُشارك هذه الدالّة المساعدُ الذكي، فلا يختلف بحثه عن بحث صاحبه.
 */
export function postSearchWhere(
  q: string | undefined | null,
  mode: 'all' | 'any' = 'all',
): Prisma.PostWhereInput {
  const parsed = parseSearchTerms(q);
  const where: Prisma.PostWhereInput = {};

  if (parsed.include.length > 0) {
    if (mode === 'any') {
      // «أيٌّ منها» يُسطّح المجموعات: الفرق بين المجموعة والمجموعة يسقط حين يكفي أيٌّ منها
      where.OR = parsed.include.flat().flatMap(searchFields);
    } else {
      where.AND = parsed.include.map(groupCondition);
    }
  }

  if (parsed.exclude.length > 0) {
    where.NOT = { OR: parsed.exclude.flatMap(searchFields) };
  }

  return where;
}

/** الحقول المعروضة في قوائم المنشورات */
export const POST_LIST_SELECT = {
  id: true,
  externalId: true,
  url: true,
  text: true,
  publishedAt: true,
  postType: true,
  language: true,
  country: true,
  location: true,
  authorName: true,
  imageUrl: true,
  videoUrl: true,
  thumbnailUrl: true,
  mediaUrls: true,
  likes: true,
  comments: true,
  shares: true,
  views: true,
  saves: true,
  engagementTotal: true,
  sentiment: true,
  sentimentScore: true,
  hashtags: true,
  detectedKeywords: true,
  isHidden: true,
  createdAt: true,
  mediaKey: true,
  account: { select: { id: true, name: true, url: true, avatarUrl: true } },
  platform: { select: { id: true, name: true, code: true, color: true } },
  topic: { select: { id: true, name: true, color: true } },
  /*
   * حقلان من التحليل لا التحليل كله.
   *
   * البطاقة تحتاج أن تقول «هذا خطر» في لمحة، ولا تحتاج التعليل ولا
   * الدليل ولا الألفاظ — تلك في صفحة المنشور. وجلبُ الصفّ كاملاً لأربعٍ
   * وعشرين بطاقة يحمل نصوصاً طويلة لا تُعرض.
   */
  analysis: { select: { severityLevel: true, labels: true } },
} satisfies Prisma.PostSelect;

export type PostListItem = Prisma.PostGetPayload<{ select: typeof POST_LIST_SELECT }>;

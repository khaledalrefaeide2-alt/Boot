import { z } from 'zod';
import { paginationSchema, RANGE_VALUES } from './common';

/** فلاتر المنشورات — مشتركة بين العرض والتصدير والإحصاءات */
export const postFiltersSchema = z.object({
  q: z.string().trim().max(300).optional(),
  /**
   * نمط تعدّد الكلمات.
   *
   * `all` يضيّق و`any` يوسّع، و`all` هو الافتراض: من كتب كلمتين يريد
   * المنشور الذي فيه الاثنتان في الغالب — ولو كان الافتراض `any` لعاد
   * بنتائج أكثر ممّا أعادته كلمةٌ واحدة، وهو عكس ما يقصده من يضيف كلمة.
   *
   * واختياريّ لا `default`: عدّة مواضع في الخادم تبني فلاتر المنشورات
   * كائناً مباشراً لشاشةٍ لا بحث فيها أصلاً (صفحة حساب، صفحة منصة)، فحقلٌ
   * إلزاميّ كان سيُلزمها بذكر نمطٍ لا يعنيها. والافتراض يقع في
   * `postSearchWhere` — موضعٌ واحد لا اثنان.
   */
  qMode: z.enum(['all', 'any']).optional(),
  platformId: z.union([z.string(), z.array(z.string())]).optional(),
  accountId: z.union([z.string(), z.array(z.string())]).optional(),
  /** مجموعة الحسابات — تُطبَّق عبر الحساب لا عبر المنشور */
  groupId: z.string().trim().max(64).optional(),
  keywordId: z.string().trim().max(64).optional(),
  /** كيان مذكور في المنشور — شخص أو مؤسسة أو مكان */
  entityId: z.string().trim().max(64).optional(),
  /** الحدث الذي يقع فيه المنشور — عنقودٌ من المنشورات المتقاربة */
  storyId: z.string().trim().max(64).optional(),
  hashtag: z.string().trim().max(100).optional(),
  postType: z.enum(['TEXT', 'IMAGE', 'VIDEO', 'REEL', 'LINK', 'ALBUM', 'STORY', 'OTHER']).optional(),
  language: z.string().trim().max(10).optional(),
  topicId: z.string().trim().max(64).optional(),
  sentiment: z.enum(['POSITIVE', 'NEUTRAL', 'NEGATIVE', 'MIXED', 'UNKNOWN']).optional(),
  /**
   * وسمُ محتوى بعينه — «أرني كلّ ما وُسم خطاب كراهية».
   *
   * ولا يُقيَّد بقائمةٍ هنا: القائمة في المخطّط (`ContentLabel`)، وتكرارها
   * نصّاً في ثلاثة ملفّات يجعل وسماً جديداً يُقبل في شاشةٍ ويُردّ في
   * أخرى. والقيمة المجهولة تُرجع فراغاً لا خطأً — وهو الصواب لفلتر.
   */
  label: z.string().trim().max(64).optional(),
  /**
   * أدنى درجة خطورة — «أرني كلّ ما خطورته ٤ فأعلى».
   *
   * و«أدنى» لا «يساوي»: من يبحث عن الخطر يريد ما فوقه أيضاً. وفلترٌ
   * يساوي يُخفي درجة ٥ عمّن طلب ٤، وهو عكس ما يقصده.
   */
  minSeverity: z.coerce.number().int().min(1).max(5).optional(),
  country: z.string().trim().max(80).optional(),
  range: z.enum(RANGE_VALUES).default('30d'),
  from: z.string().trim().max(40).optional(),
  to: z.string().trim().max(40).optional(),
  includeHidden: z.enum(['true', 'false']).default('false'),
});

export const listPostsSchema = postFiltersSchema.extend(paginationSchema.shape).extend({
  sort: z
    .enum(['publishedAt', 'engagementTotal', 'likes', 'comments', 'shares', 'views'])
    .default('publishedAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export const updatePostSchema = z.object({
  topicId: z.string().trim().max(64).nullable().optional(),
  sentiment: z.enum(['POSITIVE', 'NEUTRAL', 'NEGATIVE', 'MIXED', 'UNKNOWN']).optional(),
  /**
   * وسمُ محتوى بعينه — «أرني كلّ ما وُسم خطاب كراهية».
   *
   * ولا يُقيَّد بقائمةٍ هنا: القائمة في المخطّط (`ContentLabel`)، وتكرارها
   * نصّاً في ثلاثة ملفّات يجعل وسماً جديداً يُقبل في شاشةٍ ويُردّ في
   * أخرى. والقيمة المجهولة تُرجع فراغاً لا خطأً — وهو الصواب لفلتر.
   */
  label: z.string().trim().max(64).optional(),
  /**
   * أدنى درجة خطورة — «أرني كلّ ما خطورته ٤ فأعلى».
   *
   * و«أدنى» لا «يساوي»: من يبحث عن الخطر يريد ما فوقه أيضاً. وفلترٌ
   * يساوي يُخفي درجة ٥ عمّن طلب ٤، وهو عكس ما يقصده.
   */
  minSeverity: z.coerce.number().int().min(1).max(5).optional(),
  isHidden: z.boolean().optional(),
  reviewNote: z.string().trim().max(1000).nullable().optional(),
});

export type PostFilters = z.infer<typeof postFiltersSchema>;
export type ListPostsInput = z.infer<typeof listPostsSchema>;

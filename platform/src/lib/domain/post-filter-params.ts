import type { PostFilterState } from '@/components/filters/filter-bar';
import { RANGE_VALUES } from '@/lib/validation/common';

/*
 * فلاتر شاشة المنشورات من الرابط.
 *
 * ★ روابط «منشورات المنصة» و«منشورات الحساب» كانت تفتح منشورات الجميع.
 *
 *   كانت تُبنى `/posts?platformId=…&range=all`، والشاشة تبدأ بفلاترَ فارغة
 *   ولا تقرأ الرابط أصلاً — فيرى الموظّف آخر ثلاثين يوماً من كلّ المنصات
 *   ويظنّها منشورات ما ضغطه. والعطب صامت: الطلب ينجح والجواب صحيحٌ عن
 *   سؤالٍ لم يُسأل.
 *
 * والرابط يُكتب بيد من شاء، فكلّ قيمةٍ تُقبل بشكلها المعروف وحده؛ وما
 * سواها يُترك فيبقى افتراضيّ الشاشة. والملف بلا `use client` عن قصد: يقرؤه
 * الخادم ليرسم الصفحة الأولى بالفلاتر الصحيحة، لا أن ترسمها الشاشة فارغةً
 * ثمّ تقفز.
 */

const ID_SHAPE = /^[A-Za-z0-9_-]{1,64}$/;
const SENTIMENTS = ['POSITIVE', 'NEUTRAL', 'NEGATIVE', 'MIXED', 'UNKNOWN'];
const DATE_SHAPE = /^\d{4}-\d{2}-\d{2}/;

export function postFiltersFromSearchParams(
  params: Record<string, string | string[] | undefined>,
): Partial<PostFilterState> {
  const read = (key: string) => {
    const value = params[key];
    return (Array.isArray(value) ? value[0] : value)?.trim() ?? '';
  };

  const result: Partial<PostFilterState> = {};

  for (const key of ['accountId', 'platformId', 'groupId', 'topicId'] as const) {
    const value = read(key);
    if (ID_SHAPE.test(value)) result[key] = value;
  }

  const range = read('range');
  if ((RANGE_VALUES as readonly string[]).includes(range)) result.range = range;
  if (result.range === 'custom') {
    const from = read('from');
    const to = read('to');
    if (DATE_SHAPE.test(from)) result.from = from.slice(0, 40);
    if (DATE_SHAPE.test(to)) result.to = to.slice(0, 40);
  }

  const sentiment = read('sentiment');
  if (SENTIMENTS.includes(sentiment)) result.sentiment = sentiment;

  const q = read('q');
  if (q) result.q = q.slice(0, 300);

  const hashtag = read('hashtag');
  if (hashtag) result.hashtag = hashtag.slice(0, 100);

  return result;
}

import { lightStem, normalizeForSearch } from '@/lib/analysis/text';
import type { ParsedSearch } from './search-terms';

/*
 * إبراز موضع المطابقة في البطاقة.
 *
 * ★ لماذا يستحقّ هذا شيفرةً خاصّة؟
 *
 *   البطاقة تعرض أوّل مئتي حرفٍ من المنشور. فمن بحث عن كلمةٍ وردت في
 *   السطر العاشر يرى بطاقةً لا أثر فيها لما بحث عنه — ويسأل: لماذا
 *   ظهر هذا؟ فيفتح المنشور ليعرف، ثمّ يعود، ثمّ يفتح الذي بعده.
 *
 *   وبطاقةٌ تعرض السطر الذي فيه الكلمة، والكلمةُ فيه مُبرَزة، تُجيب
 *   قبل أن يُسأل. وهذا هو الفرق بين قائمةٍ تُقرأ وقائمةٍ تُمسح.
 *
 * ★ والمطابقة على الكلمة المجذَّرة لا على النصّ الخام.
 *
 *   لو أُبرز بالبحث النصّي المباشر لاختلف المبرَز عن المطابَق: البحث
 *   يجد «الوزارة» بحدّ «وزارة» ثمّ لا يُبرز شيئاً لأنّ الحرفين لا
 *   يتطابقان. فيُجذَّر كلّ كلمةٍ في النصّ وتُقارن بجذور الحدود — وهي
 *   المقارنة نفسها التي تجري في القاعدة.
 *
 * والدوالّ كلّها خالصة: تُفحص وحدها، وتعمل في المتصفّح بلا خادم.
 */

export interface Segment {
  text: string;
  match: boolean;
}

/*
 * القصّ من الطرفين مُفصَّل لا مجموع.
 *
 * فالنافذة قد تبدأ من وسط النصّ وتنتهي بنهايته: فنقطةُ حذفٍ قبلها وليس
 * بعدها. وراءٌ واحدةٌ تقول «قُصّ» تُجبر الشاشة على تخمين الطرف — أو
 * على وضع نقاطٍ في موضعٍ لم يُحذف منه شيء، فتقول إنّ بعد النصّ بقيّةً
 * وهو تمامه.
 */
export interface Highlight {
  segments: Segment[];
  /** هل حُذف ما قبل النافذة؟ */
  clippedStart: boolean;
  /** هل حُذف ما بعدها؟ */
  clippedEnd: boolean;
}

/**
 * جذور ما بُحث عنه — مبسوطةً من المجموعات ومن كلمات العبارات.
 *
 * والعبارة تُبسط إلى كلماتها للإبراز وحده: «وزارة الكهرباء» تُطابَق في
 * القاعدة بمسافتها، ولكنّ إبراز كلمتيها منفصلتين أوضح للعين من ترك
 * إحداهما بلا لون.
 */
export function queryStems(parsed: ParsedSearch): Set<string> {
  const stems = new Set<string>();
  for (const group of parsed.include) {
    for (const term of group) {
      for (const word of normalizeForSearch(term).split(' ')) {
        const stem = lightStem(word);
        if (stem) stems.add(stem);
      }
    }
  }
  return stems;
}

/** هل هذه الكلمة من المبحوث عنه؟ */
function isMatch(word: string, stems: Set<string>): boolean {
  if (stems.size === 0) return false;
  const stem = lightStem(normalizeForSearch(word));
  return stem.length > 0 && stems.has(stem);
}

/**
 * تقطيع النصّ إلى مقاطع مبرَزة وغير مبرَزة، حول أوّل مطابقة.
 *
 * ★ والتقطيع على الكلمات لا على المحارف.
 *
 *   التطبيع يحذف التشكيل، فموضعُ الحرف في المطبَّع لا يقابل موضعه في
 *   الخام. وربطُ الموضعين يحتاج خريطةَ إزاحاتٍ تُبنى مع كلّ تطبيع —
 *   كلفةٌ وخطأٌ ينتظر. والكلمة وحدةٌ قائمة في النصّين معاً، فتُقارَن
 *   الكلمة بالكلمة ويُبرَز الخام كما هو.
 */
export function highlightSegments(
  raw: string | null | undefined,
  parsed: ParsedSearch,
  limit = 220,
): Highlight {
  const text = (raw ?? '').trim();
  if (!text) return { segments: [], clippedStart: false, clippedEnd: false };

  const stems = queryStems(parsed);

  /*
   * بلا بحثٍ يُعرض أوّل النصّ كما كان — فالميزة تُضاف ولا تُبدّل سلوكاً.
   */
  if (stems.size === 0) {
    return {
      segments: [{ text: text.slice(0, limit), match: false }],
      clippedStart: false,
      clippedEnd: text.length > limit,
    };
  }

  // المواضع: كلّ كلمةٍ مع بدايتها ونهايتها في النصّ الخام
  const words: { start: number; end: number; match: boolean }[] = [];
  const pattern = /\S+/g;
  for (let m = pattern.exec(text); m !== null; m = pattern.exec(text)) {
    const word = m[0];
    words.push({
      start: m.index,
      end: m.index + word.length,
      // علامات الترقيم تُقصّ قبل المقارنة: «الكهرباء،» كلمةٌ واحدة
      match: isMatch(word.replace(/[^\p{L}\p{N}]/gu, ''), stems),
    });
  }

  const first = words.find((word) => word.match);

  /*
   * بلا مطابقةٍ في النصّ يُعرض أوّله.
   *
   * ويقع ذلك فعلاً: المطابقة قد تكون في اسم الكاتب أو في هاشتاغ أو في
   * كلمةٍ اكتشفها النظام — وكلّها في عمود البحث لا في النصّ المعروض.
   * فلا يُترك القارئ أمام بطاقةٍ فارغة لأنّ الكلمة وردت في غير النصّ.
   */
  if (!first) {
    return {
      segments: [{ text: text.slice(0, limit), match: false }],
      clippedStart: false,
      clippedEnd: text.length > limit,
    };
  }

  /*
   * نافذةٌ حول أوّل مطابقة، تبدأ من أوّل كلمةٍ كاملة.
   *
   * ★ وما قبل المطابقة نصفُ الحدّ لا أكثر — وهذا شرطُ ظهورٍ لا ذوق.
   *
   *   الشاشة تقصّ المعروض بعدد الأسطر (`line-clamp`) لا بعدد المحارف،
   *   والحدُّ مقدَّرٌ بما يملأ تلك الأسطر. فلو بدأت النافذة قبل
   *   المطابقة بالحدّ كلّه لوقعت المطابقة في آخر سطرٍ أو بعده — أي
   *   خارج المعروض، فيعود القارئ إلى بطاقةٍ لا أثر فيها لما بحث عنه،
   *   وهي العلّة التي من أجلها كُتب هذا الملفّ.
   *
   *   والنصف يضع المطابقة في النصف الأوّل من المعروض دائماً، أيّاً كان
   *   الحدّ: مئتان وعشرون في البطاقة ومئةٌ وأربعون في الجدول.
   */
  let start = Math.max(0, first.start - Math.floor(limit / 2));
  if (start > 0) {
    const space = text.indexOf(' ', start);
    start = space === -1 ? start : space + 1;
  }
  const end = Math.min(text.length, start + limit);

  const segments: Segment[] = [];
  let cursor = start;
  for (const word of words) {
    if (word.end <= start || word.start >= end) continue;
    if (!word.match) continue;
    if (word.start > cursor) {
      segments.push({ text: text.slice(cursor, word.start), match: false });
    }
    segments.push({ text: text.slice(word.start, Math.min(word.end, end)), match: true });
    cursor = Math.min(word.end, end);
  }
  if (cursor < end) segments.push({ text: text.slice(cursor, end), match: false });

  return {
    segments: segments.filter((segment) => segment.text.length > 0),
    clippedStart: start > 0,
    clippedEnd: end < text.length,
  };
}

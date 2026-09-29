import { normalizeArabic } from '@/lib/analysis/text';

/*
 * قراءة سطر البحث.
 *
 * كان السطر كلّه كلمةً واحدة تُطابَق حرفياً: من كتب «وزارة الكهرباء
 * انقطاع» لا يجد شيئاً، لأنّ لا منشور فيه هذه الحروف الثلاثة متتالية
 * بهذا الترتيب. فيظنّ أنّ الموضوع غير مرصود، وهو مرصود في مئتي منشور.
 *
 * ★ والقراءة هنا خالصة — بلا قاعدة ولا خادم.
 *
 *   لأنّها تُستعمل في الطرفين: الخادم يبني بها الاستعلام، والواجهة تعرض
 *   بها ما فُهم من السطر قبل الضغط. ولو كُتبت مرّتين لاختلف ما يُعرض عمّا
 *   يُبحث — وهو أسوأ من ألّا يُعرض شيء، لأنّ الموظّف يصدّق ما رآه.
 *
 * والقواعد ثلاث، ولا رابعة:
 *
 *   كلمة كلمة    → حدّان مستقلّان
 *   "عبارة"       → حدٌّ واحد بمسافاته (و«عبارة» كذلك)
 *   -كلمة        → استبعاد
 */

/** أقصى عدد حدود في السطر الواحد */
export const MAX_SEARCH_TERMS = 8;

/** أقصر حدّ مقبول — الحرف الواحد يُطابق كلّ شيء فلا يُصفّي شيئاً */
const MIN_TERM = 2;

/** أطول حدّ مقبول — ما زاد جملةٌ لا حدّ بحث */
const MAX_TERM = 60;

export interface ParsedSearch {
  /** ما يجب أن يظهر — بحسب النمط: كلّها أو أيٌّ منها */
  include: string[];
  /** ما لا يجوز أن يظهر — يُطبَّق دائماً بالنفي مهما كان النمط */
  exclude: string[];
  /** حدودٌ أُسقطت لقصرها أو طولها أو تكرارها — تُعرض للقارئ ولا تُكتم */
  dropped: string[];
}

/**
 * التقاط الحدود: عبارةٌ بين علامتَي تنصيص، أو كلمةٌ مفردة، وقبلها `-`
 * اختيارية للاستبعاد.
 *
 * وعلامتا التنصيص العربيتان «» مقبولتان كالإنجليزيتين: لوحة المفاتيح
 * العربية تُنتجهما، ورفضُهما يجعل الميزة تعمل لمن يكتب بالإنجليزية وحده.
 */
const TOKEN = /(-?)(?:"([^"]*)"|«([^»]*)»|(\S+))/g;

/** إزالة علامات التنصيص الشاردة من طرفَي الكلمة المفردة */
function strip(value: string): string {
  return value.replace(/^["«»]+|["«»]+$/g, '');
}

/**
 * قراءة سطر البحث إلى حدود.
 *
 * دالّة خالصة — تُفحص وحدها.
 */
export function parseSearchTerms(raw: string | null | undefined): ParsedSearch {
  const text = (raw ?? '').trim();
  const result: ParsedSearch = { include: [], exclude: [], dropped: [] };
  if (!text) return result;

  /*
   * المفتاح مطبَّع والحدّ يبقى كما كُتب.
   *
   * التطبيع للمقارنة وحدها: من كتب «الأسد الاسد» لا يُبحث له عن حدّين،
   * ومن كتب «وزارة» يبقى بحثه «وزارة» لا «وزاره» — فالمطابقة في القاعدة
   * على النصّ كما هو.
   */
  const seen = new Set<string>();
  TOKEN.lastIndex = 0;

  for (let match = TOKEN.exec(text); match !== null; match = TOKEN.exec(text)) {
    if (result.include.length + result.exclude.length >= MAX_SEARCH_TERMS) break;

    const negated = match[1] === '-';
    const quoted = match[2] ?? match[3];
    const value = (quoted ?? strip(match[4] ?? '')).replace(/\s+/g, ' ').trim();

    if (value.length === 0) continue;

    if (value.length < MIN_TERM || value.length > MAX_TERM) {
      result.dropped.push(value);
      continue;
    }

    const key = normalizeArabic(value);
    if (key.length === 0 || seen.has(key)) {
      result.dropped.push(value);
      continue;
    }

    seen.add(key);
    (negated ? result.exclude : result.include).push(value);
  }

  return result;
}

/** هل في السطر أكثر من حدّ واحد؟ — به وحده يُقرَّر إظهار خيار النمط */
export function hasMultipleTerms(parsed: ParsedSearch): boolean {
  return parsed.include.length + parsed.exclude.length > 1;
}

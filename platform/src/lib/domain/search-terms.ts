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
 * والقواعد أربع:
 *
 *   كلمة كلمة     → حدّان مستقلّان، يجب أن يظهرا معاً
 *   "عبارة"        → حدٌّ واحد بمسافاته (و«عبارة» كذلك)
 *   -كلمة         → استبعاد
 *   كهرباء|تيار   → مرادفان، يكفي أحدهما
 *
 * ★ والرابعة هي ما يجعل البحث يبلغ موضوعاً لا كلمة.
 *
 *   الموضوع في الواقع ليس كلمةً واحدة بل عائلتين من الكلمات تجتمعان:
 *   («كهرباء» أو «تيار» أو «كهربا») مع («انقطاع» أو «تقنين» أو «قطع»).
 *   ومن لا يملك إلا «كلّها» و«أيّها» لا يستطيع التعبير عن ذلك: «كلّها»
 *   تطلب الستّ مجتمعةً فلا تجد شيئاً، و«أيّها» تقبل أيّةَ واحدة فتعيد
 *   كلّ ما فيه كلمة «قطع» من أيّ سياق.
 *
 *   فصار الحدّ مجموعةَ مرادفات: `OR` داخلها و`AND` بينها. والكلمة
 *   المفردة مجموعةٌ من واحد، فالسطر القديم لا يتغيّر سلوكه.
 */

/** أقصى عدد مجموعات في السطر — كلٌّ منها شرطٌ مستقلّ */
export const MAX_SEARCH_GROUPS = 8;

/** أقصى عدد مرادفات داخل المجموعة الواحدة */
export const MAX_ALTERNATIVES = 10;

/**
 * أقصى عدد حدود في السطر كلّه.
 *
 * وهو ما يحرس القاعدة فعلاً: ثماني مجموعات بعشرة مرادفات تعني ثمانين
 * شرط `LIKE` في استعلامٍ واحد. والحدّ هنا أقلّ من حاصل ضربهما عمداً —
 * الموضوع الحقيقي لا يحتاج ثمانين صيغة، ومن يكتبها يكتب سطراً لا
 * يفهمه هو نفسه بعد أسبوع.
 */
export const MAX_SEARCH_TERMS = 40;

/** أقصر حدّ مقبول — الحرف الواحد يُطابق كلّ شيء فلا يُصفّي شيئاً */
const MIN_TERM = 2;

/** أطول حدّ مقبول — ما زاد جملةٌ لا حدّ بحث */
const MAX_TERM = 60;

export interface ParsedSearch {
  /**
   * ما يجب أن يظهر — مجموعاتُ مرادفات.
   *
   * كلّ مجموعة شرطٌ يجب أن يتحقّق (في النمط `all`)، ويكفي أن يتحقّق
   * بأحد عناصرها. والكلمة المفردة مجموعةٌ من عنصرٍ واحد.
   */
  include: string[][];
  /** ما لا يجوز أن يظهر — يُطبَّق دائماً بالنفي مهما كان النمط */
  exclude: string[];
  /** حدودٌ أُسقطت لقصرها أو طولها أو تكرارها — تُعرض للقارئ ولا تُكتم */
  dropped: string[];
}

/**
 * تقطيع السطر إلى وحدات، مع احترام علامتَي التنصيص.
 *
 * ★ ولا يُكتب بتعبيرٍ نمطيّ واحد.
 *
 *   كان كذلك، وكان يكفي يوم كانت القواعد ثلاثاً. ومع المرادفات صار
 *   الفاصل `|` قد يقع داخل عبارةٍ مقتبسة («قطع|وصل» اسمُ حملة)، وقد
 *   تقع العبارة طرفاً في مرادفاتٍ (`"وزارة الكهرباء"|كهرباء`). وتعبيرٌ
 *   نمطيّ يلمّ ذلك كلّه يصير سطراً لا يُقرأ ولا يُصلَح — فيُكتب مشياً
 *   على الحروف، وهو أطول وأوضح.
 */
function tokenize(text: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: string | null = null;

  const closing: Record<string, string> = { '"': '"', '«': '»' };

  for (const char of text) {
    if (quote) {
      if (char === quote) {
        quote = null;
        continue;
      }
      current += char;
      continue;
    }

    if (char === '"' || char === '«') {
      quote = closing[char] ?? char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current.length > 0) tokens.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  if (current.length > 0) tokens.push(current);
  return tokens;
}

/**
 * قراءة سطر البحث إلى مجموعات.
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
   * ومن كتب «وزارة» يبقى بحثه «وزارة» لا «وزاره» — فما يُعرض عليه هو ما
   * كتبه، والتطبيع شأن المطابقة في القاعدة.
   */
  const seen = new Set<string>();
  let total = 0;

  for (const token of tokenize(text)) {
    if (total >= MAX_SEARCH_TERMS) break;
    if (result.include.length >= MAX_SEARCH_GROUPS) break;

    const negated = token.startsWith('-');
    const body = negated ? token.slice(1) : token;

    /*
     * الفاصل داخل الوحدة وحدها.
     *
     * والعبارة المقتبسة فقدت علامتيها في التقطيع، فـ«قطع|وصل» بينهما
     * تعود وحدةً واحدة فيها فاصل — وتُقسَم هنا خطأً. وهو ثمنٌ مقبول:
     * اسمٌ فيه `|` نادر، والبديل حملُ العلامات خلال التقطيع كلّه.
     */
    const parts = body.split('|');
    const group: string[] = [];

    for (const part of parts) {
      if (group.length >= MAX_ALTERNATIVES) break;
      if (total >= MAX_SEARCH_TERMS) break;

      const value = part.replace(/\s+/g, ' ').trim();
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
      total += 1;

      /*
       * الاستبعاد يُسطَّح ولا يُجمَّع.
       *
       * `-أ|ب` تعني «لا هذا ولا ذاك» لا «ليس أحدهما»: من يستبعد يستبعد
       * كلّ ما كتب. وجمعُها في مجموعةٍ بـ`OR` ثمّ نفيُها يعطي المعنى
       * نفسه، ولكنّ التسطيح يجعله ظاهراً في الشرائح كما هو في النتيجة.
       */
      if (negated) result.exclude.push(value);
      else group.push(value);
    }

    if (group.length > 0) result.include.push(group);
  }

  return result;
}

/** عدد الحدود كلّها — المجموعات مبسوطةً مع المستبعدات */
export function countTerms(parsed: ParsedSearch): number {
  return parsed.include.reduce((sum, group) => sum + group.length, 0) + parsed.exclude.length;
}

/** هل في السطر أكثر من حدّ واحد؟ — به وحده يُقرَّر إظهار خيار النمط */
export function hasMultipleTerms(parsed: ParsedSearch): boolean {
  return countTerms(parsed) > 1;
}

/**
 * عرض المجموعة في شريحةٍ واحدة: «كهرباء أو تيار».
 *
 * و«أو» بالعربية لا `|`: الشريحة تُقرأ لا تُكتب، ومن رأى `|` في موضع
 * يظنّه جزءاً من كلمته.
 */
export function describeGroup(group: string[]): string {
  return group.join(' أو ');
}

/**
 * أدوات تحليل النص العربي — قواعد بسيطة كافية للنسخة الأولى،
 * ومصمّمة ليُستبدل جوهرها لاحقاً بالذكاء الاصطناعي دون تغيير الواجهات.
 */

/** تطبيع النص العربي: إزالة التشكيل وتوحيد الألف والياء والهاء */
export function normalizeArabic(text: string): string {
  return text
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[ؤئ]/g, 'ء')
    .toLowerCase()
    .trim();
}

/** استخراج الهاشتاغات — يدعم العربية والإنجليزية والأرقام والشرطة السفلية */
export function extractHashtags(text: string | null | undefined): string[] {
  if (!text) return [];
  const matches = text.match(/#[\p{L}\p{N}_]+/gu) ?? [];
  const unique = new Set(
    matches
      .map((tag) => tag.slice(1).trim())
      .filter((tag) => tag.length > 0 && tag.length <= 100),
  );
  return Array.from(unique).slice(0, 50);
}

/** استخراج المنشنات */
export function extractMentions(text: string | null | undefined): string[] {
  if (!text) return [];
  const matches = text.match(/@[\p{L}\p{N}_.]+/gu) ?? [];
  return Array.from(new Set(matches.map((m) => m.slice(1)))).slice(0, 50);
}

/** كشف لغة المنشور بشكل مبدئي حسب نسبة الحروف */
export function detectLanguage(text: string | null | undefined): string | null {
  if (!text) return null;
  const stripped = text.replace(/[#@]\S+/g, '').replace(/https?:\/\/\S+/g, '');
  const arabicChars = (stripped.match(/[؀-ۿ]/g) ?? []).length;
  const latinChars = (stripped.match(/[A-Za-z]/g) ?? []).length;
  const total = arabicChars + latinChars;
  if (total < 4) return null;
  if (arabicChars / total >= 0.5) return 'ar';
  if (latinChars / total >= 0.7) return 'en';
  return 'und';
}

/** كلمات الوقف العربية والإنجليزية — تُستبعد من إحصاء أكثر الكلمات تكراراً */
const STOP_WORDS = new Set(
  [
    'في','من','على','الى','إلى','عن','مع','هذا','هذه','ذلك','التي','الذي','ما','لا','قد','كل','بعد','قبل',
    'بين','عند','حتى','او','أو','ثم','كما','لكن','هو','هي','هم','نحن','انا','أنا','انت','أنت','كان','كانت',
    'يكون','تكون','ان','أن','إن','به','له','لها','بها','منه','منها','و','يا','ايضا','أيضا','حول','خلال',
    'the','and','for','with','that','this','from','have','has','was','were','are','you','your','our','its',
    'not','but','all','can','will','would','they','their','his','her','him','she','out','who','what','how',
  ].map(normalizeArabic),
);

/**
 * تقسيم النص إلى كلمات ذات معنى، مع الاحتفاظ بالكلمة كما وردت.
 *
 * `key` هو الشكل المطبَّع ويُستخدم للتجميع والمطابقة، و`surface` هو الشكل
 * الأصلي في النص ويُستخدم للعرض. الفصل بينهما ضروري: التطبيع يحوّل
 * «ة» إلى «ه» و«أ» إلى «ا» ليجمع صيغ الكلمة الواحدة، فلو عُرض الشكل
 * المطبَّع لرأى المستخدم كلمات عربية مكتوبة خطأ («ورشه» بدل «ورشة»).
 */
export function tokenizeWithSurface(
  text: string | null | undefined,
): { key: string; surface: string }[] {
  if (!text) return [];
  const cleaned = text
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[#@][\p{L}\p{N}_]+/gu, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ');

  return cleaned
    .split(/\s+/)
    .map((word) => ({ key: normalizeArabic(word), surface: word.trim() }))
    .filter(
      ({ key }) =>
        key.length >= 3 && key.length <= 40 && !STOP_WORDS.has(key) && !/^\d+$/.test(key),
    );
}

/** تقسيم النص إلى كلمات مطبَّعة — للمطابقة والإحصاء */
export function tokenize(text: string | null | undefined): string[] {
  return tokenizeWithSurface(text).map(({ key }) => key);
}

/**
 * أكثر الكلمات تكراراً في مجموعة نصوص.
 * التجميع على الشكل المطبَّع، والعرض بأكثر الأشكال الأصلية وروداً.
 */
export function topWords(texts: (string | null)[], limit = 40): { word: string; count: number }[] {
  const counts = new Map<string, number>();
  const surfaces = new Map<string, Map<string, number>>();

  for (const text of texts) {
    for (const { key, surface } of tokenizeWithSurface(text)) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
      let forms = surfaces.get(key);
      if (!forms) {
        forms = new Map<string, number>();
        surfaces.set(key, forms);
      }
      forms.set(surface, (forms.get(surface) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .map(([key, count]) => {
      let word = key;
      let best = 0;
      for (const [surface, times] of surfaces.get(key) ?? []) {
        if (times > best) {
          best = times;
          word = surface;
        }
      }
      return { word, count };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

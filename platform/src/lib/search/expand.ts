import 'server-only';
import { z } from 'zod';
import { normalizeForSearch } from '@/lib/analysis/text';
import {
  MAX_ALTERNATIVES,
  describeGroup,
  parseSearchTerms,
  type ParsedSearch,
} from '@/lib/domain/search-terms';

/*
 * توسيع البحث — من الكلمة إلى الموضوع.
 *
 * ★ المشكلة: البحث عن «كهرباء» يُرجع ما فيه الكلمة وحدها.
 *
 *   ومنشورٌ يقول «انقطاع التيار في الحيّ منذ ساعتين» لا يحوي الكلمة،
 *   وهو من صميم الموضوع. وآخر يقول «أسعار المولدات ارتفعت» كذلك.
 *   فالموظّف يبحث فيجد ثلاثين منشوراً، وفي القاعدة ثلاثمئة.
 *
 * ★ والحلّ المختار: توسيعٌ إلى كلماتٍ مرتبطة تُكتب في الحقل.
 *
 *   لا استرجاعاً متّجهياً خفيّاً، ولأربعة أسباب لكلٍّ منها ثمنٌ ملموس:
 *
 *   ١) ما يُعرض هو ما يُبحث به. الموظّف يرى «كهرباء أو تيار أو تقنين
 *      أو مولدات» في الشرائح، فيحذف ما لا يعنيه ويضيف ما نقص. أمّا
 *      الاسترجاع المتّجهي فيُرجع منشوراً ولا يقول لماذا — ومنصّةُ رصدٍ
 *      تُبنى عليها تقارير لا تحتمل نتيجةً لا تُفسَّر.
 *
 *   ٢) ويعمل في كلّ شاشة. الناتج سطرُ بحثٍ عاديّ، فالإحصاءات والتصدير
 *      والأحداث والمساعد تقرؤه كلّها. ولو كان قائمةَ معرّفات لعملت في
 *      شاشة المنشورات وحدها — فيُصدِّر الموظّف ما بحث عنه فيجد عدداً
 *      آخر، وهو أسوأ من ألّا تعمل الميزة.
 *
 *   ٣) ويبلغ ما لم يُفهرس بعد. المتّجه لا يُبنى إلا بفهرسة، وبين وصول
 *      المنشور وفهرسته فجوة. والكلمات تُطابَق على النصّ نفسه فور وصوله.
 *
 *   ٤) والرابط يبقى صالحاً للمشاركة: يحمل الكلمات لا معرّفاً يتغيّر
 *      معناه غداً.
 *
 * والبحث الدلالي يبقى حيث موضعه — في المساعد الذكي، حيث السؤال جملةٌ
 * لا كلمة، والجواب نصٌّ يُفسّر نفسه.
 */

/** أقصى ما يُضاف إلى المجموعة الواحدة — والباقي يُسقَط */
const MAX_ADDED = 6;

/** أقصر كلمةٍ مضافة — ما دونها يُطابق كلّ شيء فلا يُصفّي شيئاً */
const MIN_ADDED_LENGTH = 3;

/** عمر النسخة المخزَّنة — الموضوع لا تتغيّر ألفاظه كلّ يوم */
const CACHE_TTL_SECONDS = 30 * 24 * 60 * 60;

/**
 * ألفاظٌ لا تُقبل توسيعاً مهما اقترحها النموذج.
 *
 * ★ وهذه هي الحارسة الحقيقية للميزة.
 *
 *   كلمةٌ عامّة واحدة في المجموعة تُبطل الشرط كلّه: «الناس» أو «اليوم»
 *   تُطابق نصف الجدول، فيصير البحث عن موضوعٍ بعينه بحثاً عن كلّ شيء —
 *   ويبدو أنّ التوسيع «وجد الكثير» وهو لم يجد شيئاً.
 */
const TOO_GENERIC = new Set(
  [
    'الناس',
    'ناس',
    'اليوم',
    'امس',
    'الامس',
    'غدا',
    'الوضع',
    'الاوضاع',
    'الموضوع',
    'الامر',
    'شيء',
    'اشياء',
    'جدا',
    'كثير',
    'قليل',
    'جديد',
    'قديم',
    'كبير',
    'صغير',
    'مواطن',
    'مواطنين',
    'المواطنين',
    'سوريا',
    'سورية',
    'سوري',
    'البلد',
    'الدوله',
    'الحكومه',
    'خبر',
    'اخبار',
    'الاخبار',
    'منشور',
    'فيديو',
    'صوره',
  ].map(normalizeForSearch),
);

export interface ExpansionResult {
  /** سطر البحث بعد التوسيع — بقواعد الشاشة نفسها */
  query: string;
  /** ما أُضيف فعلاً، مجموعةً مجموعة — لتُعرض للقارئ */
  added: string[][];
  /** من أين جاء: النموذج، أو نسخة محفوظة، أو لم يُوسَّع */
  source: 'model' | 'cache' | 'none';
}

/**
 * مفتاح النسخة المحفوظة.
 *
 * مطبَّعٌ لا خام: «الكهرباء» و«الكهربا» و«الكهرباءُ» سؤالٌ واحد، وحفظُ
 * ثلاث نسخ له يدفع ثمن النموذج ثلاث مرّات لجواب واحد.
 */
export function expansionCacheKey(raw: string): string {
  return `qx:${normalizeForSearch(raw)}`;
}

/**
 * تركيب السطر الموسَّع من المجموعات.
 *
 * دالّة خالصة — تُفحص وحدها، ولا تعرف شيئاً عن النموذج ولا عن الشبكة.
 *
 * والمستبعدات تُعاد كما كانت: من كتب `-مزحة` يريدها مستبعدةً بعد
 * التوسيع كما قبله، وتوسيعُ المستبعد يوسّع ما طُلب إخراجه.
 */
export function buildExpandedQuery(parsed: ParsedSearch, additions: string[][]): string {
  const groups = parsed.include.map((group, index) => {
    const extra = additions[index] ?? [];
    return [...group, ...extra].join('|');
  });

  const excluded = parsed.exclude.map((term) =>
    term.includes(' ') ? `-«${term}»` : `-${term}`,
  );

  return [...groups.map(quoteIfNeeded), ...excluded].join(' ');
}

/** العبارة ذات المسافات تعود بعلامتيها، وإلا قُرئت كلمتين */
function quoteIfNeeded(group: string): string {
  return group
    .split('|')
    .map((term) => (term.includes(' ') ? `«${term}»` : term))
    .join('|');
}

/**
 * تنقية ما اقترحه النموذج.
 *
 * ثلاثة أسبابٍ للرفض، وكلٌّ منها يُفسد البحث بطريقته:
 *
 *   القصير يُطابق كلّ شيء، والعامّ يُطابق نصف الجدول، والمكرَّر يضيف
 *   شرطاً لا يُضيّق ويكلّف مسحَ فهرسٍ ثالثاً.
 */
export function cleanAdditions(suggested: unknown, existing: string[]): string[] {
  if (!Array.isArray(suggested)) return [];

  const seen = new Set(existing.map((term) => normalizeForSearch(term)));
  const out: string[] = [];

  for (const raw of suggested) {
    if (out.length >= MAX_ADDED) break;
    if (typeof raw !== 'string') continue;

    const term = raw.replace(/\s+/g, ' ').trim();
    if (term.length < MIN_ADDED_LENGTH || term.length > 60) continue;

    const key = normalizeForSearch(term);
    if (key.length < MIN_ADDED_LENGTH) continue;
    if (TOO_GENERIC.has(key)) continue;
    if (seen.has(key)) continue;

    seen.add(key);
    out.push(term);
  }

  return out.slice(0, Math.max(0, MAX_ALTERNATIVES - existing.length));
}

const schema = z.object({
  groups: z.array(z.object({ related: z.array(z.string()) })),
});

/*
 * التعليمات.
 *
 * مكتوبةٌ هنا صراحةً لتُراجَع كنصّ. وأكثرها نهيٌ لا أمر: النموذج
 * المتروك يميل إلى التفسير والتعميم، وكلاهما يُفسد قائمة بحث.
 */
const PROMPT = `أنت تساعد في توسيع بحثٍ داخل منصّة رصد إعلامي سورية.

يصلك لكلّ شرطٍ من شروط البحث مجموعةُ ألفاظٍ كتبها الموظّف. أعد لكلّ
مجموعة ألفاظاً **أخرى يُرجَّح ورودُها في منشورٍ عن الموضوع نفسه**.

★ قواعد لا تُخالَف:

١) ألفاظاً تُكتب في المنشورات لا تعريفاتٍ ولا شروحاً. «تقنين» نعم،
   «انقطاع التيار الكهربائي بسبب نقص الوقود» لا.

٢) ولا ألفاظاً عامّة تُطابق كلّ شيء: «الناس»، «اليوم»، «الوضع»،
   «المواطنين»، «سوريا»، «خبر». واحدةٌ منها تُبطل الشرط كلّه.

٣) ولا ترجمةً ولا مرادفاً فصيحاً لا يُكتب: اكتب ما يكتبه الناس فعلاً،
   بالعامية الشامية حين تكون هي الشائعة.

٤) ومن اللفظ نفسه: صيغُه الشائعة («كهرباء» ← «كهربا»)، وما يلازمه
   («كهرباء» ← «تقنين»، «مولدة»، «أمبير»)، وما يدلّ عليه بلا ذكره
   («كهرباء» ← «عتمة»).

٥) ستّة ألفاظ على الأكثر لكلّ مجموعة، وكلمةٌ أو كلمتان لكلٍّ منها.
   والقلّة الدقيقة خيرٌ من الكثرة الواسعة.

٦) وإن لم تجد ما يُضاف فأعد مصفوفةً فارغة — الفراغ جوابٌ صحيح.

أعد JSON وحده بالشكل: {"groups":[{"related":["…"]}]} — مجموعةٌ لكلّ
مجموعةٍ وردتك، بالترتيب نفسه.`;

/**
 * توسيع سطر البحث.
 *
 * ★ ولا يرمي أبداً.
 *
 *   التوسيع تحسينٌ لا شرط: لو تعذّر — بلا مفتاح، أو بانقطاع، أو بجوابٍ
 *   لا يُقرأ — وجب أن يبحث الموظّف بكلماته كما كتبها. ورميُ الخطأ هنا
 *   يحوّل عطباً في خدمةٍ خارجية إلى شاشةٍ لا تبحث.
 */
export async function expandSearch(raw: string): Promise<ExpansionResult> {
  const parsed = parseSearchTerms(raw);
  if (parsed.include.length === 0) return { query: raw.trim(), added: [], source: 'none' };

  const key = expansionCacheKey(raw);

  const cached = await readCache(key);
  if (cached) {
    return { query: buildExpandedQuery(parsed, cached), added: cached, source: 'cache' };
  }

  const additions = await askModel(parsed);
  if (additions.every((group) => group.length === 0)) {
    return { query: raw.trim(), added: additions, source: 'none' };
  }

  await writeCache(key, additions);
  return { query: buildExpandedQuery(parsed, additions), added: additions, source: 'model' };
}

/*
 * Redis يُستورد عند أوّل استعمال لا عند تحميل الوحدة.
 *
 * ★ والفرق ليس أسلوبياً: `@/lib/redis` يجرّ `@/lib/env`، وذاك يرمي عند
 *   التحميل إن نقص متغيّر. فاستيرادٌ في الأعلى يجعل هذه الوحدة — وكلّ
 *   ما يستوردها، ومنه فحصُ البحث النقيّ — تحتاج قاعدةً ومفتاحاً لتُقرأ
 *   دالّةٌ خالصة فيها. وهو ما وقع فعلاً: سقط `verify:search` بعد أن
 *   كان يعمل بلا بيئة.
 *
 *   وهي القاعدة نفسها التي يحرسها `verify:build-safety` في بقية
 *   المشروع — وُضعت بعد أن أسقط Redis بناءَ الإنتاج مرّة.
 */
async function readCache(key: string): Promise<string[][] | null> {
  try {
    const { getRedis } = await import('@/lib/redis');
    const raw = await getRedis().get(key);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return null;
    return value.map((group) => (Array.isArray(group) ? group.filter((t) => typeof t === 'string') : []));
  } catch {
    // الذاكرة المؤقتة تحسينٌ لا شرط — وغيابُها يعني استدعاءً إضافياً لا عطلاً
    return null;
  }
}

async function writeCache(key: string, additions: string[][]): Promise<void> {
  try {
    const { getRedis } = await import('@/lib/redis');
    await getRedis().setex(key, CACHE_TTL_SECONDS, JSON.stringify(additions));
  } catch {
    // كما أعلاه
  }
}

async function askModel(parsed: ParsedSearch): Promise<string[][]> {
  const empty = parsed.include.map(() => [] as string[]);
  try {
    // الاستيراد هنا لا في الأعلى: الوحدة تُحمَّل في مسارات لا مفتاح فيها
    const { generateAssistantResponse } = await import('@/lib/assistant/openai');

    const listing = parsed.include
      .map((group, index) => `${index + 1}) ${describeGroup(group)}`)
      .join('\n');

    const { content } = await generateAssistantResponse([
      { role: 'system', content: PROMPT },
      { role: 'user', content: listing },
    ]);

    const parsedJson: unknown = JSON.parse(stripFence(content));
    const result = schema.safeParse(parsedJson);
    if (!result.success) return empty;

    return parsed.include.map((group, index) =>
      cleanAdditions(result.data.groups[index]?.related, group),
    );
  } catch {
    return empty;
  }
}

/** النموذج يلفّ JSON بسياج ```json أحياناً رغم النهي */
function stripFence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith('```')) return trimmed;
  return trimmed.replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
}

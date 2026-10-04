/**
 * فحص البحث بعدّة كلمات.
 *
 * ★ خطأ القارئ لا يظهر خطأً — يظهر نتيجةً.
 *
 *   حدٌّ سقط بصمت يعني جدولاً أوسع ممّا طُلب، وعلامة تنصيص لم تُفهم تعني
 *   بحثاً عن كلمةٍ فيها علامة. وكلاهما يُقرأ على أنّه الجواب، لأنّ
 *   الموظّف لا يملك ما يقارن به. فتُفحص القراءة على سطورٍ حقيقية، ويُفحص
 *   في الشيفرة أنّ الشاشة تعرض ما فُهم وأنّ النفي نفيٌ صحيح.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  countTerms,
  describeGroup,
  hasMultipleTerms,
  MAX_ALTERNATIVES,
  MAX_SEARCH_GROUPS,
  MAX_SEARCH_TERMS,
  parseSearchTerms,
} from '../src/lib/domain/search-terms';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

/** قراءة الشيفرة بلا تعليقاتها — ملفّات هذا المشروع تشرح ما لا تفعله */
const readCode = (path: string) =>
  read(path)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

const checks: { name: string; ok: boolean; detail?: string }[] = [];
function check(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
}

const same = (a: string[], b: string[]) =>
  a.length === b.length && a.every((value, index) => value === b[index]);

/*
 * مقارنةُ مجموعات — والحدّ المفرد مجموعةٌ من واحد.
 *
 * فالتوكيدات القديمة تُكتب كما كانت: `flat(['الداخلية'])` تقارن بنيةً
 * من مجموعةٍ واحدة بعنصر. ولولا ذلك لوجب إعادة كتابة أربعين توكيداً
 * لتغيّرٍ لا يمسّ معناها.
 */
const flat = (terms: string[]): string[][] => terms.map((term) => [term]);
const sameGroups = (a: string[][], b: string[][]) =>
  a.length === b.length && a.every((group, index) => same(group, b[index] ?? []));

// ══════════════ الكلمة الواحدة لا تتغيّر ══════════════

/*
 * أهمّ فحص في الملفّ.
 *
 * البحث بكلمةٍ واحدة أكثر ما يقع، وتغيير سلوكه ثمنٌ لا يقابله شيء: من
 * كان يجد نتائجه أمس يجب أن يجدها اليوم بلا أن يتعلّم قاعدةً جديدة.
 */
const one = parseSearchTerms('الداخلية');
check('الكلمة الواحدة حدٌّ واحد', sameGroups(one.include, flat(['الداخلية'])) && one.exclude.length === 0);
check('ولا يُعرض لها خيار نمط', !hasMultipleTerms(one));
check('والمسافات حولها تُقتصّ', sameGroups(parseSearchTerms('   الداخلية  ').include, flat(['الداخلية'])));
check('والفارغ لا شيء', parseSearchTerms('').include.length === 0);
check('والمعدوم لا شيء', parseSearchTerms(undefined).include.length === 0);
check('والمسافات وحدها لا شيء', parseSearchTerms('    ').include.length === 0);

// ══════════════ التعدّد ══════════════

const many = parseSearchTerms('وزارة الكهرباء انقطاع');
check('ثلاث كلمات ثلاثة حدود', sameGroups(many.include, flat(['وزارة', 'الكهرباء', 'انقطاع'])));
check('ويُعرض لها خيار النمط', hasMultipleTerms(many));

// ══════════════ العبارة ══════════════

/*
 * بلا عبارة لا تصحّ الميزة.
 *
 * «وزارة الكهرباء» تحت اشتراط كل الكلمات تُطابق منشوراً فيه «وزارة
 * الصحة» و«انقطاع الكهرباء» ولا ذكر فيه للوزارة المقصودة — وهو جوابٌ
 * خاطئ يبدو صحيحاً.
 */
check(
  'العبارة بين علامتَي التنصيص حدٌّ واحد',
  sameGroups(parseSearchTerms('"وزارة الكهرباء"').include, flat(['وزارة الكهرباء'])),
);
check(
  'والعلامتان العربيتان كذلك',
  sameGroups(parseSearchTerms('«وزارة الكهرباء»').include, flat(['وزارة الكهرباء'])),
  'لوحة المفاتيح العربية تُنتجهما، ورفضُهما يجعل الميزة لمن يكتب بالإنجليزية وحده',
);
check(
  'والعبارة تجتمع مع الكلمة',
  sameGroups(parseSearchTerms('"وزارة الكهرباء" انقطاع').include, flat(['وزارة الكهرباء', 'انقطاع'])),
);
check(
  'ومسافات العبارة تُوحَّد',
  sameGroups(parseSearchTerms('"وزارة   الكهرباء"').include, flat(['وزارة الكهرباء'])),
);
check(
  'والعلامة الشاردة تُزال ولا تُبحث',
  sameGroups(parseSearchTerms('"الداخلية').include, flat(['الداخلية'])),
  'بحثٌ عن «"الداخلية» لا يُطابق شيئاً أبداً، والموظّف يقرأ الصفر جواباً',
);

// ══════════════ الاستبعاد ══════════════

const minus = parseSearchTerms('الداخلية -العراقية');
check('الناقص يستبعد', sameGroups(minus.include, flat(['الداخلية'])) && same(minus.exclude, ['العراقية']));
check(
  'ويستبعد عبارة',
  same(parseSearchTerms('الداخلية -"وزارة الداخلية العراقية"').exclude, [
    'وزارة الداخلية العراقية',
  ]),
);
check(
  'والناقص داخل الكلمة ليس استبعاداً',
  sameGroups(parseSearchTerms('covid-19').include, flat(['covid-19'])),
  'الاستبعاد علامةٌ في أوّل الحدّ لا حرفٌ في وسطه',
);
check('والناقص وحده يُهمَل', parseSearchTerms('-').include.length === 0);

// ══════════════ الحدود المُسقَطة ══════════════

const short = parseSearchTerms('الداخلية و');
check('الحرف الواحد يُسقَط', sameGroups(short.include, flat(['الداخلية'])));
check(
  'ويُذكر في المُسقَط',
  same(short.dropped, ['و']),
  'ما يُسقَط بصمت يُقرأ على أنّه بُحث به، فتُقرأ نتيجةٌ أوسع على أنّها المطلوب',
);

const repeated = parseSearchTerms('الأسد الاسد');
check(
  'والمكرَّر بفارق الهمزة يُحفظ مرّة',
  sameGroups(repeated.include, flat(['الأسد'])) && same(repeated.dropped, ['الاسد']),
);
check(
  'والصورة الأولى تُحفظ كما كُتبت',
  repeated.include[0]?.[0] === 'الأسد',
  'التطبيع للمقارنة لا للبحث — والمطابقة في القاعدة على النصّ كما هو',
);

const long = parseSearchTerms(`الداخلية "${'ا'.repeat(80)}"`);
check('والأطول من الحدّ يُسقَط', sameGroups(long.include, flat(['الداخلية'])) && long.dropped.length === 1);

const overflow = parseSearchTerms(
  Array.from({ length: MAX_SEARCH_GROUPS + 4 }, (_, index) => `كلمة${index}`).join(' '),
);
check(
  `والمجموعات تتوقّف عند ${MAX_SEARCH_GROUPS}`,
  overflow.include.length === MAX_SEARCH_GROUPS,
  'كل مجموعة شرطٌ مستقلّ، وسطرٌ بلا حدّ يُثقل القاعدة بلا فائدة',
);

// ══════════════ المرادفات — مجموعةٌ واحدة بـ«أو» ══════════════

/*
 * ★ هذه هي الإضافة التي تجعل البحث يبلغ موضوعاً لا كلمة.
 *
 *   الموضوع عائلتان تجتمعان: («كهرباء» أو «تيار») مع («انقطاع» أو
 *   «تقنين»). و«كلّها» تطلب الأربع مجتمعةً فلا تجد شيئاً، و«أيّها» تقبل
 *   أيّةَ واحدة فتعيد كلّ ما فيه «تقنين» من أيّ سياق. وكلاهما جوابٌ
 *   خاطئ يبدو معقولاً.
 */
const synonyms = parseSearchTerms('كهرباء|تيار انقطاع|تقنين');
check(
  'الفاصل يصنع مجموعةَ مرادفات',
  sameGroups(synonyms.include, [
    ['كهرباء', 'تيار'],
    ['انقطاع', 'تقنين'],
  ]),
  'بلا مجموعات لا يُعبَّر عن موضوع: «كلّها» تطلب الأربع و«أيّها» تقبل أيّة واحدة',
);
check('وعددُ الحدود يُحسب مبسوطاً', countTerms(synonyms) === 4);
check(
  'والمجموعة تُعرض بـ«أو» لا بالفاصل',
  describeGroup(['كهرباء', 'تيار']) === 'كهرباء أو تيار',
  'من رأى `|` في شريحة يظنّه جزءاً من كلمته',
);
check(
  'والعبارة تكون مرادفاً',
  sameGroups(parseSearchTerms('"وزارة الكهرباء"|كهرباء').include, [
    ['وزارة الكهرباء', 'كهرباء'],
  ]),
);
check(
  'والاستبعاد يُسطَّح ولا يُجمَّع',
  same(parseSearchTerms('كهرباء -مزحة|نكتة').exclude, ['مزحة', 'نكتة']),
  'من استبعد اثنين يريد إخراج كليهما لا إخراج من جمعهما',
);
check(
  'والمرادف الفارغ لا يصنع مجموعةً فارغة',
  sameGroups(parseSearchTerms('كهرباء||تيار').include, [['كهرباء', 'تيار']]),
);
check(
  'والفاصل وحده لا شيء',
  parseSearchTerms('|').include.length === 0,
);
check(
  'والمكرَّر بين المجموعات يُسقَط مرّةً واحدة',
  sameGroups(parseSearchTerms('كهرباء|تيار كهرباء|تقنين').include, [
    ['كهرباء', 'تيار'],
    ['تقنين'],
  ]),
  'لا يُبنى شرطٌ على حدٍّ تحقّق في مجموعةٍ قبله',
);

const wideGroup = parseSearchTerms(
  Array.from({ length: MAX_ALTERNATIVES + 3 }, (_, index) => `مرادف${index}`).join('|'),
);
check(
  `والمرادفات تتوقّف عند ${MAX_ALTERNATIVES}`,
  (wideGroup.include[0] ?? []).length === MAX_ALTERNATIVES,
);

const flood = parseSearchTerms(
  Array.from({ length: MAX_SEARCH_GROUPS }, (_, group) =>
    Array.from({ length: MAX_ALTERNATIVES }, (_, alt) => `ك${group}ر${alt}`).join('|'),
  ).join(' '),
);
check(
  `والسطر كلّه لا يتجاوز ${MAX_SEARCH_TERMS} حدّاً`,
  countTerms(flood) === MAX_SEARCH_TERMS,
  'ثماني مجموعاتٍ بعشرة مرادفات تعني ثمانين شرط LIKE في استعلامٍ واحد',
);

// ══════════════ بناء الشرط ══════════════

const queries = readCode('src/lib/queries/posts.ts');

check(
  'السطر لا يُطابَق كتلةً واحدة',
  !/const term = filters\.q\.trim\(\)/.test(queries),
  'من كتب «وزارة الكهرباء انقطاع» لا يجد شيئاً، لأنّ لا منشور فيه هذه الحروف متتالية',
);
check(
  'واشتراط الكلّ اجتماعُ شروط — واحدٌ لكلّ مجموعة',
  /where\.AND = parsed\.include\.map\(groupCondition\)/.test(queries) &&
    /OR: group\.flatMap\(searchFields\)/.test(queries),
  'المجموعة شرطٌ واحد يتحقّق بأيّ مرادفٍ فيها',
);
check(
  'وقبول أيٍّ منها يُسطّح المجموعات',
  /where\.OR = parsed\.include\.flat\(\)\.flatMap\(searchFields\)/.test(queries),
  'الفرق بين مجموعةٍ ومجموعة يسقط حين يكفي أيٌّ منها — وتركُها مجموعاتٍ يبني شرطاً لا معنى له',
);
check(
  'والاستبعاد نفيٌ لاجتماعها لا اجتماعُ نفيَيْها',
  /where\.NOT = \{ OR: parsed\.exclude\.flatMap\(searchFields\) \}/.test(queries),
  'NOT بمصفوفة في Prisma تعني «ليس (أ و ب) معاً»، فتمرّ منشورات فيها أحدهما',
);
/*
 * ★ وهذا التوكيد كان يمرّ بعد أن فقد معناه.
 *
 *   كان يبحث عن `authorName` و`hashtags` و`detectedKeywords` في ملفّ
 *   الاستعلامات. وبعد أن جُمعت الأربعة في `searchText` لم يبقَ لها ذكرٌ
 *   في `searchFields` — ومع ذلك بقي يمرّ، لأنّ أسماءها ترد في الملفّ
 *   لأسبابٍ أخرى (فلتر الهاشتاغ، وقائمة الحقول المعروضة). فتوكيدٌ يقرأ
 *   اسماً في ملفّ لا يفحص شيئاً.
 *
 *   والمقصود أنّ الحدّ يُطابَق في مواضعه الأربعة — وموضعُها اليوم
 *   `buildSearchText`، فيُفحص هناك.
 */
const textLib = readCode('src/lib/analysis/text.ts');
check(
  'والمواضع الأربعة مجموعةٌ في نصّ البحث',
  /post\.text \?\? ''/.test(textLib) &&
    /post\.authorName \?\? ''/.test(textLib) &&
    /post\.hashtags \?\? \[\]/.test(textLib) &&
    /post\.detectedKeywords \?\? \[\]/.test(textLib),
  'الموظّف لا يعرف أين وردت كلمته، وسؤاله «أين تبحث؟» نقلٌ للعمل إليه',
);
/*
 * ★ واسم الحساب خرج من البحث النصّي — بقياسٍ لا بتبسيط.
 *
 *   هو في جدولٍ آخر، فشرطُه يُجبر المخطِّط على مسح جدول المنشورات كلّه:
 *   بوّابةُ `OR` بين عمودٍ مفهرس وجدولٍ آخر لا تُبنى بخريطة بتّات.
 *   والقياس على خمسين ألف منشور — عدُّ نتائج بحثٍ بمرادفين — كان ٣٥١٦
 *   صفحة و٣٦ مللي ثانية بالفرع، و١١٤ صفحة و٠٫٧ مللي ثانية بدونه.
 *
 *   وخروجُه لا يكون صامتاً: الشاشة تقترح فلتر الحساب على من كتب اسماً
 *   يطابق حساباً، فلا يُترك أمام نتيجةٍ فارغة لا يفهم سببها.
 */
check(
  'واسم الحساب لا يُجرّ في الاستعلام النصّي',
  !/account: \{ name: \{ contains: term/.test(queries),
  'شرطٌ على جدولٍ آخر داخل OR يُبطل فهرس الثلاثيّات ويُحيل كلّ بحثٍ إلى مسحٍ كامل',
);
check(
  'والمطابقة مطبَّعةٌ على مطبَّع',
  /searchText: \{ contains: normalizeForSearch\(term\) \}/.test(queries),
  'المنصّة تطبّع عند الاستيراد، فالكلمة التي ربطت المنشور لا يجدها من كتبها في الشاشة',
);

// ══════════════ الواجهة ══════════════

const bar = readCode('src/components/filters/filter-bar.tsx');

check(
  'الشاشة تقرأ السطر بالقارئ نفسه',
  /parseSearchTerms\(searchInput\)/.test(bar),
  'قارئان يعنيان أن يُعرض غير ما يُبحث — وهو أسوأ من ألّا يُعرض شيء',
);
check('وتعرض ما فُهم قبل الضغط', /parsed\.include\.map/.test(bar));
check(
  'والشاشة تقترح فلتر الحساب بدلاً عنه',
  /accountHint/.test(bar) && /accountId: accountHint\.id/.test(bar),
  'الإخراج الصامت يترك من كتب اسم حسابٍ أمام نتيجةٍ لا يفهم سببها',
);

check(
  'وتعرض المُسقَط كذلك',
  /parsed\.dropped\.length > 0/.test(bar),
  'الصمت عمّا أُسقط يجعل النتيجة الأوسع تُقرأ على أنّها المطلوبة',
);
check(
  'وخيار النمط لا يظهر على كلمةٍ واحدة',
  /parsed\.include\.length > 1 &&/.test(bar),
  'خيارٌ بلا أثر يشغل العين ويُعلّم الموظّف أن يتجاهل ما في الشريط',
);
check(
  'والنمط يُثبّت الكلمات معه',
  /function apply\(mode[\s\S]{0,200}?q: searchInput\.trim\(\), qMode: mode/.test(bar),
  'تبديل النمط وحده يطبّقه على كلماتٍ قديمة، فتتغيّر النتيجة بما لا يفسّره ما في الحقل',
);
check(
  'والنمط لا يُعدّ فلتراً بذاته',
  !/if \(filters\.qMode\)[\s\S]{0,40}?count \+= 1/.test(bar),
);

// ══════════════ المساعد ══════════════

const tools = readCode('src/lib/assistant/tools.ts');
check(
  'المساعد يبحث بالقارئ نفسه',
  /postSearchWhere\(args\.query, args\.queryMode\)/.test(tools),
  'لو اختلف بحثه عن بحث صاحبه لأجاب بأن لا شيء عمّا يراه صاحبه في الجدول',
);

// ══════════════ النتيجة ══════════════

const failed = checks.filter((item) => !item.ok);

console.log('\n>> فحص البحث بعدّة كلمات\n');
for (const item of checks) {
  console.log(`  ${item.ok ? '✓' : '✗'} ${item.name}`);
  if (!item.ok && item.detail) console.log(`      ${item.detail}`);
}

console.log(`\n${checks.length - failed.length}/${checks.length} فحصاً ناجحاً`);
if (failed.length > 0) {
  console.log(`\n✗ ${failed.length} فحصاً فاشلاً\n`);
  process.exit(1);
}
console.log('');

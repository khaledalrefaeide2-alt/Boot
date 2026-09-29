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
  hasMultipleTerms,
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

// ══════════════ الكلمة الواحدة لا تتغيّر ══════════════

/*
 * أهمّ فحص في الملفّ.
 *
 * البحث بكلمةٍ واحدة أكثر ما يقع، وتغيير سلوكه ثمنٌ لا يقابله شيء: من
 * كان يجد نتائجه أمس يجب أن يجدها اليوم بلا أن يتعلّم قاعدةً جديدة.
 */
const one = parseSearchTerms('الداخلية');
check('الكلمة الواحدة حدٌّ واحد', same(one.include, ['الداخلية']) && one.exclude.length === 0);
check('ولا يُعرض لها خيار نمط', !hasMultipleTerms(one));
check('والمسافات حولها تُقتصّ', same(parseSearchTerms('   الداخلية  ').include, ['الداخلية']));
check('والفارغ لا شيء', parseSearchTerms('').include.length === 0);
check('والمعدوم لا شيء', parseSearchTerms(undefined).include.length === 0);
check('والمسافات وحدها لا شيء', parseSearchTerms('    ').include.length === 0);

// ══════════════ التعدّد ══════════════

const many = parseSearchTerms('وزارة الكهرباء انقطاع');
check('ثلاث كلمات ثلاثة حدود', same(many.include, ['وزارة', 'الكهرباء', 'انقطاع']));
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
  same(parseSearchTerms('"وزارة الكهرباء"').include, ['وزارة الكهرباء']),
);
check(
  'والعلامتان العربيتان كذلك',
  same(parseSearchTerms('«وزارة الكهرباء»').include, ['وزارة الكهرباء']),
  'لوحة المفاتيح العربية تُنتجهما، ورفضُهما يجعل الميزة لمن يكتب بالإنجليزية وحده',
);
check(
  'والعبارة تجتمع مع الكلمة',
  same(parseSearchTerms('"وزارة الكهرباء" انقطاع').include, ['وزارة الكهرباء', 'انقطاع']),
);
check(
  'ومسافات العبارة تُوحَّد',
  same(parseSearchTerms('"وزارة   الكهرباء"').include, ['وزارة الكهرباء']),
);
check(
  'والعلامة الشاردة تُزال ولا تُبحث',
  same(parseSearchTerms('"الداخلية').include, ['الداخلية']),
  'بحثٌ عن «"الداخلية» لا يُطابق شيئاً أبداً، والموظّف يقرأ الصفر جواباً',
);

// ══════════════ الاستبعاد ══════════════

const minus = parseSearchTerms('الداخلية -العراقية');
check('الناقص يستبعد', same(minus.include, ['الداخلية']) && same(minus.exclude, ['العراقية']));
check(
  'ويستبعد عبارة',
  same(parseSearchTerms('الداخلية -"وزارة الداخلية العراقية"').exclude, [
    'وزارة الداخلية العراقية',
  ]),
);
check(
  'والناقص داخل الكلمة ليس استبعاداً',
  same(parseSearchTerms('covid-19').include, ['covid-19']),
  'الاستبعاد علامةٌ في أوّل الحدّ لا حرفٌ في وسطه',
);
check('والناقص وحده يُهمَل', parseSearchTerms('-').include.length === 0);

// ══════════════ الحدود المُسقَطة ══════════════

const short = parseSearchTerms('الداخلية و');
check('الحرف الواحد يُسقَط', same(short.include, ['الداخلية']));
check(
  'ويُذكر في المُسقَط',
  same(short.dropped, ['و']),
  'ما يُسقَط بصمت يُقرأ على أنّه بُحث به، فتُقرأ نتيجةٌ أوسع على أنّها المطلوب',
);

const repeated = parseSearchTerms('الأسد الاسد');
check(
  'والمكرَّر بفارق الهمزة يُحفظ مرّة',
  same(repeated.include, ['الأسد']) && same(repeated.dropped, ['الاسد']),
);
check(
  'والصورة الأولى تُحفظ كما كُتبت',
  repeated.include[0] === 'الأسد',
  'التطبيع للمقارنة لا للبحث — والمطابقة في القاعدة على النصّ كما هو',
);

const long = parseSearchTerms(`الداخلية "${'ا'.repeat(80)}"`);
check('والأطول من الحدّ يُسقَط', same(long.include, ['الداخلية']) && long.dropped.length === 1);

const overflow = parseSearchTerms('أ1 ب2 ج3 د4 هـ5 و6 ز7 ح8 ط9 ي10');
check(
  `والحدود تتوقّف عند ${MAX_SEARCH_TERMS}`,
  overflow.include.length + overflow.exclude.length === MAX_SEARCH_TERMS,
  'كل حدّ استعلامٌ فرعيّ على خمسة حقول، وسطرٌ بلا حدّ يُثقل القاعدة بلا فائدة',
);

// ══════════════ بناء الشرط ══════════════

const queries = readCode('src/lib/queries/posts.ts');

check(
  'السطر لا يُطابَق كتلةً واحدة',
  !/const term = filters\.q\.trim\(\)/.test(queries),
  'من كتب «وزارة الكهرباء انقطاع» لا يجد شيئاً، لأنّ لا منشور فيه هذه الحروف متتالية',
);
check(
  'واشتراط الكلّ اجتماعُ شروط',
  /where\.AND = parsed\.include\.map\(\(term\) => \(\{ OR: searchFields\(term\) \}\)\)/.test(queries),
);
check(
  'وقبول أيٍّ منها شرطٌ واحد موسَّع',
  /where\.OR = parsed\.include\.flatMap\(searchFields\)/.test(queries),
);
check(
  'والاستبعاد نفيٌ لاجتماعها لا اجتماعُ نفيَيْها',
  /where\.NOT = \{ OR: parsed\.exclude\.flatMap\(searchFields\) \}/.test(queries),
  'NOT بمصفوفة في Prisma تعني «ليس (أ و ب) معاً»، فتمرّ منشورات فيها أحدهما',
);
check(
  'والحقول الخمسة باقية',
  /authorName/.test(queries) && /hashtags/.test(queries) && /detectedKeywords/.test(queries),
  'الموظّف لا يعرف أين وردت كلمته، وسؤاله «أين تبحث؟» نقلٌ للعمل إليه',
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

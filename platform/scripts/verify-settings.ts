/**
 * فحص شاشة الإعدادات ومصدر قيمها.
 *
 *   npm run verify:settings
 *
 * هذا الملف جاء من عطبٍ بقي شهراً بلا أن ينتبه إليه أحد: تسعةُ إعدادات
 * أساسية — اسم المنصة، واسم الجهة، وسقوف الاستخراج، وحدود التنبيهات —
 * كانت في `prisma/seed.ts` وحده. والإنتاج يشغّل `prisma migrate deploy`
 * ولا يشغّل البذور، فبقي جدول `settings` هناك بلا صفوفها.
 *
 * ولم يتعطّل شيء: كلّ قارئ في الخادم يحمل قيمةً افتراضية في الشيفرة،
 * فاسمُ المنصة يظهر صحيحاً والسقوف تعمل. وإنما تُفتح شاشة الإعدادات في
 * الإنتاج فلا يجد صاحب المنصة صفّاً واحداً يُعدّله.
 *
 * ★ والقاعدة التي يحرسها هذا الملف: الإعداد الذي لا يُبذر في ترحيل لا
 *   وجود له في الإنتاج. البذور للتطوير، والترحيل هو ما يصل.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p: string) => readFileSync(path.join(root, p), 'utf8');

const SEED = read('prisma/seed.ts');
const CLIENT = read('src/app/(admin)/admin/settings/settings-client.tsx');
const ROUTE = read('src/app/api/settings/route.ts');

const migrationsDir = path.join(root, 'prisma/migrations');
const MIGRATIONS = readdirSync(migrationsDir)
  .filter((entry) => !entry.endsWith('.toml'))
  .map((entry) => ({
    name: entry,
    sql: readFileSync(path.join(migrationsDir, entry, 'migration.sql'), 'utf8'),
  }));

const checks: { name: string; ok: boolean; detail?: string }[] = [];
function check(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
}

/** كل ملفّات المصدر — لفحص ما لا يجوز أن يُكتب في الشيفرة */
function tsFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) tsFiles(full, out);
    else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) out.push(full);
  }
  return out;
}

// ══════════════ كل إعداد يصل الإنتاج ══════════════

/** كتلة `SETTINGS` في ملفّ البذور — هي كتالوج المفاتيح المعتمد */
const seedBlock = SEED.match(/const SETTINGS = \[([\s\S]*?)\n\];/)?.[1] ?? '';
const seedKeys = [...seedBlock.matchAll(/key: '([^']+)'/g)].map((m) => m[1] as string);

check('كتالوج البذور مقروء', seedKeys.length > 0, `${seedKeys.length} مفتاحاً`);

/** الترحيلات التي تبذر إعدادات — والمفاتيح التي تحملها */
const settingMigrations = MIGRATIONS.filter((m) => /INSERT INTO "settings"/.test(m.sql));
const migratedKeys = new Set<string>();
for (const migration of settingMigrations) {
  for (const key of seedKeys) {
    if (migration.sql.includes(`'${key}'`)) migratedKeys.add(key);
  }
}

const missing = seedKeys.filter((key) => !migratedKeys.has(key));
check(
  `كل مفتاح في البذور مبذورٌ في ترحيل (${seedKeys.length} مفتاحاً)`,
  missing.length === 0,
  missing.length > 0
    ? `لا يصل الإنتاج: ${missing.join('، ')}`
    : `${settingMigrations.length} ترحيلاً يبذر إعدادات`,
);

/*
 * والاتجاه الآخر: مفتاحٌ في ترحيل وليس في البذور.
 *
 * أثره معكوس وأخفى: يعمل في الإنتاج ولا وجود له في التطوير، فيُبنى عليه
 * منطقٌ لا يُختبر محلياً أبداً — ويبقى ملفّ البذور ناقصاً ككتالوج.
 *
 * ★ والمفتاح المتقاعد ليس شارداً.
 *
 *   إعدادٌ بُذر ثمّ حذفه ترحيلٌ لاحق (`DELETE FROM "settings"`) لا وجود
 *   له في القاعدة بعد تطبيق الترحيلات كلها، فغيابه عن البذور هو الصواب
 *   لا النقص. وبدون هذا الاستثناء يصير الفحص عائقاً أمام التقاعد نفسه:
 *   يرسب على التنظيف الصحيح، فيُعلَّم تجاهله — ويصمت يوم يقع الشرود
 *   الحقيقي.
 */
const retiredKeys = new Set<string>();
for (const migration of MIGRATIONS) {
  for (const m of migration.sql.matchAll(
    /DELETE FROM "settings"[\s\S]*?"key"\s*=\s*'([^']+)'/g,
  )) {
    retiredKeys.add(m[1] as string);
  }
}

const strayKeys: string[] = [];
for (const migration of settingMigrations) {
  const inserts = [...migration.sql.matchAll(/INSERT INTO "settings"[\s\S]*?ON CONFLICT/g)];
  for (const insert of inserts) {
    for (const m of insert[0].matchAll(/\(\s*\n?\s*'([a-z]+\.[A-Za-z]+)',/g)) {
      const key = m[1] as string;
      if (!seedKeys.includes(key) && !retiredKeys.has(key)) {
        strayKeys.push(`${migration.name}: ${key}`);
      }
    }
  }
}
check(
  'ولا مفتاح في ترحيل غائب عن البذور',
  strayKeys.length === 0,
  strayKeys.length > 0
    ? strayKeys.join(' · ')
    : `الكتالوجان متطابقان${retiredKeys.size > 0 ? ` (و${retiredKeys.size} مفتاحاً متقاعداً)` : ''}`,
);

/*
 * والترحيل لا يكتب فوق اختيار صاحب المنصة.
 *
 * `ON CONFLICT DO NOTHING` هو ما يجعل بذر الإعدادات آمناً في ترحيل: بدونه
 * يُعيد كلّ نشرٍ السقفَ اليومي إلى ٣٠٠٠ بعد أن خفضه صاحب المنصة إلى ٥٠٠ —
 * صامتاً، وفي كل نشرة.
 */
const overwriting = settingMigrations
  .filter((m) => !/ON CONFLICT \("key"\) DO NOTHING/.test(m.sql))
  .map((m) => m.name);
check(
  'وبذرُ الإعدادات لا يكتب فوق ما عُدّل',
  overwriting.length === 0,
  overwriting.length > 0 ? overwriting.join('، ') : 'كلها ON CONFLICT DO NOTHING',
);

/*
 * ★ وقيمة `::jsonb` تُفحص بالتحليل لا بالنظر.
 *
 *   العمود JSON، فالنصّ يجب أن يُكتب مقتبساً داخل القيمة:
 *   `'"اسم"'::jsonb` صحيحة و`'اسم'::jsonb` خطأٌ يرفضه Postgres. والخطأ
 *   لا يظهر في مراجعة ولا في بناء — يظهر لحظة `migrate deploy` في
 *   الإنتاج، فيسقط الترحيل وتتوقّف الخدمة على نصف ترقية.
 */
const badJson: string[] = [];
let jsonLiterals = 0;
for (const migration of settingMigrations) {
  for (const m of migration.sql.matchAll(/'((?:[^']|'')*)'::jsonb/g)) {
    jsonLiterals += 1;
    const literal = (m[1] as string).replace(/''/g, "'");
    try {
      JSON.parse(literal);
    } catch {
      badJson.push(`${migration.name}: ${literal.slice(0, 40)}`);
    }
  }
}
check(
  `وكل قيمة ::jsonb تُحلَّل JSON صحيحاً (${jsonLiterals} قيمة)`,
  badJson.length === 0,
  badJson.length > 0 ? badJson.join(' · ') : undefined,
);

// ══════════════ مجموعات الحسابات ══════════════

/*
 * القاعدة نفسها، وقد وقعت هنا أيضاً.
 *
 * المجموعات السبع الأصلية لم يبذرها ترحيلٌ قطّ: ترحيلُ `account_groups`
 * أنشأ الجدول فارغاً، وصفوفُه جاءت من تشغيلٍ يدويّ لـ`setup:db` عند
 * التأسيس. فقاعدةٌ تُبنى من الترحيلات وحدها تقوم بلا مجموعةٍ واحدة —
 * لا فلتر، ولا إسناد حساب، ولا قسمٌ في تقرير.
 */
const groupsBlock = SEED.match(/const ACCOUNT_GROUPS = \[([\s\S]*?)\n\];/)?.[1] ?? '';
const groups = [...groupsBlock.matchAll(/code: '([^']+)', name: '([^']+)', sortOrder: (\d+)/g)].map(
  (m) => ({ code: m[1] as string, name: m[2] as string, order: Number(m[3]) }),
);

check('كتالوج المجموعات مقروء', groups.length > 0, `${groups.length} مجموعة`);

const groupMigrations = MIGRATIONS.filter((m) => /INSERT INTO "account_groups"/.test(m.sql));
const missingGroups = groups.filter(
  (group) => !groupMigrations.some((m) => m.sql.includes(`'${group.code}'`)),
);
check(
  `كل مجموعة مبذورة في ترحيل (${groups.length} مجموعة)`,
  missingGroups.length === 0,
  missingGroups.length > 0
    ? `لا تصل الإنتاج: ${missingGroups.map((g) => g.name).join('، ')}`
    : groups.map((g) => g.name).join('، '),
);
check(
  'وبذرُها لا يكتب فوق ما عُدّل',
  groupMigrations.every((m) => /ON CONFLICT \("code"\) DO NOTHING/.test(m.sql)),
  'من أعاد تسمية مجموعة من الإدارة لا يريد الاسم القديم يعود مع كل نشر',
);

/* الرمز مفتاحٌ فريد، والترتيب لا يتكرّر وإلا صار ترتيب المتساويَين عشوائياً */
check(
  'ولا رمز مكرّر',
  new Set(groups.map((g) => g.code)).size === groups.length,
);
check(
  'ولا ترتيب مكرّر',
  new Set(groups.map((g) => g.order)).size === groups.length,
  groups.map((g) => `${g.order}:${g.name}`).join(' · '),
);

/*
 * ★ ولا رمز مجموعة مكتوب في شيفرة التطبيق.
 *
 *   هذا ما يجعل إضافة مجموعة صفَّاً في القاعدة لا نشرةَ برنامج: الفلاتر
 *   وقائمة الإسناد والتقارير تقرأ الجدول كلّه. وأوّل `code === 'owned'`
 *   يُكتب في مكوّن يكسر ذلك صامتاً — تُضاف المجموعة فلا تظهر حيث كُتب
 *   الشرط، ولا شيء يقول لماذا.
 */
const appSources = tsFiles(path.join(root, 'src'));
const hardcoded: string[] = [];
for (const file of appSources) {
  const text = readFileSync(file, 'utf8');
  for (const group of groups) {
    if (text.includes(`'${group.code}'`)) {
      hardcoded.push(`${path.relative(root, file)} — ${group.code}`);
    }
  }
}
check(
  'ولا رمز مجموعة مكتوب في الشيفرة',
  hardcoded.length === 0,
  hardcoded.length > 0 ? hardcoded.join(' · ') : 'المجموعات تُقرأ من القاعدة كلها',
);

// ══════════════ الشاشة ══════════════

/*
 * القسم بلا تسمية يُعرض بمفتاحه الإنجليزي عنواناً لبطاقة في شاشة عربية.
 * وهذا ما كان: «analysis» و«assistant» منذ أُضيفت إعداداتهما.
 */
const labelsBlock = CLIENT.match(/const CATEGORY_LABELS[^=]*=\s*\{([\s\S]*?)\n\};/)?.[1] ?? '';
const labelled = new Set([...labelsBlock.matchAll(/^\s*([a-z]+):/gm)].map((m) => m[1] as string));
const categories = new Set([...seedBlock.matchAll(/category: '([^']+)'/g)].map((m) => m[1] as string));
const unlabelled = [...categories].filter((c) => !labelled.has(c));
check(
  `كل قسم له تسمية عربية (${categories.size} قسماً)`,
  unlabelled.length === 0,
  unlabelled.length > 0 ? `بلا تسمية: ${unlabelled.join('، ')}` : [...categories].join('، '),
);

/*
 * ★ النعم/لا مفتاحٌ لا صندوق كتابة.
 *
 *   كانت كل القيم تُعرض في `<Input>` نصّياً: `true` كلمةً مكتوبة، ومن
 *   أراد إطفاء ميزة محا الكلمة وكتب `false` بيده. ثم تُحفظ نصّاً فينزلق
 *   نوع العمود — وما أخفى العطب أنّ كل قارئ في الخادم يحمل حرزاً
 *   (`!== 'false'`)، فصمد الحرز وبقيت الواجهة مكسورة.
 */
check(
  'قيمة النعم/لا تُعرض مفتاحاً لا نصّاً',
  /fieldKind\(setting\.value\) === 'boolean' \? \(\s*<Checkbox/.test(CLIENT),
);
check(
  'ونوع الحقل يُشتقّ من نوع القيمة لا من اسم المفتاح',
  /function fieldKind/.test(CLIENT) && /typeof value === 'boolean'/.test(CLIENT),
  'جدول مفاتيح يُنسى تحديثه عند إضافة إعداد',
);
check(
  'والقيمة تُنسخ إلى الحالة بنوعها',
  /typeof setting\.value === 'boolean' \? setting\.value : String/.test(CLIENT),
  '`String(value)` يحوّل boolean إلى نصّ قبل أن يراه المستخدم',
);

/*
 * الحفظ يُرسل ما تغيّر وحده.
 *
 * كان يُرسل الإعدادات كلها في كل ضغطة، فيُكتب في سجلّ التدقيق «تعديل ٢١
 * إعداداً» ويُوسم كل صفّ بالضاغط وبوقت الضغط — فيصير السجلّ عاجزاً عن
 * جواب السؤال الذي وُضع له: «من غيّر السقف اليومي؟».
 */
check(
  'الحفظ يُرسل ما تغيّر وحده',
  /const changed = settings\.filter/.test(CLIENT) && /changed\.map\(\(setting\)/.test(CLIENT),
);
check(
  'والزرّ يُعطَّل بلا تغيير',
  /disabled=\{changed\.length === 0 \|\| errors\.size > 0\}/.test(CLIENT),
);
/*
 * والحقل الرقمي الفارغ خطأٌ لا صفر: `Number('')` صفرٌ في جافاسكربت، فمسحُ
 * «سقف المنشورات في التشغيل» يُحفظ صفراً ويوقف كل استخراج بعده بلا رسالة.
 */
check(
  'والرقم الفارغ خطأٌ لا صفر',
  /function numberError/.test(CLIENT) && /الحقل فارغ/.test(CLIENT),
);

// ══════════════ المسار ══════════════

check(
  'المسار يردّ المفتاح المجهول',
  /إعداد غير معروف/.test(ROUTE) && !/prisma\.setting\.upsert/.test(ROUTE),
  '`upsert` كان يُنشئ صفّاً بلا قسم ولا تسمية، لا يقرأه الخادم أبداً',
);
check(
  'ويردّ القيمة بنوع مختلف',
  /typeof current !== typeof setting\.value/.test(ROUTE),
  'حفظ نصّ «false» فوق قيمة boolean يُبدّل نوع العمود',
);
check(
  'وقراءة الإعدادات وكتابتها محروستان بـSETTINGS_MANAGE',
  (ROUTE.match(/requirePermission\(PERMISSIONS\.SETTINGS_MANAGE\)/g) ?? []).length >= 2,
);
check('والكتابة تتحقّق من CSRF', /requireCsrf\(\)/.test(ROUTE));
check('وتُسجَّل في التدقيق', /AUDIT_ACTIONS\.SETTINGS_UPDATED/.test(ROUTE));

/*
 * والأسرار لا تُخزَّن في الجدول ولا تُعرض في الشاشة.
 *
 * رمز Apify ومفتاح OpenAI يُقرآن من البيئة في الخادم وحده. وصفٌّ واحد
 * منهما في `settings` يعني أنّهما يخرجان في جواب `GET /api/settings`
 * إلى المتصفّح — وهو جوابٌ يراه كلّ من يملك الصلاحية.
 */
const SECRET = /APIFY_TOKEN|OPENAI_API_KEY|apiKey|token/i;
check(
  'ولا سرّ في كتالوج الإعدادات',
  !seedKeys.some((key) => SECRET.test(key)),
  'الأسرار في ملفّ البيئة وحده — والجدول يُقرأ إلى المتصفّح',
);

console.log('\n>> فحص الإعدادات\n');
let failed = 0;
for (const c of checks) {
  console.log(`  ${c.ok ? '✓' : '✗'} ${c.name}${c.detail ? `\n      ${c.detail}` : ''}`);
  if (!c.ok) failed += 1;
}
if (failed > 0) {
  console.error(`\n✗ ${failed} من ${checks.length} فحصاً فشل.\n`);
  process.exit(1);
}
console.log(`\n✓ سليم: ${checks.length} فحصاً كلها تمرّ.\n`);

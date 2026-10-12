/**
 * فحصٌ أمنيّ — ما لا يُرى إلا بعد أن يُستغَلّ.
 *
 * ★ أكثر ما هنا أُضيف بعد أن وُجد، لا قبل أن يُتخيَّل.
 *
 *   ثغرةُ الأمن لا تُشبه العطب: العطب يُرى في الشاشة فيُشتكى منه، وهي
 *   تعمل بهدوء إلى أن يجدها أحد. فلا يكفي أن تُسدّ مرّة — يجب أن يبقى
 *   ما يمنع عودتها، لأنّ عودتها لن تُلاحَظ.
 *
 *   ولكلّ توكيد هنا سببٌ مكتوب فوقه: ما الذي يقع لو سقط؟ فمن قرأه بعد
 *   سنةٍ عرف لماذا لا يُحذف، ومن أراد تغييره عرف ما يُقايض به.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { safeNextPath } from '../src/lib/auth/cookies';
import { clientIp } from '../src/lib/audit';

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

// ══════════════ التحويل المفتوح بعد الدخول ══════════════

/*
 * `startsWith('/')` كانت كلّ الفحص، و`//evil.com` يمرّ منها.
 *
 * وهو عنوانٌ كامل بروتوكولُه بروتوكولُ الصفحة: فمن فتح
 * `https://<المنصة>/login?next=//evil.com` أدخل كلمته في صفحة المنصّة
 * الحقيقية ثمّ وُضع على موقع الخصم — وهو أنفع ما يكون للتصيّد، لأنّ
 * الضحية دخل للتوّ ويتوقّع صفحةً تالية.
 */
for (const bad of [
  '//evil.com',
  '//evil.com/path',
  '/\\evil.com',
  'https://evil.com',
  'http://evil.com',
  'javascript:alert(1)',
  '/posts/../../etc',
]) {
  check(`وجهةٌ خارجية تُردّ: ${bad}`, safeNextPath(bad) === null);
}
for (const good of ['/posts', '/posts?range=7d&q=كهرباء', '/admin/users']) {
  check(`ووجهةٌ داخلية تُقبل: ${good}`, safeNextPath(good) === good);
}
check('والفارغ يسقط إلى الافتراضي', safeNextPath(null) === null && safeNextPath('') === null);
check(
  'والشاشة تستعمل الدالّة لا فحصاً خاصّاً بها',
  /safeNextPath\(nextPath\)/.test(readCode('src/app/(auth)/login/login-form.tsx')) &&
    !/nextPath\.startsWith\('\/'\)/.test(readCode('src/app/(auth)/login/login-form.tsx')),
  'فحصٌ مكتوبٌ في الشاشة يسقط وحده ولا يكشفه شيء',
);

// ══════════════ عنوان العميل ══════════════

/*
 * `X-Forwarded-For` قائمةٌ أوّلُها ما كتبه الطالب بيده. فقراءتُها من
 * الأوّل تُسقط حدَّ محاولات الدخول لكلّ عنوان — يبدّلها المهاجم كلّ
 * طلب فلا يبلغ الحدّ — وتملأ سجلّ التدقيق بعناوين من اختياره.
 */
check(
  'عنوان العميل يُقرأ من ذيل السلسلة لا رأسها',
  clientIp('1.2.3.4, 203.0.113.9', null) === '203.0.113.9',
  'الرأس هو ما كتبه الطالب — وأخذُه يعني أخذَ ما يملكه الخصم',
);
check(
  'والترويسة الواحدة تُقرأ كما هي',
  clientIp('203.0.113.9', null) === '203.0.113.9',
);
check(
  'وسلسلةٌ أقصر من المتوقَّع لا تُسقط الطلب',
  clientIp('203.0.113.9', '198.51.100.1') === '203.0.113.9',
  'سلسلةٌ أقصر تعني خطأ إعداد لا هجوماً، وردُّ كلّ طلبٍ عندها يُسقط الموقع على حرفٍ في ملفّ بيئة',
);
check('وبلا ترويسة يُؤخذ العنوان المباشر', clientIp(null, '198.51.100.1') === '198.51.100.1');
check(
  'وعددُ القفزات مضبوطٌ من البيئة لا مثبَّت',
  /TRUSTED_PROXY_HOPS/.test(readCode('src/lib/env.ts')) &&
    /env\.TRUSTED_PROXY_HOPS/.test(readCode('src/lib/audit.ts')),
  'من وضع شبكة توصيل أمام الوكيل يحتاج قفزتين، ورقمٌ مثبَّت يجعله يعود إلى الرأس',
);
check(
  'و«x-real-ip» لا تُقرأ إلا بلا وكيل',
  /TRUSTED_PROXY_HOPS === 0 \? h\.get\('x-real-ip'\) : null/.test(readCode('src/lib/audit.ts')),
  'ترويسةٌ يكتبها الوكيل عادةً يستطيع العميل إرسالها، فتُبطل كلّ ما سبق',
);

// ══════════════ محسّن الصور ══════════════

/*
 * ★ وكيلُ صورٍ مفتوح للعالم بلا جلسة.
 *
 *   `remotePatterns: [{ protocol: 'https', hostname: '**' }]` يجعل
 *   `/_next/image?url=…` يجلب أيّ عنوان https من الخادم ويُعيد جسده.
 *   ومصفوفةُ الوسيط تستثني `_next/image`، فلا جلسة تُطلب. فيصير
 *   الموقع ساتراً لطلبات غيره، ومنفذاً إلى خدماتٍ داخلية لا يبلغها أحد
 *   من خارج الشبكة.
 *
 *   ولا مكوّن في المشروع يستورد `next/image` أصلاً.
 */
const nextConfig = readCode('next.config.ts');
check(
  'محسّن الصور مُطفأ',
  /unoptimized: true/.test(nextConfig),
  '/_next/image يتخطّى الوسيط، فهو مكشوفٌ بلا جلسة',
);
check(
  'ولا مضيف بعيد مسموح',
  /remotePatterns: \[\]/.test(nextConfig) && !/hostname: '\*\*'/.test(nextConfig),
  'حرفُ البدل يجعل الخادم يجلب أيّ عنوان يُملى عليه',
);
check(
  'ولا يستورد المشروع next/image',
  !/from 'next\/image'/.test(read('src/components/posts/post-thumb.tsx')),
  'لو استُعمل لوجب ضبط المضيفات بدل الإطفاء — والفحص عندها يتغيّر لا يُحذف',
);

// ══════════════ سياسة المحتوى والترويسات ══════════════

for (const [header, why] of [
  ['X-Frame-Options', 'التأطير في صفحة خصم يسمح بخداع النقر'],
  ['X-Content-Type-Options', 'تخمين النوع يحوّل نصّاً إلى نصّ برمجي'],
  ['Referrer-Policy', 'الإحالة تُسرّب مسارات داخلية إلى مواقع خارجية'],
  ['Content-Security-Policy', 'بلا سياسة، أيّ حقنٍ يبلغ موضعاً غير مهرَّب يُنفَّذ ويُرسل ما قرأه'],
] as const) {
  check(`ترويسة ${header} مضبوطة`, new RegExp(`'${header}'`).test(nextConfig), why);
}
/*
 * ولا مصدرَ خارجيّ في السياسة.
 *
 * المشروع يستضيف خطّه في `public/fonts` ولا يطلب شيئاً من الإنترنت وقت
 * التشغيل — وهو وعدٌ مكتوب في README ويُعتمد عليه في الشبكات المعزولة.
 * وسياسةٌ تسمح بمصدرٍ خارجي تنقضه بصمت، وتفتح قناةً يُسرَّب منها ما
 * قُرئ لو بلغ حقنٌ موضعاً غير مهرَّب.
 */
check(
  'ولا مضيف خارجي في سياسة المحتوى',
  !/https:\/\//.test(nextConfig.slice(nextConfig.indexOf('Content-Security-Policy'), nextConfig.indexOf('upgrade-insecure-requests'))),
  'الخطّ مستضاف محلياً، فأيّ مضيف خارجي في السياسة قناةٌ بلا مقابل',
);

for (const directive of [
  "object-src 'none'",
  "font-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "connect-src 'self'",
]) {
  check(`وسياسة المحتوى تحوي: ${directive}`, nextConfig.includes(directive));
}
check(
  'ولا unsafe-eval في النصوص البرمجية',
  !/unsafe-eval/.test(nextConfig),
  'هو ما يحوّل نصّاً مسروقاً إلى شيفرة تعمل',
);

// ══════════════ جلب الوسائط — القائمة البيضاء ══════════════

/*
 * القائمة البيضاء لا معنى لها إن فُحصت على العنوان الأول وحده: مضيفٌ
 * مسموح — أو مضيفٌ اختُرق — يردّ 302 إلى شبكة Docker الداخلية أو إلى
 * 169.254.169.254، و`redirect: 'follow'` يتبع طائعاً.
 */
const store = readCode('src/lib/media/store.ts');
check(
  'التحويلات تُتبَع يدوياً لا بـfollow',
  /redirect: 'manual'/.test(store) && !/redirect: 'follow'/.test(store),
  'المتابعة التلقائية تتخطّى القائمة البيضاء عند القفزة الثانية',
);
check(
  'وكلّ وجهة تُفحص قبل طلبها',
  /for \(let hop = 0[\s\S]{0,200}?isFetchableMedia\(target\)/.test(store),
  'فحصٌ مرّةً واحدة على عنوانٍ لا يُجلب منه شيء في النهاية لا يحمي شيئاً',
);
check('وللتحويلات سقف', /MAX_REDIRECTS/.test(store), 'سلسلةٌ بلا سقف تدور إلى الأبد');
check(
  'والمضيفات محصورة بقائمة',
  /ALLOWED_HOSTS\s*=\s*\//.test(store),
  'الخادم يطلب ما يُملى عليه، فوجهتُه تُقيَّد بقائمة لا بنفي',
);

// ══════════════ حراسة المسارات المغيّرة ══════════════

/*
 * مسارٌ مغيّر بلا فحص مصدرٍ ولا رمز حماية يُنفَّذ من صفحة خصمٍ بكوكي
 * الضحية. والمسح آليّ لأنّ مسار واحد يُنسى في ملفّ جديد لا يُرى.
 */
const apiRoot = join(root, 'src/app/api');
function routeFiles(dir: string): string[] {
  const { readdirSync, statSync } = require('node:fs') as typeof import('node:fs');
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...routeFiles(full));
    else if (entry === 'route.ts') out.push(full);
  }
  return out;
}

const unguarded: string[] = [];
const unauthenticated: string[] = [];
const PRE_SESSION = ['auth/login', 'auth/logout', 'auth/forgot-password', 'auth/reset-password'];

for (const file of routeFiles(apiRoot)) {
  const relative = file.slice(apiRoot.length + 1).replace(/\/route\.ts$/, '');
  const code = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');
  for (const match of code.matchAll(/export async function (POST|PATCH|PUT|DELETE)\b/g)) {
    const start = match.index! + match[0].length;
    const next = code.slice(start).search(/export async function /);
    const body = code.slice(start, next === -1 ? undefined : start + next);

    if (!/requireCsrf|requireTrustedOrigin/.test(body)) {
      unguarded.push(`${relative} ${match[1]}`);
    }
    const authed = /requirePermission|requireAnyPermission|requireAuth/.test(body);
    if (!authed && !PRE_SESSION.includes(relative)) {
      unauthenticated.push(`${relative} ${match[1]}`);
    }
  }
}

check(
  'كلّ مسار مغيّر يفحص المصدر أو رمز الحماية',
  unguarded.length === 0,
  unguarded.join('، '),
);
check(
  'وكلّ مسار مغيّر يتطلّب جلسة — عدا مسارات ما قبل الدخول',
  unauthenticated.length === 0,
  unauthenticated.join('، '),
);
check(
  'والخروج منها — فلا يُخرَج الموظّف من صفحة خصم',
  /requireCsrf\(\)/.test(readCode('src/app/api/auth/logout/route.ts')),
);
for (const route of ['login', 'forgot-password', 'reset-password']) {
  check(
    `ومسار ${route} يفحص المصدر`,
    /requireTrustedOrigin\(\)/.test(readCode(`src/app/api/auth/${route}/route.ts`)),
    'صفحةٌ خبيثة تُدخل الموظّف بحساب خصمه، فيقع كلّ ما يفعله بعدها في حسابٍ يقرؤه غيره',
  );
}

// ══════════════ الجلسة ══════════════

const session = readCode('src/lib/auth/session.ts');
check(
  'كوكي الجلسة لا تُقرأ من النصوص البرمجية',
  /SESSION_COOKIE, token, \{\s*httpOnly: true/.test(session),
  'كوكي مقروءةٌ من JS تُسرَق بأوّل حقنٍ ناجح',
);
check('وتُرسل على المشفَّر وحده في الإنتاج', /secure: isProduction/.test(session));
check('وsameSite مضبوطة', /sameSite: 'lax'/.test(session));
check(
  'والرمز يُخزَّن مُلبَّداً لا خاماً',
  /tokenHash: hashToken\(token\)/.test(session),
  'تسريبُ نسخةٍ من الجدول يعطي الخصم جلساتٍ عاملة لا بصماتٍ لا تنفع',
);
check(
  'ومقارنة رمز الحماية ثابتةُ الزمن',
  /timingSafeEqual/.test(session),
  'المقارنة الحرفية تُسرّب الرمز حرفاً حرفاً بفارق زمنٍ يُقاس',
);
check(
  'والمستخدم غير النشط لا جلسة له مهما كانت الكوكي',
  /session\.user\.status !== 'ACTIVE'\) return null/.test(session),
  'تعطيلُ موظّفٍ يجب أن يسري فوراً لا عند انتهاء جلسته',
);

// ══════════════ الحقن ══════════════

const sources = [
  'src/lib/queries/posts.ts',
  'src/lib/assistant/tools.ts',
  'src/lib/assistant/rag.ts',
  'src/lib/analysis/stories.ts',
  'src/lib/analysis/learning.ts',
];
for (const file of sources) {
  const code = readCode(file);
  check(
    `لا SQL غير مُعامَل في ${file.split('/').pop()}`,
    !/\$queryRawUnsafe|\$executeRawUnsafe|Prisma\.raw\(/.test(code),
    'نصٌّ يُركَّب بالدمج يفتح الحقن مهما كان مصدره',
  );
}
check(
  'ولا dangerouslySetInnerHTML في الواجهة',
  !/dangerouslySetInnerHTML/.test(readCode('src/components/assistant/MessageBubble.tsx')),
  'جواب النموذج يحمل نصّ منشورٍ كتبه غريب — وعرضُه HTML يُنفّذه',
);

// ══════════════ الأسرار ══════════════

check(
  'لا سرّ في متغيّر يبلغ المتصفّح',
  !/NEXT_PUBLIC_[A-Z_]*(KEY|TOKEN|SECRET|PASSWORD)/.test(read('src/lib/env.ts')),
  'ما بدأ بـNEXT_PUBLIC يُحزَّم في حزمة العميل ويُقرأ بمصدر الصفحة',
);
check(
  'ومفتاح المساعد يُقرأ في الخادم وحده',
  /import 'server-only'/.test(read('src/lib/assistant/config.ts')),
);
check(
  'وحالةُ التكاملات لا تُعيد قيمة الرمز',
  !/APIFY_TOKEN/.test(readCode('src/app/api/apify/status/route.ts')),
  'شاشةُ الحالة تقول «مضبوط» أو «غير مضبوط» ولا تقول ما هو',
);

// ══════════════ صفحات الخطأ ══════════════

/*
 * ★ صفحةُ الخطأ بابٌ تُقرأ منه تفاصيل الخادم.
 *
 *   رسالةُ الخطأ تحمل ما لا يُقال: مساراً على الخادم، أو جزءاً من
 *   استعلام، أو اسمَ عمودٍ وجدولاً، أو عنوان خدمةٍ داخلية. وNext يُبدّل
 *   رسائل مكوّنات الخادم في الإنتاج — أمّا أخطاءُ المتصفّح فتصل بنصّها
 *   كما هي، وهذه الصفحات تعرضها لو عرضَتْها.
 *
 *   والحدُّ الأعلى (`src/app/error.tsx`) فوق المجموعات كلّها، فهو
 *   يُعرض لمن لم يُصادَق عليه: خطأٌ في شاشة الدخول يظهر فيه. فما يُكتب
 *   فيه يُقرأ قبل الباب لا بعده.
 *
 *   ويبقى `digest` — وهو بصمةُ الخطأ لا نصّه: يقولها الموظّف للمشغّل
 *   فيجد بها السطر في السجلّ. فيُعرَف الخطأ بلا كشفه.
 */
const ERROR_PAGES = [
  'src/app/error.tsx',
  'src/app/(app)/error.tsx',
  'src/app/global-error.tsx',
];

for (const page of ERROR_PAGES) {
  const code = readCode(page);
  check(
    `${page.split('/').slice(-2).join('/')} لا تكشف تفصيل الخطأ`,
    !/error\.(message|stack|cause|name)\b/.test(code) && !/\{\s*error\s*\}/.test(code),
    'نصُّ الخطأ قد يحمل مساراً على الخادم أو اسمَ عمودٍ أو جزءاً من استعلام',
  );
  check(
    `و${page.split('/').slice(-2).join('/')} تذكر رقم الحادثة`,
    /error\.digest/.test(code),
    'بلا بصمةٍ يقولها الموظّف لا يجد المشغّل السطر في السجلّ — فيُطلب منه نصُّ الخطأ',
  );
}

/*
 * وصفحةُ السقوط الأخير لا تستورد من المشروع شيئاً.
 *
 * هي تحلّ محلّ التخطيط الجذري، فتُعرض حين يسقط ذاك: مزوّد السمة، أو
 * ورقةُ الأنماط، أو الخطّ. فبناءُ هيئتها على أيٍّ منها بناءٌ على ما سقط.
 */
const globalError = readCode('src/app/global-error.tsx');
check(
  'وصفحةُ السقوط الأخير قائمةٌ بنفسها',
  !/from '@\//.test(globalError) && !/import '\.\//.test(globalError),
  'استيرادُ ما سقط يُسقط الصفحة معه، فيرى الموظّف شاشةً بيضاء بلا كلمة',
);
check(
  'وتحمل وسمَي html وbody',
  /<html lang="ar" dir="rtl">/.test(globalError) && /<body>/.test(globalError),
  'هي بديلُ التخطيط الجذري لا صفحةٌ داخله — فبلا الوسمين لا مستند',
);

// ══════════════ النتيجة ══════════════

const failed = checks.filter((item) => !item.ok);

console.log('\n>> الفحص الأمني\n');
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

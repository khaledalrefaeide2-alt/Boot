/**
 * فحص أن كل شاشة محروسة في الخادم لا في قائمة التنقّل وحدها.
 *
 * وُجد لأن ثلاث شاشات كانت بلا حارس أصلاً — غرفة العمليات والحسابات
 * والمقارنة — تتّكل على أن القائمة لا تعرض روابطها. وإخفاء الرابط يُخفي
 * الباب ولا يُغلقه: من يكتب المسار في شريط العنوان يدخل.
 *
 * والخلل من النوع الذي لا يظهر في تصفّح عاديّ: من يملك الصلاحية يرى كل شيء
 * يعمل، ومن لا يملكها لا يرى الرابط فلا يجرّب.
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { PERMISSIONS, ROLE_PERMISSIONS } from '../src/lib/auth/rbac';
import { ADMIN_NAV, VIEWER_NAV } from '../src/lib/domain/navigation';

const root = process.cwd();
const checks: { name: string; ok: boolean; detail?: string }[] = [];
function check(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
}

/** القيمة إلى اسم الثابت: 'accounts.view' → 'ACCOUNTS_VIEW' */
const NAME_OF = new Map(Object.entries(PERMISSIONS).map(([name, value]) => [value, name]));

// ── ما لا يراه المستخدم العادي
const viewer = new Set(ROLE_PERMISSIONS.VIEWER);
const supervisor = new Set(ROLE_PERMISSIONS.SUPERVISOR);

for (const [label, permission] of [
  ['دليل الحسابات', PERMISSIONS.ACCOUNTS_VIEW],
  ['غرفة العمليات', PERMISSIONS.OPS_VIEW],
] as const) {
  check(`المستخدم العادي لا يملك ${label}`, !viewer.has(permission), permission);
  check(`المشرف يملك ${label}`, supervisor.has(permission), permission);
}

/*
 * ما يبقى للمستخدم العادي.
 *
 * التضييق يُصيب الهدف ويُخطئ ما حوله بسهولة: من يُمنع من دليل الحسابات لا
 * يُمنع من المنشورات ولا من الإحصاءات ولا من التقارير — وإلا صار الدور
 * بلا معنى.
 */
for (const [label, permission] of [
  ['المنشورات', PERMISSIONS.POSTS_VIEW],
  ['المنصات', PERMISSIONS.PLATFORMS_VIEW],
  ['التقارير', PERMISSIONS.REPORTS_VIEW],
  ['التصدير', PERMISSIONS.REPORTS_EXPORT],
  ['المساعد', PERMISSIONS.ASSISTANT_USE],
] as const) {
  check(`المستخدم العادي يبقى يرى ${label}`, viewer.has(permission), permission);
}

/*
 * الحارس في الصفحة لا في القائمة.
 *
 * لكل عنصر تنقّل صلاحية، يجب أن تذكرها صفحتُه صراحةً مع `notFound` أو
 * `redirect`. وذكرُ الصلاحية وحده لا يكفي: صفحةٌ تقرؤها لتُخفي زرّاً ثم
 * تعرض بقيّتها للجميع ليست محروسة.
 */
function pageFileFor(href: string, admin: boolean): string | null {
  const segment = href === '/' ? '' : href;
  const base = path.join(root, 'src', 'app', admin ? '(admin)' : '(app)', segment.replace(/^\//, ''));
  const candidate = path.join(base, 'page.tsx');
  return existsSync(candidate) ? candidate : null;
}

const unguarded: string[] = [];
let guarded = 0;

for (const [sections, admin] of [
  [VIEWER_NAV, false],
  [ADMIN_NAV, true],
] as const) {
  for (const section of sections) {
    for (const item of section.items) {
      if (!item.permission) continue;

      const file = pageFileFor(item.href, admin);
      if (!file) {
        unguarded.push(`${item.href} — لا ملف صفحة`);
        continue;
      }

      const source = readFileSync(file, 'utf8');
      const name = NAME_OF.get(item.permission);
      const mentions = name ? source.includes(`PERMISSIONS.${name}`) : false;
      const blocks = /notFound\(\)|redirect\(/.test(source);

      if (mentions && blocks) {
        guarded += 1;
      } else {
        unguarded.push(
          `${item.href} — ${!mentions ? `لا يذكر ${name}` : 'يذكرها ولا يمنع الدخول'}`,
        );
      }
    }
  }
}

check(`كل شاشة في التنقّل محروسة في الخادم (${guarded} شاشة)`, unguarded.length === 0, unguarded.join(' · '));

/*
 * الصلاحية في العميل ليست حدّاً أمنياً.
 *
 * `useCan` تُخفي رابطاً لا يقود إلى شيء، والحدّ في الخادم. فيُتحقّق أن
 * مزوّد الصلاحيات يُقرأ من الجلسة لا من مصدر يملكه المتصفّح.
 */
const shell = readFileSync(path.join(root, 'src/components/layout/protected-shell.tsx'), 'utf8');
check('صلاحيات العميل تأتي من جلسة الخادم', shell.includes('permissions={user.permissions}'));

/*
 * ══════════ حلقة التحويل ══════════
 *
 * ★ هذا العطب أسقط الموقع كلّه، لا صفحةً منه.
 *
 *   الوسيط يعرف أنّ كوكي الجلسة موجودة ولا يعرف أنّها صالحة — لا قاعدة
 *   بيانات في الوسيط. والخادم يعرف. فمن انتهت جلسته وبقيت الكوكي في
 *   متصفّحه: الخادم يُحوّله إلى `/login` لأن الجلسة ميّتة، والوسيط
 *   يُعيده إلى `/` لأن الكوكي موجودة، والخادم يُحوّل… إلى أن يقف
 *   المتصفّح عند ERR_TOO_MANY_REDIRECTS.
 *
 *   وهو لا يظهر في بناء ولا في نوعٍ ولا في أيّ فحصٍ منطقي: كلّ طرف
 *   صحيحٌ وحده. ولا يظهر في التطوير أصلاً، لأن الجلسة هناك حديثة دائماً.
 *   يظهر بعد أيام، على كلّ المستخدمين دفعةً واحدة.
 */
const proxy = readFileSync(path.join(root, 'src/proxy.ts'), 'utf8');
const cookies = readFileSync(path.join(root, 'src/lib/auth/cookies.ts'), 'utf8');

check(
  'الخادم يُعلم الوسيط أنّ الكوكي ميّتة',
  /redirect\(`\/login\?\$\{SESSION_EXPIRED_PARAM\}=1`\)/.test(shell),
  'بدون العلامة يُعيده الوسيط إلى الداخل فتدور الحلقة',
);
check(
  'والوسيط لا يُعيده إلى الداخل حينها',
  /SESSION_EXPIRED_PARAM\) === '1'/.test(proxy) && /return response;/.test(proxy),
);
check(
  'ويمسح الكوكيَّين معاً',
  /cookies\.delete\(SESSION_COOKIE\)/.test(proxy) && /cookies\.delete\(CSRF_COOKIE\)/.test(proxy),
  'كوكي CSRF الباقية تخصّ جلسةً لا وجود لها',
);

/*
 * واسم الكوكي مصدره واحد.
 *
 * الوسيط لا يقرأ من `session.ts` (فيه `server-only`)، فكان يُعيد كتابة
 * `'mm_session'` حرفاً بحرف. وتغييرُ الاسم في أحدهما لا يُعطب البناء:
 * الوسيط يبحث عمّا لا وجود له، فيرى كلّ زائر «بلا جلسة» — ولا يدخل
 * أحدٌ الموقعَ أبداً.
 */
check(
  'اسم كوكي الجلسة معرَّف مرّة واحدة',
  /from '@\/lib\/auth\/cookies'/.test(proxy) && !/const SESSION_COOKIE = '/.test(proxy),
);
/*
 * والتعليقات تُنزَع قبل الفحص: هذا الملفّ يشرح في تعليقه لماذا لا يلمس
 * `server-only` — فالفحص على النصّ الخام يقع على الجملة التي تنهى عن
 * الفعل ويحسبها الفعل.
 */
const cookiesCode = cookies
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
check(
  'ووحدةُ الأسماء لا تلمس الخادم',
  !/server-only|prisma|next\/headers/.test(cookiesCode),
  'لو لمسته لما استطاع الوسيط قراءتها، ولعاد الاسم مكرّراً',
);

console.log('\n>> فحص حراسة الشاشات\n');
let failed = 0;
for (const c of checks) {
  console.log(`  ${c.ok ? '✓' : '✗'} ${c.name}${c.detail && !c.ok ? `\n      ${c.detail}` : ''}`);
  if (!c.ok) failed += 1;
}
if (failed > 0) {
  console.error(`\n✗ ${failed} من ${checks.length} فحصاً فشل.\n`);
  process.exit(1);
}
console.log(`\n✓ سليم: ${checks.length} فحصاً كلها تمرّ.\n`);

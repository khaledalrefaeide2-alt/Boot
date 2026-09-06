/**
 * فحص حصر البيانات: هل يرى المستخدم المقيّد حسابات نطاقه وحدها؟
 *
 * الفحص يمرّ عبر HTTP لا عبر الاستعلامات مباشرةً، لأن الثغرة تسكن عادةً في
 * المسار المنسيّ لا في الدالة المشتركة: مسار يقرأ من القاعدة دون أن يسأل عن
 * النطاق يبدو سليماً في الكود ويسرّب في التشغيل. فيسجّل السكربت الدخول
 * كمستخدم مقيّد فعلاً ويستجوب كل سطح كما يفعل المتصفح.
 *
 * ينشئ مستخدمَين مؤقتين ويحذفهما مع كل أثر لهما في النهاية، ولا يمسّ
 * المستخدمين ولا الحسابات القائمة.
 *
 * التشغيل — والخادم يعمل في نافذة أخرى:
 *     npm run verify:scope
 */
import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { prisma } from '../src/lib/db';
import { hashPassword } from '../src/lib/auth/password';

const BASE = (process.env.APP_URL ?? 'http://localhost:3111').replace(/\/$/, '');
const RESTRICTED_EMAIL = 'scope-check.restricted@internal.invalid';
const CONTROL_EMAIL = 'scope-check.control@internal.invalid';
const PASSWORD = `Sc0pe#${randomBytes(9).toString('base64url')}`;

const results: { name: string; pass: boolean; detail: string }[] = [];
function check(name: string, pass: boolean, detail = ''): void {
  results.push({ name, pass, detail });
  console.log(`  ${pass ? '✓' : '✗'} ${name}${detail ? `   (${detail})` : ''}`);
}

/* --------------------------- عميل HTTP بسيط بكوكيز --------------------------- */

type Jar = { header: () => string; absorb: (r: Response) => void; get: (k: string) => string | undefined };

function makeJar(): Jar {
  const jar = new Map<string, string>();
  return {
    header: () => Array.from(jar, ([k, v]) => `${k}=${v}`).join('; '),
    absorb: (response) => {
      for (const raw of response.headers.getSetCookie()) {
        const [pair] = raw.split(';');
        const index = pair!.indexOf('=');
        jar.set(pair!.slice(0, index).trim(), pair!.slice(index + 1).trim());
      }
    },
    get: (key) => jar.get(key),
  };
}

async function login(email: string): Promise<Jar> {
  const jar = makeJar();
  // زيارة صفحة الدخول أولاً لالتقاط كوكي الحماية من CSRF
  jar.absorb(await fetch(`${BASE}/login`, { redirect: 'manual' }));

  const response = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: jar.header(),
      'x-csrf-token': jar.get('mm_csrf') ?? '',
    },
    body: JSON.stringify({ email, password: PASSWORD }),
    redirect: 'manual',
  });
  jar.absorb(response);
  if (!response.ok) throw new Error(`تعذّر تسجيل دخول ${email}: ${response.status}`);
  return jar;
}

async function get(jar: Jar, path: string): Promise<{ status: number; data: any; text: string }> {
  const response = await fetch(`${BASE}${path}`, { headers: { cookie: jar.header() }, redirect: 'manual' });
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('json')) {
    const body = await response.json().catch(() => null);
    return { status: response.status, data: body?.data ?? null, text: '' };
  }
  return { status: response.status, data: null, text: await response.text() };
}

/* ---------------------------------- التنفيذ --------------------------------- */

async function serverIsUp(): Promise<boolean> {
  try {
    const response = await fetch(`${BASE}/login`, { signal: AbortSignal.timeout(5000) });
    return response.ok;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  if (!(await serverIsUp())) {
    console.error(`\n>> The app is not responding at ${BASE}`);
    console.error('   التطبيق لا يستجيب. شغّله في نافذة أخرى ثم أعد الفحص:\n');
    console.error('     npm run dev\n');
    process.exit(1);
  }

  const accounts = await prisma.account.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, name: true, platformId: true, _count: { select: { posts: true } } },
  });
  if (accounts.length < 2) {
    console.error('\n>> Need at least two accounts with posts to test scoping.');
    console.error('   الفحص يحتاج حسابين على الأقل في القاعدة. شغّل التهيئة أولاً:\n');
    console.error('     npm run setup:db\n');
    process.exit(1);
  }

  const allowed = accounts.reduce((best, account) =>
    account._count.posts > best._count.posts ? account : best,
  );
  const denied = accounts.filter((account) => account.id !== allowed.id);
  const passwordHash = await hashPassword(PASSWORD);

  console.log('\n-- SCOPE CHECK / فحص حصر البيانات --');
  console.log(`   الحساب المسموح  : ${allowed.name} (${allowed._count.posts} منشوراً)`);
  console.log(`   الحسابات الممنوعة: ${denied.length}\n`);

  const restricted = await prisma.user.create({
    data: {
      email: RESTRICTED_EMAIL, name: 'فحص النطاق — مقيّد', passwordHash,
      role: 'VIEWER', status: 'ACTIVE', mustChangePassword: false,
      approvedAt: new Date(), accountAccess: 'ASSIGNED',
      accountAssignments: { create: { accountId: allowed.id } },
    },
    select: { id: true },
  });
  const control = await prisma.user.create({
    data: {
      email: CONTROL_EMAIL, name: 'فحص النطاق — ضابط', passwordHash,
      role: 'VIEWER', status: 'ACTIVE', mustChangePassword: false,
      approvedAt: new Date(), accountAccess: 'ALL',
    },
    select: { id: true },
  });

  try {
    const scoped = await login(RESTRICTED_EMAIL);
    const open = await login(CONTROL_EMAIL);

    const deniedPost = await prisma.post.findFirst({
      where: { accountId: { in: denied.map((a) => a.id) } },
      select: { id: true },
    });
    const deniedNames = denied.map((a) => a.name);

    console.log('  المنشورات والفلاتر');
    {
      const posts = await get(scoped, '/api/posts?range=all&pageSize=100');
      const ids = new Set((posts.data?.posts ?? []).map((p: any) => p.account?.id));
      check('كل الصفوف من الحساب المسموح', ids.size <= 1 && (ids.size === 0 || ids.has(allowed.id)));

      const bypass = await get(scoped, `/api/posts?range=all&accountId=${denied[0]!.id}`);
      check('طلب حساب ممنوع لا يتجاوز الحصر', bypass.data?.total === 0, `total=${bypass.data?.total}`);

      const mixed = await get(scoped, `/api/posts?range=all&accountId=${allowed.id}&accountId=${denied[0]!.id}`);
      const mixedIds = new Set((mixed.data?.posts ?? []).map((p: any) => p.account?.id));
      check('خلط المسموح بالممنوع يُبقي المسموح', [...mixedIds].every((id) => id === allowed.id));

      const options = await get(scoped, '/api/filters/options');
      check(
        'قوائم الفلاتر محصورة',
        (options.data?.accounts ?? []).length === 1 &&
          (options.data?.accounts ?? [])[0]?.id === allowed.id,
      );
    }

    console.log('\n  الإحصاءات والتقارير');
    {
      const overview = await get(scoped, '/api/stats/overview?range=all');
      check('عدّاد الحسابات محصور', overview.data?.accountsCount === 1, `${overview.data?.accountsCount}`);
      check(
        'أعلى منشور من حساب مسموح',
        !overview.data?.topPost || overview.data.topPost.accountName === allowed.name,
      );

      const top = await get(scoped, '/api/stats/top?range=all');
      const names = (top.data?.accounts ?? []).map((a: any) => a.name);
      check('أعلى الحسابات لا يذكر ممنوعاً', names.every((n: string) => !deniedNames.includes(n)));

      const compare = await get(
        scoped,
        `/api/stats/compare?range=all&accountId=${denied.map((a) => a.id).join('&accountId=')}`,
      );
      check('المقارنة ترفض حسابات خارج النطاق', compare.status === 403, `status=${compare.status}`);

      const response = await fetch(`${BASE}/api/reports/export?range=all`, {
        headers: { cookie: scoped.header() },
      });
      const workbook = Buffer.from(await response.arrayBuffer()).toString('latin1');
      const leaked = deniedNames.filter((name) =>
        workbook.includes(Buffer.from(name, 'utf8').toString('latin1')),
      );
      check('ملف التصدير خالٍ من حساب ممنوع', response.status === 200 && leaked.length === 0, leaked.join('، '));
    }

    console.log('\n  الصفحات المباشرة');
    {
      if (deniedPost) {
        const page = await get(scoped, `/posts/${deniedPost.id}`);
        check('منشور ممنوع يردّ «غير موجود»', page.status === 404, `status=${page.status}`);
      }
      const account = await get(scoped, `/accounts/${denied[0]!.id}`);
      check('حساب ممنوع يردّ «غير موجود»', account.status === 404, `status=${account.status}`);

      const platform = await get(scoped, `/platforms/${allowed.platformId}`);
      const onPage = deniedNames.filter((name) => platform.text.includes(name));
      check('صفحة المنصة لا تسرّب حساباً ممنوعاً', onPage.length === 0, onPage.join('، '));

      const platforms = await get(scoped, '/platforms');
      const onList = deniedNames.filter((name) => platforms.text.includes(name));
      check('قائمة المنصات لا تسرّب', onList.length === 0, onList.join('، '));
    }

    console.log('\n  ضابط المقارنة — نفس الدور بلا قيد');
    {
      const posts = await get(open, '/api/posts?range=all&pageSize=1');
      const overview = await get(open, '/api/stats/overview?range=all');
      const total = await prisma.post.count({ where: { isHidden: false } });
      check('غير المقيّد يرى كل المنشورات', posts.data?.total === total, `${posts.data?.total} من ${total}`);
      const activeAccounts = await prisma.account.count({ where: { status: 'ACTIVE' } });
      check(
        'غير المقيّد يرى كل الحسابات',
        overview.data?.accountsCount === activeAccounts,
        `${overview.data?.accountsCount} من ${activeAccounts}`,
      );
    }
  } finally {
    // الحذف في finally: فحصٌ متعثّر يجب ألا يترك مستخدماً بصلاحية في القاعدة
    await prisma.auditLog.deleteMany({ where: { actorEmail: { in: [RESTRICTED_EMAIL, CONTROL_EMAIL] } } });
    await prisma.user.deleteMany({ where: { id: { in: [restricted.id, control.id] } } });
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n   ${results.length - failed.length}/${results.length} فحصاً ناجحاً`);

  if (failed.length === 0) {
    console.log('\n>> Scope holds on every surface checked.');
    console.log('   الحصر سليم على كل السطوح المفحوصة.\n');
    return;
  }

  console.log('\n>> LEAK: a restricted user can reach data outside their accounts.');
  console.log('   تسريب: المستخدم المقيّد يصل إلى بيانات خارج حساباته.\n');
  for (const failure of failed) console.log(`     - ${failure.name}`);
  console.log('');
  process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error('>> Scope check failed to run:', error);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());

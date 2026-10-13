/**
 * فحص حفظ الصور الشخصية — على قاعدةٍ حقيقية ومخزنٍ مؤقّت.
 *
 *   VERIFY_DATABASE_URL=postgresql://… npm run verify:avatars
 *
 * ★ لماذا قاعدةٌ حقيقية؟
 *
 *   ما يُفحص هنا انتقالُ حالاتٍ بين جدولٍ وملفّات: المكنسة تكتب المفتاح،
 *   والتقليم يقرأ الجدول ليقرّر ما يحذف من القرص. وخطأٌ في أيّ طرف لا
 *   يظهر خطأً: تعود البطاقات حروفاً بعد أوّل دورة تقليم، ولا سطر في سجلّ.
 *
 * ولا شبكة: كلّ رابطٍ «يُجلب» هنا إمّا خارج المضيفات المسموحة (فيُرفض
 * قبل أيّ طلب)، وإمّا ملفُّه موجودٌ سلفاً في المخزن المؤقّت (فيُجاب منه).
 * والصفوف بادئةٌ مميّزة، وتُحذف في النهاية نجح الفحص أم سقط.
 */
import { mkdtemp, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const url = process.env.VERIFY_DATABASE_URL;
if (!url) {
  console.error('VERIFY_DATABASE_URL غير معرّف — الفحص يحتاج قاعدةً للتجربة لا قاعدة الإنتاج.');
  process.exit(1);
}
process.env.DATABASE_URL = url;

const checks: { name: string; ok: boolean; detail?: string }[] = [];
function check(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
}

const PREFIX = 'verify-avatar-';

async function main() {
  const root = await mkdtemp(path.join(tmpdir(), 'avatars-'));
  process.env.MEDIA_DIR = root;

  const { prisma } = await import('../src/lib/db');
  const { avatarUpdateFor, cacheAccountAvatars, storeAccountAvatar } = await import(
    '../src/lib/media/cache-avatars'
  );
  const { pruneStore } = await import('../src/lib/media/prune');
  const { mediaKeyFor } = await import('../src/lib/media/store');

  /** ملفٌّ في المخزن بمفتاح رابطٍ ما — فيُجاب منه بلا شبكة */
  async function seedFile(forUrl: string): Promise<string> {
    const key = mediaKeyFor(forUrl);
    await mkdir(path.join(root, key.slice(0, 2)), { recursive: true });
    await writeFile(path.join(root, key.slice(0, 2), `${key}.webp`), Buffer.from('RIFF0000WEBP'));
    return key;
  }
  async function exists(key: string): Promise<boolean> {
    try {
      return (await stat(path.join(root, key.slice(0, 2), `${key}.webp`))).isFile();
    } catch {
      return false;
    }
  }

  try {
    // ══════════ القرار وحده — دالّة خالصة ══════════
    const now = new Date();
    const ok = avatarUpdateFor({ ok: true, key: 'k' }, now);
    const gone = avatarUpdateFor({ ok: false, permanent: true, reason: '403' }, now);
    const retry = avatarUpdateFor({ ok: false, permanent: false, reason: 'timeout' }, now);
    check('النجاح يكتب المفتاح ويحسم الرابط', ok.avatarKey === 'k' && ok.avatarCheckedAt === now);
    check(
      'والفشل النهائي يحسم الرابط ولا يمسّ المفتاح القديم',
      gone.avatarCheckedAt === now && !('avatarKey' in gone),
      'صورةٌ سابقة خيرٌ من حرف',
    );
    check('والعابر يُبقيه معلّقاً للدورة التالية', retry.avatarCheckedAt === null && !('avatarKey' in retry));

    // ══════════ الإعداد ══════════
    const platform =
      (await prisma.platform.findFirst()) ??
      (await prisma.platform.create({ data: { code: `${PREFIX}p`, name: 'تجربة' } }));

    const LIVE = 'https://scontent.xx.fbcdn.net/v/t1/avatar-live.jpg?oh=abc&oe=1';
    const DEAD = 'https://example.com/not-allowed.jpg';
    const liveKey = await seedFile(LIVE);

    const make = (suffix: string, data: Record<string, unknown>) =>
      prisma.account.create({
        data: {
          platformId: platform.id,
          name: `${PREFIX}${suffix}`,
          url: `https://example.com/${PREFIX}${suffix}`,
          ...data,
        },
      });

    const pendingLive = await make('live', { avatarUrl: LIVE });
    const pendingDead = await make('dead', { avatarUrl: DEAD });
    const settled = await make('settled', { avatarUrl: DEAD, avatarCheckedAt: new Date(0) });
    const none = await make('none', {});

    // ══════════ المكنسة ══════════
    const swept = await cacheAccountAvatars(200);
    const read = (id: string) =>
      prisma.account.findUniqueOrThrow({
        where: { id },
        select: { avatarKey: true, avatarCheckedAt: true },
      });
    const a = await read(pendingLive.id);
    const b = await read(pendingDead.id);
    const c = await read(settled.id);
    const d = await read(none.id);
    check(
      'المكنسة تحفظ الرابط الحيّ وتكتب مفتاحه',
      a.avatarKey === liveKey && a.avatarCheckedAt !== null,
      `المفتاح ${a.avatarKey} — المتوقّع ${liveKey}`,
    );
    check(
      'وتحسم الرابط الميّت فلا تعود إليه',
      b.avatarKey === null && b.avatarCheckedAt !== null,
    );
    check(
      'ولا تمسّ رابطاً حُسم قبلها',
      c.avatarCheckedAt?.getTime() === 0,
      'المحسوم يُعاد فقط حين يصل رابطٌ جديد',
    );
    check('ولا حساباً بلا رابط', d.avatarKey === null && d.avatarCheckedAt === null);
    check('وتُحصي ما فعلت', swept.stored >= 1 && swept.gone >= 1);

    const again = await cacheAccountAvatars(200);
    const touchedOurs = await prisma.account.count({
      where: { name: { startsWith: PREFIX }, avatarUrl: { not: null }, avatarCheckedAt: null },
    });
    check(
      'ودورةٌ ثانية لا تجد من حساباتنا شيئاً',
      touchedOurs === 0,
      `بقي ${touchedOurs} — المكنسة التي تعود إلى المحسوم تطرق رابطاً ميّتاً كلّ أربع دقائق`,
    );
    void again;

    // ══════════ الاستخراج ══════════
    const FRESH = 'https://scontent.xx.fbcdn.net/v/t1/avatar-fresh.jpg?oh=new&oe=2';
    const freshKey = await seedFile(FRESH);
    await storeAccountAvatar(settled.id, FRESH);
    const afterFresh = await prisma.account.findUniqueOrThrow({
      where: { id: settled.id },
      select: { avatarUrl: true, avatarKey: true, avatarCheckedAt: true },
    });
    check(
      'الاستخراج يحفظ الرابط الجديد ويكتبه مع مفتاحه',
      afterFresh.avatarUrl === FRESH && afterFresh.avatarKey === freshKey,
    );

    await storeAccountAvatar(settled.id, DEAD);
    const afterDead = await prisma.account.findUniqueOrThrow({
      where: { id: settled.id },
      select: { avatarUrl: true, avatarKey: true },
    });
    check(
      'ورابطٌ ميّت بعده لا يمحو الصورة المحفوظة',
      afterDead.avatarUrl === DEAD && afterDead.avatarKey === freshKey,
      'صورةٌ سابقة خيرٌ من حرف',
    );

    // ══════════ التقليم ══════════
    /*
     * أخطر ما في الميزة كلّها: التقليم يحذف من القرص كلّ ملفٍّ لا يشير
     * إليه الجدول. فإن لم يعدّ الصور الشخصية حيّةً حذفها جميعاً.
     *
     * وفي المخزن المؤقّت ملفّات حساباتنا وحدها، فلا يمسّ الفحص شيئاً آخر.
     */
    const orphanKey = await seedFile('https://scontent.xx.fbcdn.net/v/t1/orphan.jpg');
    const pruned = await pruneStore(Number.MAX_SAFE_INTEGER);
    check('التقليم يُبقي الصورة الشخصية المحفوظة', await exists(liveKey));
    check('ويُبقي صورة الحساب التي تغيّرت', await exists(freshKey));
    check('ويحذف اليتيمة', !(await exists(orphanKey)) && pruned.orphans >= 1);

    /*
     * والإخراج لضيق المخزن يُعيد الحساب معلّقاً — لا مفتاحاً يشير إلى
     * ملفٍّ محذوف فتظهر صورةٌ مكسورة.
     */
    await pruneStore(0);
    const evicted = await prisma.account.findUniqueOrThrow({
      where: { id: pendingLive.id },
      select: { avatarKey: true, avatarCheckedAt: true },
    });
    check(
      'والمُخرَجة لضيق المخزن تعود معلّقة',
      !(await exists(liveKey)) && evicted.avatarKey === null && evicted.avatarCheckedAt === null,
    );
  } finally {
    await prisma.account.deleteMany({ where: { name: { startsWith: PREFIX } } }).catch(() => undefined);
    await prisma.platform.deleteMany({ where: { code: `${PREFIX}p` } }).catch(() => undefined);
    await prisma.$disconnect();
    await rm(root, { recursive: true, force: true });
  }

  console.log('\n>> فحص حفظ الصور الشخصية\n');
  let failed = 0;
  for (const c of checks) {
    console.log(`  ${c.ok ? '✓' : '✗'} ${c.name}${c.detail && !c.ok ? `\n      ${c.detail}` : ''}`);
    if (!c.ok) failed += 1;
  }
  console.log(`\n${checks.length - failed}/${checks.length} فحصاً ناجحاً`);
  if (failed > 0) process.exit(1);
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});


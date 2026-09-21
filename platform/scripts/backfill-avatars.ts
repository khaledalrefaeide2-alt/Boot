/**
 * استخراج صور الحسابات من عيّنات التشغيل المحفوظة.
 *
 *   npm run avatars:backfill              # عرضٌ فقط
 *   npm run avatars:backfill -- --confirm # الحفظ
 *   npm run avatars:backfill -- --keys    # تشخيص: ما المفاتيح في العيّنة؟
 *   npm run avatars:backfill -- --all     # يشمل من له صورة محفوظة
 *
 * لماذا يوجد: صورة الحساب صارت تُلتقط أثناء الاستيراد، لكن ذلك لا يفيد ما
 * استُخرج قبله — وإعادةُ استخراج كل حساب لمجرّد صورة إنفاقٌ للحصة المدفوعة
 * في غير موضعه.
 *
 * والمصدر موجود أصلاً: كل تشغيل يحفظ `rawSample` — أوّل ثلاثة عناصر كما
 * وصلت من المشغّل. فيها الصورة، وقراءتها لا تكلّف طلباً واحداً.
 */
import 'dotenv/config';
import { prisma } from '../src/lib/db';
import { findProfileImage, isMediaUrl } from '../src/lib/apify/mappers';

const CONFIRM = process.argv.includes('--confirm');
const SHOW_KEYS = process.argv.includes('--keys');
const ALL = process.argv.includes('--all');

/** كم تشغيلاً يُفحص لكل حساب — الأحدث أولاً */
const RUNS_PER_ACCOUNT = 5;

/*
 * التشخيص: ما المفاتيح التي تحمل روابط صور في هذه العيّنة؟
 *
 * يوجد لأن الفشل هنا صامت: حسابٌ بلا صورة لا يقول إن كان المشغّل لم
 * يُرسلها أم أرسلها باسمٍ لا يعرفه النمط. وهذه تُجيب ذلك في سطر.
 */
function collectImageKeys(value: unknown, path = '', out: string[] = [], depth = 0): string[] {
  if (depth > 5 || out.length >= 25) return out;

  if (Array.isArray(value)) {
    for (const item of value.slice(0, 3)) collectImageKeys(item, `${path}[]`, out, depth + 1);
    return out;
  }

  if (!value || typeof value !== 'object') return out;

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const full = path ? `${path}.${key}` : key;
    if (typeof child === 'string') {
      if (isMediaUrl(child) && !out.includes(full)) out.push(full);
    } else {
      collectImageKeys(child, full, out, depth + 1);
    }
  }

  return out;
}

async function main() {
  const accounts = await prisma.account.findMany({
    where: ALL ? {} : { avatarUrl: null },
    select: { id: true, name: true, avatarUrl: true, platform: { select: { name: true } } },
    orderBy: { name: 'asc' },
  });

  console.log('\n>> استخراج صور الحسابات من العيّنات المحفوظة');
  console.log(`   الحسابات المفحوصة: ${accounts.length}${ALL ? ' (الكلّ)' : ' (بلا صورة)'}`);
  console.log(`   الوضع: ${CONFIRM ? 'حفظ' : 'عرضٌ فقط — لن يُكتب شيء'}\n`);

  const found: { id: string; name: string; url: string }[] = [];
  const missing: { name: string; platform: string; keys: string[]; runs: number }[] = [];

  for (const account of accounts) {
    const runs = await prisma.extractionRun.findMany({
      where: { accountId: account.id, rawSample: { not: undefined } },
      orderBy: { createdAt: 'desc' },
      take: RUNS_PER_ACCOUNT,
      select: { rawSample: true },
    });

    let url: string | null = null;
    const keys: string[] = [];

    for (const run of runs) {
      const sample = run.rawSample as unknown;
      if (!sample) continue;
      /*
       * العيّنة مصفوفة عناصر، والبحث يبدأ من الجذر فلا ينزل إلا إلى فروع
       * الحساب — فتُفحص عناصرها واحداً واحداً لا الكائن الحاوي.
       */
      for (const item of Array.isArray(sample) ? sample : [sample]) {
        url = findProfileImage(item);
        if (url) break;
      }
      if (url) break;
      if (SHOW_KEYS && keys.length === 0) keys.push(...collectImageKeys(sample));
    }

    if (url) {
      found.push({ id: account.id, name: account.name, url });
    } else {
      missing.push({
        name: account.name,
        platform: account.platform.name,
        keys,
        runs: runs.length,
      });
    }
  }

  if (found.length > 0) {
    console.log(`   وُجدت صورة لـ ${found.length} حساباً:`);
    for (const entry of found.slice(0, 20)) {
      console.log(`     ${entry.name}`);
      console.log(`        ${entry.url.slice(0, 110)}`);
    }
    if (found.length > 20) console.log(`     … و${found.length - 20} غيرها.`);
  }

  if (missing.length > 0) {
    console.log(`\n   بلا صورة: ${missing.length} حساباً`);
    for (const entry of missing.slice(0, 15)) {
      const why = entry.runs === 0 ? 'لا عيّنات محفوظة' : 'العيّنة لا تحمل صورة حساب';
      console.log(`     ${entry.name} (${entry.platform}) — ${why}`);
      if (entry.keys.length > 0) {
        console.log(`        مفاتيح الصور في العيّنة: ${entry.keys.slice(0, 8).join('، ')}`);
      }
    }
    if (missing.length > 15) console.log(`     … و${missing.length - 15} غيرها.`);
    if (!SHOW_KEYS) {
      console.log('\n   لمعرفة ما في العيّنة من مفاتيح صور، أعد الأمر مع --keys');
    }
  }

  if (found.length === 0) {
    console.log('\n   لا شيء يُحفظ.\n');
    await prisma.$disconnect();
    return;
  }

  if (!CONFIRM) {
    console.log('\n   لم يُحفظ شيء. للحفظ أضف --confirm\n');
    await prisma.$disconnect();
    return;
  }

  let saved = 0;
  for (const entry of found) {
    await prisma.account
      .update({ where: { id: entry.id }, data: { avatarUrl: entry.url } })
      .then(() => {
        saved += 1;
      })
      .catch(() => undefined);
  }

  console.log(`\n✓ حُفظت صورة لـ ${saved} حساباً.\n`);
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error('\n✗ فشل التنفيذ:', error instanceof Error ? error.message : error);
  await prisma.$disconnect();
  process.exit(1);
});

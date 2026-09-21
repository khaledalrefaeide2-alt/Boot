/**
 * حذف الردود المخزّنة قبل أن يوجد استبعادها.
 *
 *   npm run cleanup:replies                    # عرضٌ فقط — لا يحذف شيئاً
 *   npm run cleanup:replies -- --limit 50      # جولة أولى حذرة
 *   npm run cleanup:replies -- --account <id>  # حساب واحد
 *   npm run cleanup:replies -- --hide          # إخفاء بدل حذف (قابل للتراجع)
 *   npm run cleanup:replies -- --confirm       # التنفيذ الفعلي
 *
 * لماذا العرض أوّلاً وليس خياراً:
 *
 * الردود القديمة دخلت القاعدة قبل أن يوجد كشف الردّ، فلم يُحفظ معها ما
 * يُثبت أنها ردود. والعمود `rawData` الذي كان سيحسم الأمر لا يكتبه
 * الاستيراد أصلاً، فيبقى نصّ المنشور دليلاً وحيداً وظنّياً: تغريدة أصلية
 * تخاطب جهةً تبدأ بمنشنٍ كما يبدأ الردّ تماماً. ولا يُبنى حذفٌ لا رجعة فيه
 * على دليل ظنّي دون أن يراه صاحب البيانات. فالافتراض عرضٌ لا حذف، والحذف
 * لا يقع إلا بـ --confirm بعد أن يُعرَض ما سيقع عليه.
 *
 * ويُبقي السلاسل الذاتية كما يُبقيها الاستيراد: الجزء الثاني من بيانٍ
 * يكتبه الحساب ردّاً على نفسه منشورٌ لا ردّ.
 */
import 'dotenv/config';
import { prisma } from '../src/lib/db';
import { isDeletableReply, type ReplyConfidence } from '../src/lib/extraction/reply-detect';
import { affectedDays, refreshAccountStats, refreshPlatformStats } from '../src/lib/stats';

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const CONFIRM = process.argv.includes('--confirm');
const HIDE = process.argv.includes('--hide');
const ONLY_CERTAIN = process.argv.includes('--only-certain');
const PLATFORM_CODE = arg('platform') ?? 'x';
const ACCOUNT_ID = arg('account') ?? null;
const LIMIT = Number(arg('limit') ?? '0');
const SAMPLE_CAP = Number(arg('sample') ?? '12');

const BATCH = 500;
const DELETE_CHUNK = 200;
const SAMPLES_PER_ACCOUNT = 3;

interface Candidate {
  id: string;
  accountId: string;
  platformId: string;
  publishedAt: Date | null;
  text: string | null;
  url: string | null;
  reason: string;
  confidence: ReplyConfidence;
}

interface AccountTally {
  name: string;
  username: string | null;
  count: number;
  samples: Candidate[];
}

function excerpt(text: string | null, max = 90): string {
  const clean = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!clean) return '(بلا نصّ)';
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

function day(date: Date | null): string {
  return date ? date.toISOString().slice(0, 10) : '—';
}

/*
 * الإخفاء يكتب سبباً في حقل المراجعة ليعرف من يرى المنشور مُخفى لماذا أُخفي.
 * لكنه لا يدوس ملاحظةً كتبها مراجعٌ بيده — تلك عملُ إنسان، والسكربت لا يمحوه.
 */
const HIDE_NOTE = 'ردّ — أُخفي بتنظيف الردود المخزّنة';

async function hideChunk(ids: string[]): Promise<number> {
  const [fresh, noted] = await Promise.all([
    prisma.post.updateMany({
      where: { id: { in: ids }, reviewNote: null },
      data: { isHidden: true, reviewNote: HIDE_NOTE },
    }),
    prisma.post.updateMany({
      where: { id: { in: ids }, NOT: { reviewNote: null } },
      data: { isHidden: true },
    }),
  ]);
  return fresh.count + noted.count;
}

async function main() {
  const platform = await prisma.platform.findUnique({
    where: { code: PLATFORM_CODE },
    select: { id: true, name: true, code: true },
  });

  if (!platform) {
    console.error(`\n✗ لا توجد منصة بالرمز «${PLATFORM_CODE}».\n`);
    process.exit(1);
  }

  const action = HIDE ? 'إخفاء' : 'حذف';

  console.log('\n>> تنظيف الردود المخزّنة سابقاً');
  console.log(`   المنصة: ${platform.name} (${platform.code})`);
  if (ACCOUNT_ID) console.log(`   الحساب: ${ACCOUNT_ID}`);
  console.log(`   الإجراء: ${action}${CONFIRM ? '' : ' — عرضٌ فقط، لن يُنفَّذ شيء'}`);
  if (ONLY_CERTAIN) console.log('   مقصور على الأحكام القاطعة (حقول المزوّد المحفوظة)');
  if (LIMIT > 0) console.log(`   سقف هذه الجولة: ${LIMIT} منشوراً`);

  const candidates: Candidate[] = [];
  const tallies = new Map<string, AccountTally>();
  const byConfidence: Record<ReplyConfidence, number> = { certain: 0, likely: 0 };
  let scanned = 0;
  let selfThreads = 0;
  let cursor: string | undefined;

  scan: for (;;) {
    const posts = await prisma.post.findMany({
      where: {
        platformId: platform.id,
        ...(ACCOUNT_ID ? { accountId: ACCOUNT_ID } : {}),
        ...(HIDE ? { isHidden: false } : {}),
      },
      select: {
        id: true,
        accountId: true,
        platformId: true,
        publishedAt: true,
        text: true,
        url: true,
        rawData: true,
        account: { select: { name: true, username: true } },
      },
      orderBy: { id: 'asc' },
      take: BATCH,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    if (posts.length === 0) break;
    cursor = posts[posts.length - 1]!.id;
    scanned += posts.length;

    for (const post of posts) {
      const verdict = isDeletableReply(
        { text: post.text, rawData: post.rawData },
        post.account?.username ?? null,
      );

      if (verdict.isReply && !verdict.deletable) selfThreads += 1;
      if (!verdict.deletable) continue;
      if (ONLY_CERTAIN && verdict.confidence !== 'certain') continue;

      const candidate: Candidate = {
        id: post.id,
        accountId: post.accountId,
        platformId: post.platformId,
        publishedAt: post.publishedAt,
        text: post.text,
        url: post.url,
        reason: verdict.reason,
        confidence: verdict.confidence,
      };

      candidates.push(candidate);
      byConfidence[verdict.confidence] += 1;

      const tally = tallies.get(post.accountId) ?? {
        name: post.account?.name ?? '(حساب محذوف)',
        username: post.account?.username ?? null,
        count: 0,
        samples: [],
      };
      tally.count += 1;
      if (tally.samples.length < SAMPLES_PER_ACCOUNT) tally.samples.push(candidate);
      tallies.set(post.accountId, tally);

      if (LIMIT > 0 && candidates.length >= LIMIT) break scan;
    }
  }

  console.log(`\n   فُحص ${scanned} منشوراً · مرشّح لل${action} ${candidates.length}`);
  console.log(`   أحكام قاطعة ${byConfidence.certain} · أحكام ظنّية من النصّ ${byConfidence.likely}`);
  console.log(`   سلاسل ذاتية أُبقيت ${selfThreads}`);

  if (candidates.length === 0) {
    console.log('\n✓ لا شيء يُحذف.\n');
    await prisma.$disconnect();
    return;
  }

  console.log('\n   التوزّع على الحسابات:');
  const ordered = Array.from(tallies.values()).sort((a, b) => b.count - a.count);
  for (const tally of ordered) {
    const handle = tally.username ? `@${tally.username}` : '—';
    console.log(`     ${String(tally.count).padStart(6)}  ${handle} · ${tally.name}`);
  }

  console.log(`\n   عيّنة ممّا سيُ${HIDE ? 'خفى' : 'حذف'}:`);
  let printed = 0;
  for (const tally of ordered) {
    for (const sample of tally.samples) {
      if (printed >= SAMPLE_CAP) break;
      console.log(`     [${day(sample.publishedAt)}] ${excerpt(sample.text)}`);
      console.log(`        ${sample.reason}`);
      if (sample.url) console.log(`        ${sample.url}`);
      printed += 1;
    }
    if (printed >= SAMPLE_CAP) break;
  }
  if (candidates.length > printed) {
    console.log(`     … وبقية ${candidates.length - printed} غير معروضة.`);
  }

  if (byConfidence.likely > 0) {
    console.log(
      '\n   ⚠ الأحكام الظنّية مبنية على أن النصّ يبدأ بمنشن، وهو ما يفعله الردّ' +
        '\n     وتفعله كذلك تغريدة أصلية تخاطب جهةً. راجع العيّنة قبل التنفيذ،' +
        '\n     وإن شككت فابدأ بـ --hide فهو قابل للتراجع، أو بـ --limit صغير.',
    );
  }

  if (!CONFIRM) {
    console.log('\n   لم يُنفَّذ شيء. للتنفيذ أضف --confirm إلى الأمر نفسه:');
    console.log(
      `     npm run cleanup:replies -- ${process.argv.slice(2).join(' ')} --confirm`.replace(/\s+/g, ' '),
    );
    console.log('');
    await prisma.$disconnect();
    return;
  }

  console.log(`\n   جارٍ ال${action}…`);
  let done = 0;
  for (let index = 0; index < candidates.length; index += DELETE_CHUNK) {
    const ids = candidates.slice(index, index + DELETE_CHUNK).map((candidate) => candidate.id);
    done += HIDE ? await hideChunk(ids) : (await prisma.post.deleteMany({ where: { id: { in: ids } } })).count;
    console.log(`     ${done} / ${candidates.length}`);
  }

  /*
   * الإحصاءات اليومية جداول محسوبة مسبقاً، فحذف المنشور لا يُنقصها من
   * تلقاء نفسه. وتركها يعني لوحاتٍ تعدّ ما لم يعد موجوداً — فتُعاد أيام
   * ما حُذف وحدها لا السنة كلها.
   */
  const perAccount = new Map<string, { platformId: string; dates: (Date | null)[] }>();
  for (const candidate of candidates) {
    const entry = perAccount.get(candidate.accountId) ?? {
      platformId: candidate.platformId,
      dates: [],
    };
    entry.dates.push(candidate.publishedAt);
    perAccount.set(candidate.accountId, entry);
  }

  console.log('   إعادة حساب الإحصاءات اليومية للأيام المتأثرة…');
  const platformDays = new Set<number>();
  for (const [accountId, entry] of perAccount) {
    const days = affectedDays(entry.dates);
    await refreshAccountStats(accountId, days);
    for (const date of days) platformDays.add(date.getTime());
  }
  await refreshPlatformStats(
    platform.id,
    Array.from(platformDays).map((time) => new Date(time)),
  );

  console.log(`\n✓ تمّ ${action} ${done} منشوراً، وأُعيد حساب ${platformDays.size} يوماً.\n`);
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error('\n✗ فشل التنفيذ:', error instanceof Error ? error.message : error);
  await prisma.$disconnect();
  process.exit(1);
});

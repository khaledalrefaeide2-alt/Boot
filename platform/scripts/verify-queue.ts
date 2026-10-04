/**
 * فحص طابور التصنيف — على قاعدةٍ حقيقية لا على نصّ الشيفرة.
 *
 * ★ ولماذا هذا الفحص وحده يحتاج قاعدة؟
 *
 *   لأنّ ما انكسر ثلاث مرّات لا يُكشف بقراءة نصّ. فحصٌ يبحث عن
 *   `orderBy: { id: 'desc' }` يمرّ على شيفرةٍ ترتيبُها خاطئ تماماً — إن
 *   كان مولّد المعرّفات غير مرتَّب زمنياً — ويفشل على شيفرةٍ صحيحة كتبت
 *   الترتيب بصيغةٍ أخرى. وهو يقيس الحرف لا الأثر.
 *
 *   وهذا يُدخل منشوراتٍ **معرّفاتُها معكوسةٌ عمداً** عن تواريخ نشرها، ثمّ
 *   يسأل القاعدة: من يأتي أوّلاً؟ فإن كان الجواب «الأقدم» سقط الفحص —
 *   ولو كان نصّ الشيفرة يقول خلاف ذلك.
 *
 * ★ ولا يمسّ بيانات أحد.
 *
 *   كلّ ما يكتبه داخل معاملةٍ تُلغى في آخرها دائماً، نجح الفحص أو فشل.
 *   ويقرأ `VERIFY_DATABASE_URL` وحده — لا `DATABASE_URL` — فلا يصيب قاعدة
 *   الإنتاج بخطأ متغيّرٍ منسيّ في الصدفة.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type Prisma } from '../src/generated/prisma';
import { storedFilters, targetWhere } from '../src/lib/analysis/run';
import { NEWEST_FIRST } from '../src/lib/queries/post-order';
import { postFiltersSchema } from '../src/lib/validation/posts';

const url = process.env.VERIFY_DATABASE_URL;
if (!url) {
  console.error(
    '\n✗ هذا الفحص يحتاج قاعدة اختبار.\n' +
      '  VERIFY_DATABASE_URL="postgresql://…/db_test" npm run verify:queue\n\n' +
      '  ولا يقرأ DATABASE_URL عمداً: ما يكتبه يُلغى في آخره، ولكنّ\n' +
      '  تشغيله على قاعدة الإنتاج بالخطأ لا يستحقّ أن يكون ممكناً.\n',
  );
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

const checks: { name: string; ok: boolean; detail?: string }[] = [];
function check(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
}

/** عَلَمُ الإلغاء — يُرمى في آخر المعاملة فتُلغى كتابتُها كلها */
class Rollback extends Error {}

const d = (iso: string) => new Date(iso);

async function main() {
  try {
    await prisma.$transaction(
      async (tx) => {
        const platform = await tx.platform.create({
          data: { code: `vq-${Date.now()}`, name: 'فحص الطابور' },
        });
        const account = await tx.account.create({
          data: { platformId: platform.id, name: 'حساب فحص', url: 'https://example.invalid/vq' },
        });

        /*
         * ★ المعرّفات معكوسةٌ عمداً عن تواريخ النشر.
         *
         *   الأحدث نشراً يحمل أصغر معرّف، والأقدم يحمل أكبره. فترتيبٌ
         *   يعتمد على المعرّف — كالذي كان — يُخرج الأقدم أوّلاً، ويسقط
         *   هذا الفحص. وهو ما يجعله فحصاً لا توكيداً.
         */
        const rows = [
          { key: 'A', id: 'vq-aaaa', word: 'ألِف', publishedAt: d('2026-10-04T09:00:00Z') }, // الأحدث
          { key: 'B', id: 'vq-bbbb', word: 'باء', publishedAt: d('2026-10-02T09:00:00Z') },
          { key: 'C', id: 'vq-cccc', word: 'جيم', publishedAt: d('2026-09-20T09:00:00Z') }, // الأقدم
          { key: 'D', id: 'vq-dddd', word: 'دال', publishedAt: null }, // بلا تاريخ نشر
        ];

        for (const row of rows) {
          await tx.post.create({
            data: {
              id: row.id,
              accountId: account.id,
              platformId: platform.id,
              dedupeKey: row.key,
              // كلمةٌ مميّزة لكلٍّ: حدُّ البحث حرفان، والحرف الواحد يُسقَط فيتّسع الفلتر بلا أن يُقال
              text: `منشور ${row.word}`,
              publishedAt: row.publishedAt,
            },
          });
        }

        const name = (id: string) => rows.find((row) => row.id === id)?.key ?? id;
        const stored = storedFilters(postFiltersSchema.parse({ range: 'all' }), null);

        async function queue(where: Prisma.PostWhereInput): Promise<string> {
          const found = await tx.post.findMany({
            where: { AND: [where, { accountId: account.id }] },
            select: { id: true },
            orderBy: NEWEST_FIRST,
          });
          return found.map((row) => name(row.id)).join('');
        }

        // ── ١) الترتيب: الأحدث نشراً أوّلاً، والفارغ قبله ──

        const order = await queue(targetWhere(stored, false));
        check(
          'الطابور يبدأ بالأحدث نشراً لا بالأقدم',
          order === 'DABC',
          `المتوقَّع DABC — بلا تاريخ، ثمّ ٤ تشرين، ثمّ ٢ تشرين، ثمّ ٢٠ أيلول. والناتج ${order}`,
        );
        check(
          'ولا يتبع ترتيب المعرّف',
          order !== 'DCBA',
          'DCBA هو ما يُخرجه الترتيب بالمعرّف — أي الأقدم نشراً أوّلاً، وهو العطب نفسه',
        );

        // ── ٢) الطابور يضيق بالعمل، فلا يحتاج مؤشّراً ──

        await tx.post.update({
          where: { id: 'vq-aaaa' },
          data: { analyzedAt: d('2026-10-04T10:00:00Z') },
        });
        const afterOne = await queue(targetWhere(stored, false));
        check(
          'والمنشور يخرج من الطابور بمجرّد تصنيفه',
          afterOne === 'DBC',
          `المتوقَّع DBC بعد خروج A، والناتج ${afterOne}`,
        );

        // ── ٣) جولة الإعادة تُفرِغ نفسها كذلك ──

        const reStored = storedFilters(
          postFiltersSchema.parse({ range: 'all' }),
          null,
          null,
          d('2026-10-04T09:30:00Z'),
        );
        const reBefore = await queue(targetWhere(reStored, true));
        check(
          'وجولة الإعادة تشمل المنتظرين ومن صُنّف قبل حدّها',
          reBefore === 'DBC',
          `A صُنّف الساعة ١٠:٠٠ والحدّ ٠٩:٣٠، فهو خارجها. والمتوقَّع DBC، والناتج ${reBefore}`,
        );

        await tx.post.update({
          where: { id: 'vq-bbbb' },
          data: { analyzedAt: d('2026-10-04T09:00:00Z') },
        });
        const reAfter = await queue(targetWhere(reStored, true));
        check(
          'ومن صُنّف قبل الحدّ يبقى فيها',
          reAfter === 'DBC',
          `B صُنّف الساعة ٠٩:٠٠ أي قبل الحدّ، فيبقى. والناتج ${reAfter}`,
        );

        await tx.post.update({
          where: { id: 'vq-bbbb' },
          data: { analyzedAt: d('2026-10-04T11:00:00Z') },
        });
        const reDrained = await queue(targetWhere(reStored, true));
        check(
          'وتخرج منها بإعادة تصنيفها — فتفرغ بالعمل نفسه',
          reDrained === 'DC',
          `بعد إعادة تصنيف B صار وقتُه بعد الحدّ، فالمتوقَّع DC والناتج ${reDrained}`,
        );

        // ── ٤) حدّ الاستخراج لا يُلغيه شرط الطابور ──

        // B عاد إلى الطابور، فيُقاس حدُّ الاستخراج وحده لا بقايا ما قبله
        await tx.post.update({ where: { id: 'vq-bbbb' }, data: { analyzedAt: null } });

        const sinceStored = storedFilters(
          postFiltersSchema.parse({ range: 'all' }),
          null,
          new Date(Date.now() - 60_000),
        );
        const sinceAll = await queue(targetWhere(sinceStored, false));
        check(
          'وحدّ «المستخرج بعد» يجتمع مع شرط الطابور لا يُلغيه',
          sinceAll === 'DBC',
          `كلّها استُوردت الآن، فيبقى الطابور DBC. والناتج ${sinceAll}`,
        );

        // ── ٥) البحث النصّي لا يسقط تحت شرط الإعادة ──

        /*
         * ★ هذا ما كاد يقع حين صار لشرط الإعادة `OR`.
         *
         *   البحث النصّي يكتب `OR` أيضاً. ولو رُكّبت الشروط بالنشر لمحا
         *   أحدهما الآخر: جولةٌ على كلمةٍ بعينها تصير جولةً على كلّ شيء،
         *   وتُنفق على آلافٍ لم يطلبها أحد.
         */
        const searched = await queue(
          targetWhere(
            storedFilters(
              /*
               * `qMode: 'any'` لا الافتراضي — وهذا هو بيت القصيد.
               *
               * نمط «كلّها» يكتب الشرط في `AND`، ونمط «أيّها» يكتبه في
               * `OR` — وهو المفتاح الذي يكتبه شرطُ الإعادة. فبالنمط
               * الافتراضي لا يتصادم المفتاحان، ويمرّ الفحص على شيفرةٍ
               * تدمج بالنشر كما يمرّ على شيفرةٍ تدمج بـ`AND`: توكيدٌ
               * يبدو صحيحاً ولا يحرس شيئاً. وقد كان كذلك أوّل مرّة،
               * فكشفه كسرُ الشيفرة عمداً ورؤيةُ الفحص يمرّ.
               */
              postFiltersSchema.parse({ range: 'all', q: 'جيم', qMode: 'any' }),
              null,
              null,
              d('2026-10-04T09:30:00Z'),
            ),
            true,
          ),
        );
        check(
          'والبحث النصّي لا يسقط تحت شرط إعادة التصنيف',
          searched === 'C',
          `المتوقَّع C وحده — وهو الوحيد الذي يحمل الكلمة. والناتج «${searched}»، وزيادتُه تعني أنّ الكلمة سقطت تحت شرط الإعادة`,
        );

        const searchPending = await queue(
          targetWhere(
            storedFilters(postFiltersSchema.parse({ range: 'all', q: 'دال', qMode: 'any' }), null),
            false,
          ),
        );
        check(
          'ويعمل في الطابور كما يعمل خارجه',
          searchPending === 'D',
          `المتوقَّع D وحده، والناتج «${searchPending}»`,
        );

        // ── ٦) العمود وصفّ التحليل لا يفترقان ──

        /*
         * ويُستثنى حسابُ الفحص: صفوفُه كُتب فيها `analyzedAt` باليد بلا
         * صفّ تحليل، وهي أداةُ الفحص لا موضوعه. والموضوع ما في القاعدة
         * فعلاً — ولذلك يُقرأ هذا الفحص على نسخةٍ مملوءة لا على قاعدةٍ
         * فارغة، وعلى الفارغة يمرّ بلا أن يقول شيئاً.
         */
        const stray = await tx.$queryRaw<{ count: bigint }[]>`
          SELECT COUNT(*)::bigint AS count
          FROM "posts" p
          LEFT JOIN "post_analyses" a ON a."postId" = p."id"
          WHERE (p."analyzedAt" IS NULL) <> (a."postId" IS NULL)
            AND p."accountId" <> ${account.id}
        `;
        check(
          'و«مرّ على التصنيف» يطابق وجود صفّ التحليل في القاعدة كلها',
          (stray[0]?.count ?? 0n) === 0n,
          `${stray[0]?.count ?? 0n} منشوراً يقول عمودُه شيئاً ويقول جدولُ التحاليل خلافه — وهو ما يُبقي منشوراً يُصنَّف كلّ دورة بثمنٍ كامل`,
        );

        throw new Rollback();
      },
      { timeout: 60_000 },
    );
  } catch (error) {
    if (!(error instanceof Rollback)) throw error;
  }
}

main()
  .then(async () => {
    const failed = checks.filter((item) => !item.ok);
    console.log('\n>> فحص طابور التصنيف (على قاعدة حقيقية)\n');
    for (const item of checks) {
      console.log(`  ${item.ok ? '✓' : '✗'} ${item.name}`);
      if (!item.ok && item.detail) console.log(`      ${item.detail}`);
    }
    console.log(`\n${checks.length - failed.length}/${checks.length} فحصاً ناجحاً`);
    if (failed.length > 0) {
      console.log(`\n✗ ${failed.length} فحصاً فاشلاً\n`);
      process.exitCode = 1;
    } else {
      console.log('');
    }
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error('\n✗ تعذّر الفحص:', error instanceof Error ? error.message : error, '\n');
    await prisma.$disconnect();
    process.exit(1);
  });

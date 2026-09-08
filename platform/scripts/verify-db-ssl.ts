/**
 * فحص إعداد TLS لاتصال قاعدة البيانات — بلا أي اتصال فعلي.
 *
 *   npm run verify:db-ssl
 *
 * الفحص يبني عميل `pg` حقيقياً من الخيارات التي تنتجها `prismaPgOptions`
 * ويقرأ `connectionParameters.ssl` **قبل** استدعاء `connect`. هذا هو الموضع
 * الذي تُحسم فيه المسألة: `pg` يحلّل رابط الاتصال ويشتقّ منه إعداد TLS، وما
 * يشتقّه يحلّ محلّ الكائن الممرَّر بجانبه.
 *
 * والسبب في وجود هذا الملف أن الخطأ هنا صامت: الشهادة تختفي من الإعداد بلا
 * رسالة، فيفشل الاتصال بخطأ شهادة غامض — أو أسوأ، ينجح بلا تحقق من الهوية.
 */
import { Client } from 'pg';
import {
  CA_ENV_VAR,
  databaseUrlForPrismaCli,
  prismaPgOptions,
} from '../src/lib/db-ssl';

/*
 * شهادة اختبار لا تخصّ أي خادم. تنتهي بسطر جديد عمداً: المساعد يُطبّع كل
 * شهادة إلى سطر أخير واحد، فمقارنتها بنصّ بلا سطر أخير تفشل لسبب لا علاقة
 * له بما نفحصه.
 */
const CA = [
  '-----BEGIN CERTIFICATE-----',
  'RkFLRS1DRVJUSUZJQ0FURS1GT1ItVEVTVElORy1PTkxZ',
  '-----END CERTIFICATE-----',
  '',
].join('\n');

const BASE = 'postgresql://user:pass@db.example.com:25060/defaultdb';

let failures = 0;

function check(label: string, ok: boolean, detail = ''): void {
  if (!ok) failures++;
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? `  — ${detail}` : ''}`);
}

/** إعداد TLS كما تراه `pg` فعلاً، بلا فتح أي اتصال */
function sslAsPgSeesIt(connectionString: string): {
  ssl: unknown;
  ca?: unknown;
  rejectUnauthorized?: unknown;
  threw?: string;
} {
  try {
    const client = new Client(prismaPgOptions(connectionString));
    const ssl = (client as unknown as { connectionParameters: { ssl: unknown } })
      .connectionParameters.ssl;
    const bag = ssl && typeof ssl === 'object' ? (ssl as Record<string, unknown>) : {};
    return { ssl, ca: bag.ca, rejectUnauthorized: bag.rejectUnauthorized };
  } catch (error) {
    return { ssl: undefined, threw: error instanceof Error ? error.message : String(error) };
  }
}

function withCa<T>(run: () => T): T {
  process.env[CA_ENV_VAR] = CA;
  try {
    return run();
  } finally {
    delete process.env[CA_ENV_VAR];
  }
}

console.log('\n>> إعداد TLS لقاعدة البيانات\n');

// ---------------------------------------------------------------------------
console.log('  ── بشهادة: الرابط يحمل معاملات TLS ─────────────────────────');

withCa(() => {
  // الحالة الحقيقية: رابط DigitalOcean يأتي بـ ?sslmode=require
  const opts = prismaPgOptions(`${BASE}?sslmode=require`);
  check('الرابط الممرَّر خالٍ من sslmode', !opts.connectionString.includes('sslmode'),
    opts.connectionString.split('?')[1] ?? '(بلا معاملات)');

  const seen = sslAsPgSeesIt(`${BASE}?sslmode=require`);
  check('pg يرى الشهادة', seen.ca === CA);
  check('pg يرى rejectUnauthorized = true', seen.rejectUnauthorized === true);
});

withCa(() => {
  // لو تسرّبت no-verify إلى الرابط، يجب ألّا تُعطّل تحققنا
  const seen = sslAsPgSeesIt(`${BASE}?sslmode=no-verify`);
  check('sslmode=no-verify لا يُعطّل التحقق', seen.rejectUnauthorized === true);
  check('والشهادة تبقى', seen.ca === CA);
});

withCa(() => {
  // sslrootcert لملف مفقود كان يرمي ENOENT عند إنشاء العميل
  const seen = sslAsPgSeesIt(`${BASE}?sslmode=require&sslrootcert=/nonexistent/ca.crt`);
  check('sslrootcert لملف مفقود لا يرمي استثناء', seen.threw === undefined, seen.threw ?? '');
  check('والشهادة تبقى', seen.ca === CA);
});

withCa(() => {
  const opts = prismaPgOptions(`${BASE}?schema=public&sslmode=require&sslkey=/x.key`);
  check('معاملات غير TLS تبقى (schema)', opts.connectionString.includes('schema=public'));
  check('sslkey يُنزع أيضاً', !opts.connectionString.includes('sslkey'));
});

// ---------------------------------------------------------------------------
console.log('\n  ── بشهادة: رابط بلا معاملات TLS ────────────────────────────');

withCa(() => {
  const plain = `${BASE}?schema=public`;
  const opts = prismaPgOptions(plain);
  check('الرابط يُترك حرفياً كما هو', opts.connectionString === plain);
  const seen = sslAsPgSeesIt(plain);
  check('pg يرى الشهادة والتحقق', seen.ca === CA && seen.rejectUnauthorized === true);
});

// ---------------------------------------------------------------------------
console.log('\n  ── بلا شهادة: التشغيل المحلي كما كان ───────────────────────');

{
  delete process.env[CA_ENV_VAR];

  const local = 'postgresql://monitor:pass@localhost:5432/monitoring?schema=public';
  const opts = prismaPgOptions(local);
  check('لا كائن ssl إطلاقاً', opts.ssl === undefined);
  check('الرابط بلا أي تعديل', opts.connectionString === local);

  // ورابط فيه sslmode بلا شهادة: يبقى كما هو ليتولاه pg من الرابط كسابق عهده
  const managed = `${BASE}?sslmode=require`;
  const untouched = prismaPgOptions(managed);
  check('رابط فيه sslmode يبقى كما هو', untouched.connectionString === managed);
  check('ولا كائن ssl يُضاف', untouched.ssl === undefined);

  const seen = sslAsPgSeesIt(managed);
  check('وpg يشتقّ إعداده من الرابط كالسابق', seen.ssl !== undefined && seen.ca === undefined);
}

// ---------------------------------------------------------------------------
console.log('\n  ── مسار ترحيلات Prisma مستقل ───────────────────────────────');

withCa(() => {
  const cli = new URL(databaseUrlForPrismaCli(`${BASE}?sslmode=require`));
  check('sslmode=require يبقى (محرّك Prisma يقرأه)', cli.searchParams.get('sslmode') === 'require');
  check('sslcert يشير إلى ملف الشهادة', (cli.searchParams.get('sslcert') ?? '').endsWith('.crt'));
  check('sslaccept=strict', cli.searchParams.get('sslaccept') === 'strict');
});

// ---------------------------------------------------------------------------
console.log(
  failures === 0
    ? '\n>> إعداد TLS سليم: الشهادة تصل إلى pg، ولا معامل في الرابط يُبطلها.\n'
    : `\n>> ✗ ${failures} فحصاً فاشلاً.\n`,
);
process.exit(failures === 0 ? 0 : 1);

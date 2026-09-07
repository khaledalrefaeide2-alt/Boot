import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * تشفير الاتصال بقاعدة بيانات مُدارة، بتحقّق حقيقي من شهادة الخادم.
 *
 * القاعدة المُدارة (DigitalOcean وأمثالها) تقدّم شهادة موقّعة من سلطة خاصة
 * بها لا من سلطة عامة، فلا يعرفها مخزن الشهادات في النظام. أمام ذلك طريقان:
 * تعطيل التحقق، أو تزويد الاتصال بشهادة تلك السلطة. هذا الملف يسلك الثاني.
 *
 * التعطيل مرفوض هنا صراحةً: `sslmode=no-verify` و`rejectUnauthorized: false`
 * و`NODE_TLS_REJECT_UNAUTHORIZED=0` كلها تُبقي التشفير وتُلغي الهوية، فيصير
 * الاتصال محصّناً ضد التنصّت لا ضد انتحال الخادم — وهو الخطر الأكبر حين تمرّ
 * البيانات عبر شبكة المزوّد لا عبر سلك داخل خادم واحد.
 *
 * ولمسارَي الاتصال في هذا المشروع صيغتان مختلفتان لا واحدة:
 *
 *   • التطبيق والعامل والبذر → مكتبة `pg` عبر `PrismaPg`، وتقبل خيارات
 *     Node القياسية: `{ ca, rejectUnauthorized: true }`.
 *
 *   • ترحيلات Prisma (`prisma migrate deploy`) → محرّك Rust مستقل لا يقرأ
 *     شيئاً من شيفرتنا، ويأخذ إعداده من معاملات رابط الاتصال وحدها.
 *
 * والمعاملات التي يقرأها ذلك المحرّك ليست معاملات libpq المعتادة — وهذا
 * مُختبَر لا مفترض: رابطٌ فيه `sslmode=verify-full&sslrootcert=…` تجاهل
 * الشهادة تماماً وأعطى خطأ اتصال، بينما `sslcert=…&sslaccept=strict` قرأ
 * الملف فعلاً وأعطى خطأ تحليل PEM. فالمعاملات الصحيحة هي الثانية.
 */

/** اسم متغيّر البيئة الحامل لشهادة سلطة التصديق */
export const CA_ENV_VAR = 'DATABASE_CA_CERT';

const PEM_MARKER = '-----BEGIN';

/**
 * الشهادة كما وردت، مهما كانت صيغة لصقها.
 *
 * حقول البيئة في لوحات الاستضافة تعادي النصوص متعددة الأسطر: بعضها يقصّها
 * عند أول سطر، وبعضها يحوّل الأسطر إلى `\n` حرفية. فنقبل ثلاث صيغ ونخرج
 * بواحدة: PEM كما هو، أو PEM بأسطر مهروبة، أو PEM مُرمّز بـ base64.
 */
export function databaseCaCertificate(): string | undefined {
  const raw = process.env[CA_ENV_VAR]?.trim();
  if (!raw) return undefined;

  // سطر أخير واحد دائماً: بعض قارئات PEM ترفض ملفاً لا ينتهي بسطر جديد،
  // وبعضها يتعثّر بأسطر فارغة متعددة. التطبيع هنا يجنّبنا الحالتين معاً.
  const normalize = (pem: string): string => `${pem.trim()}\n`;

  if (raw.includes(PEM_MARKER)) {
    // سطور مهروبة تعود سطوراً حقيقية، وإلا رفض OpenSSL الشهادة
    return normalize(raw.includes('\\n') ? raw.replace(/\\n/g, '\n') : raw);
  }

  const decoded = Buffer.from(raw, 'base64').toString('utf8');
  if (decoded.includes(PEM_MARKER)) return normalize(decoded);

  throw new Error(
    `${CA_ENV_VAR} لا يحمل شهادة صالحة — يجب أن يكون PEM يبدأ بـ "${PEM_MARKER}" أو نصّه مُرمّزاً بـ base64`,
  );
}

/**
 * خيارات TLS لمكتبة `pg`.
 *
 * `rejectUnauthorized: true` صريحة رغم كونها الافتراض: قراءتها في الكود
 * تُغني عن التساؤل، وتكشف أي محاولة لاحقة لقلبها.
 */
export function pgSslOptions(): { ca: string; rejectUnauthorized: true } | undefined {
  const ca = databaseCaCertificate();
  return ca ? { ca, rejectUnauthorized: true } : undefined;
}

/**
 * خيارات `PrismaPg` جاهزة — تُستعمل في التطبيق والعامل والبذر والسكربتات
 * الإدارية، فيبقى إعداد الاتصال واحداً لا أربعة تتفرّق مع الوقت.
 */
export function prismaPgOptions(connectionString: string): {
  connectionString: string;
  ssl?: { ca: string; rejectUnauthorized: true };
} {
  const ssl = pgSslOptions();
  return ssl ? { connectionString, ssl } : { connectionString };
}

/**
 * كتابة الشهادة في ملف مؤقّت وإرجاع مساره.
 *
 * محرّك Prisma يقرأ الشهادة من ملف لا من متغيّر بيئة، والمنصة تسلّمنا إياها
 * نصّاً. الاسم مشتقّ من بصمة المحتوى، فالكتابة تتم مرة واحدة ولا تتكرر مع
 * كل استدعاء، وتغيير الشهادة يعطي ملفاً جديداً تلقائياً.
 */
export function caCertificateFile(): string | undefined {
  const ca = databaseCaCertificate();
  if (!ca) return undefined;

  const digest = crypto.createHash('sha256').update(ca).digest('hex').slice(0, 16);
  const file = path.join(os.tmpdir(), `pg-ca-${digest}.crt`);

  if (!fs.existsSync(file)) {
    // 0600: الشهادة عامة بطبيعتها، لكن لا داعي لتوسيع صلاحيات ملف لا يقرأه غيرنا
    fs.writeFileSync(file, ca, { mode: 0o600 });
  }
  return file;
}

/**
 * رابط الاتصال كما يفهمه محرّك Prisma للترحيلات.
 *
 * بلا شهادة يُعاد الرابط كما هو، فيبقى التشغيل المحلي على قاعدة بلا TLS
 * عاملاً دون أي إعداد إضافي.
 */
export function databaseUrlForPrismaCli(rawUrl: string): string {
  const file = caCertificateFile();
  if (!file) return rawUrl;

  const url = new URL(rawUrl);
  url.searchParams.set('sslmode', 'require');
  url.searchParams.set('sslcert', file);
  url.searchParams.set('sslaccept', 'strict');
  // معاملات libpq لا يقرأها المحرّك، ووجودها يوهم القارئ أن التحقق قائم بها
  url.searchParams.delete('sslrootcert');
  return url.toString();
}

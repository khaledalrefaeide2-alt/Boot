import 'dotenv/config';
import path from 'node:path';
import { defineConfig } from 'prisma/config';
import { databaseUrlForPrismaCli } from './src/lib/db-ssl';

/**
 * إعداد Prisma 7 — رابط الاتصال يُقرأ من متغيرات البيئة فقط ولا يُكتب في المخطط.
 *
 * الرابط يمرّ بـ `databaseUrlForPrismaCli` لأن محرّك الترحيلات عملية مستقلة
 * لا تقرأ إعداد TLS من شيفرة التطبيق. الدالة تُضيف معاملات الشهادة إن كان
 * `DATABASE_CA_CERT` معرّفاً، وتُعيد الرابط كما هو إن لم يكن — فالتشغيل
 * المحلي على قاعدة بلا تشفير يبقى كما كان بلا إعداد إضافي.
 *
 * القراءة هنا مباشرة من `process.env` لا عبر `env()` من Prisma: نحتاج القيمة
 * نصّاً الآن لنشتقّ منها رابطاً جديداً، و`env()` مؤجّلة يقرأها المحرّك لاحقاً.
 */
const databaseUrl = process.env.DATABASE_URL;

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // الرابط الفارغ يُترك للمحرّك ليشتكي منه برسالته الواضحة بدل أن ننهار هنا
    url: databaseUrl ? databaseUrlForPrismaCli(databaseUrl) : '',
  },
});

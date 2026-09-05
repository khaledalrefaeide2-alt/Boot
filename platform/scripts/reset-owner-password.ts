/**
 * إعادة تعيين كلمة مرور حساب المالك من سطر الأوامر.
 *
 * يُستخدم عند تعذّر الدخول: نسيان كلمة المرور، أو اختلافها عمّا كُتب في
 * ملف البيئة وقت إنشاء الحساب.
 *
 * التشغيل:
 *     npm run owner:reset
 *     npm run owner:reset -- "كلمة-المرور-الجديدة"
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import Redis from 'ioredis';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '../src/generated/prisma';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('✗ DATABASE_URL غير معرّف في ملف .env');
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main(): Promise<void> {
  const email = process.env.SEED_OWNER_EMAIL?.trim().toLowerCase();
  const newPassword = process.argv[2] ?? process.env.SEED_OWNER_PASSWORD;

  // كل رسالة حاسمة تُسبق بسطر لاتيني: طرفية ويندوز لا تشكّل العربية ولا
  // ترتّبها، فيصعب على المستخدم قراءة الخطوة التالية بالعربية وحدها.
  console.log('\n-- ACCOUNTS / حسابات النظام --');
  const users = await prisma.user.findMany({
    select: { email: true, name: true, role: true, status: true, lastLoginAt: true },
    orderBy: { createdAt: 'asc' },
  });

  if (users.length === 0) {
    console.log('>> Database is empty. Run the command below on its own:');
    console.log('       npm run setup:db');
    console.log('   قاعدة البيانات فارغة — لم يُنشأ حساب المالك بعد.');
    console.log('   شغّل الأمر أعلاه ثم سجّل الدخول بالبريد وكلمة المرور من ملف .env');
    return;
  }

  for (const user of users) {
    console.log(
      `  ${user.email}  —  ${user.name}  —  ${user.role}  —  ${user.status}` +
        `  —  ${user.lastLoginAt ? 'دخل سابقاً' : 'لم يدخل بعد'}`,
    );
  }

  if (!email) {
    console.error('\n>> SEED_OWNER_EMAIL is missing from .env');
    console.error('   المتغير SEED_OWNER_EMAIL غير معرّف في ملف .env');
    process.exit(1);
  }
  if (!newPassword || newPassword.length < 10) {
    console.error('\n>> Password must be at least 10 characters');
    console.error('   كلمة المرور يجب ألا تقل عن 10 محارف');
    console.error('   مرّرها في الأمر التالي وحده:');
    console.error('       npm run owner:reset -- "MyNewPassword123"');
    process.exit(1);
  }

  const target = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true } });
  if (!target) {
    console.error(`\n>> No account found for: ${email}`);
    console.error('   لا يوجد حساب بهذا البريد. شغّل الأمر التالي وحده:');
    console.error('       npm run setup:db');
    process.exit(1);
  }

  await prisma.user.update({
    where: { id: target.id },
    data: {
      passwordHash: await bcrypt.hash(newPassword, 12),
      status: 'ACTIVE',
      failedLoginCount: 0,
      lockedUntil: null,
      mustChangePassword: false,
    },
  });

  // إبطال الجلسات القائمة بعد تغيير كلمة المرور
  await prisma.session.updateMany({
    where: { userId: target.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  // إزالة عدّادات تحديد المعدل من Redis أيضاً — القفل في قاعدة البيانات وحده
  // لا يكفي، فحدّ المحاولات المتكررة يُحفظ في Redis ويستمر رغم إعادة التعيين
  await clearRateLimits(email);

  console.log('\n>> Password reset OK. You can sign in now.');
  console.log(`   أُعيد تعيين كلمة مرور ${target.name}`);
  console.log(`   البريد: ${email}`);
  console.log(`   كلمة المرور: ${newPassword}`);
  console.log('   الحساب مفعّل، وأُزيل القفل وعدّاد المحاولات الفاشلة.');
  console.log('   يمكنك تسجيل الدخول فوراً دون انتظار.\n');
}

/** إزالة عدّادات محاولات الدخول من Redis حتى لا يبقى الحجب سارياً */
async function clearRateLimits(email: string): Promise<void> {
  const url = process.env.REDIS_URL;
  if (!url) return;

  const redis = new Redis(url, { maxRetriesPerRequest: 1, lazyConnect: true });
  try {
    await redis.connect();
    const keys = await redis.keys('rl:login:*');
    const reset = await redis.keys('rl:reset*');
    const all = [...keys, ...reset];
    if (all.length > 0) await redis.del(...all);
    console.log(`   أُزيلت ${all.length} من عدّادات المحاولات في Redis.`);
  } catch {
    console.log('   تعذّر الاتصال بـ Redis — إن بقي الحجب فانتظر 15 دقيقة.');
  } finally {
    redis.disconnect();
  }
}

main()
  .catch((error) => {
    console.error('✗ فشلت العملية:', error);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());

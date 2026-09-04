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

  console.log('\n── حسابات النظام ──');
  const users = await prisma.user.findMany({
    select: { email: true, name: true, role: true, status: true, lastLoginAt: true },
    orderBy: { createdAt: 'asc' },
  });

  if (users.length === 0) {
    console.log('لا توجد حسابات في قاعدة البيانات إطلاقاً.');
    console.log('شغّل:  npm run db:seed');
    return;
  }

  for (const user of users) {
    console.log(
      `  ${user.email}  —  ${user.name}  —  ${user.role}  —  ${user.status}` +
        `  —  ${user.lastLoginAt ? 'دخل سابقاً' : 'لم يدخل بعد'}`,
    );
  }

  if (!email) {
    console.error('\n✗ SEED_OWNER_EMAIL غير معرّف في ملف .env');
    process.exit(1);
  }
  if (!newPassword || newPassword.length < 10) {
    console.error('\n✗ كلمة المرور يجب ألا تقل عن 10 محارف');
    console.error('   مرّرها في الأمر:  npm run owner:reset -- "كلمة-المرور"');
    process.exit(1);
  }

  const target = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true } });
  if (!target) {
    console.error(`\n✗ لا يوجد حساب بالبريد: ${email}`);
    console.error('   شغّل:  npm run db:seed');
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

  console.log(`\n✅ أُعيد تعيين كلمة مرور ${target.name}`);
  console.log(`   البريد: ${email}`);
  console.log(`   كلمة المرور: ${newPassword}`);
  console.log('   الحساب مفعّل وأي إيقاف مؤقت أُزيل.\n');
}

main()
  .catch((error) => {
    console.error('✗ فشلت العملية:', error);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());

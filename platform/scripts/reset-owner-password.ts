/**
 * إعادة تعيين كلمة مرور حساب المالك من سطر الأوامر.
 *
 * يُستخدم عند تعذّر الدخول: نسيان كلمة المرور، أو اختلافها عمّا كُتب في
 * ملف البيئة وقت إنشاء الحساب.
 *
 * التشغيل:
 *     npm run owner:reset
 *
 * وتُطلب الكلمة في سؤالٍ مخفيّ: لا تظهر وأنت تكتبها، ولا تبقى في سجلّ
 * الأوامر، ولا تُطبع بعد النجاح.
 *
 * ★ ولا تُمرَّر في سطر الأوامر إلا للأتمتة (حيث لا طرفية تسأل).
 *
 *   ما يُكتب في السطر يبقى في `~/.bash_history`، ويُقرأ في `ps` لحظة
 *   التنفيذ، ويظهر في لقطة الشاشة التي تُرسَل لطلب المساعدة. وأسوأ من
 *   ذلك أنّ من ينسخ أمراً من دليلٍ ينسخه بنصّه: فتصير كلمة مرور المالك
 *   هي العبارة المكتوبة في الدليل نفسه.
 */
import 'dotenv/config';
import { stdin, stdout } from 'node:process';
import { PrismaPg } from '@prisma/adapter-pg';
import Redis from 'ioredis';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '../src/generated/prisma';
import { prismaPgOptions } from '../src/lib/db-ssl';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('✗ DATABASE_URL غير معرّف في ملف .env');
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg(prismaPgOptions(connectionString)) });

/**
 * سؤالٌ لا يُظهر ما يُكتب.
 *
 * بلا حزمة خارجية: الطرفية تُوضع في الوضع الخامّ فيصل كلّ حرف إلينا ولا
 * يُصدى إلى الشاشة. والمسح للخلف يعمل، وCtrl+C يخرج كما يتوقّع من ضغطه.
 */
function promptHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    let value = '';
    const onData = (chunk: string): void => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n' || char === '\u0004') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.removeListener('data', onData);
          stdout.write('\n');
          resolve(value);
          return;
        }
        if (char === '\u0003') {
          stdin.setRawMode(false);
          stdout.write('\n>> Cancelled / أُلغيت العملية\n');
          process.exit(130);
        }
        // مسحٌ للخلف: Backspace أو Delete
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
        else value += char;
      }
    };

    stdin.on('data', onData);
  });
}

/**
 * العبارات النائبة تُردّ.
 *
 * ★ هذه ليست حيطةً نظرية: وقعت.
 *
 *   نُسخ الأمر من رسالةٍ فيها `"كلمة_المرور_الجديدة"` موضعاً للكلمة،
 *   ولُصق بنصّه — فصارت كلمة مرور المالك هي العبارة المكتوبة في الرسالة
 *   نفسها، وهي منشورةٌ في محادثة وفي لقطة شاشة.
 *
 *   والسؤال المخفيّ يمنع تكرارها، وهذه القائمة تحرس من يُصرّ على
 *   التمرير في السطر.
 */
const PLACEHOLDERS = new Set(
  [
    'كلمة_المرور_الجديدة',
    'كلمة-المرور-الجديدة',
    'كلمة المرور الجديدة',
    'كلمة_مرور_جديدة',
    'كلمة-مرور-جديدة',
    'كلمة مرور جديدة',
    'MyNewPassword123',
    'password',
    'changeme',
  ].map((entry) => entry.toLowerCase()),
);

function placeholderRejected(value: string): boolean {
  return PLACEHOLDERS.has(value.trim().toLowerCase());
}

async function main(): Promise<void> {
  const email = process.env.SEED_OWNER_EMAIL?.trim().toLowerCase();
  const fromArgv = process.argv[2];

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
  /*
   * الترتيب: ما مُرّر في السطر، ثم سؤالٌ مخفيّ إن كانت هناك طرفية، ثم
   * ملفّ البيئة. والبيئة أخيراً عمداً — كانت أوّلاً بعد السطر، فمن شغّل
   * الأمر بلا وسيط ظنّاً أنّه يعرض الحسابات وحدها أعاد الضبط صامتاً إلى
   * كلمةٍ مرّت في ملفّ نصّي.
   */
  let newPassword = fromArgv;
  if (!newPassword && stdin.isTTY) {
    console.log('\n>> Enter the new password (hidden). Min 10 characters.');
    console.log('   اكتب كلمة المرور الجديدة — لن تظهر وأنت تكتبها. عشرة محارف فأكثر.');
    const first = await promptHidden('   كلمة المرور / Password: ');
    // تُطلب مرّتين: ما لا يُرى يُخطأ في كتابته، والخطأ هنا قفلٌ ثانٍ
    const again = await promptHidden('   أعِد كتابتها / Repeat:   ');
    if (first !== again) {
      console.error('\n>> The two entries do not match');
      console.error('   الكلمتان غير متطابقتين — أعد المحاولة.');
      process.exit(1);
    }
    newPassword = first;
  }
  newPassword ??= process.env.SEED_OWNER_PASSWORD;

  if (!newPassword || newPassword.length < 10) {
    console.error('\n>> Password must be at least 10 characters');
    console.error('   كلمة المرور يجب ألا تقل عن 10 محارف');
    console.error('   شغّل الأمر التالي وحده، وستُسأل عنها في سؤال مخفيّ:');
    console.error('       npm run owner:reset');
    process.exit(1);
  }

  if (placeholderRejected(newPassword)) {
    console.error('\n>> That is the placeholder from the docs, not a password');
    console.error('   هذه العبارةُ النائبة في الدليل لا كلمةُ مرور — وهي معروفة لكل من قرأه.');
    console.error('   شغّل الأمر بلا وسيط وستُسأل عنها في سؤال مخفيّ:');
    console.error('       npm run owner:reset');
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

  /*
   * ★ ولا تُطبع الكلمة.
   *
   *   كانت تُطبع «للتأكيد»، فتبقى في سجلّ الطرفية وتظهر في لقطة الشاشة
   *   التي تُرسَل لطلب المساعدة — وقد حدث. ومن كتبها يعرفها، ومن لم
   *   يكتبها لا ينبغي أن يقرأها من شاشة.
   */
  console.log('\n>> Password reset OK. You can sign in now.');
  console.log(`   أُعيد تعيين كلمة مرور ${target.name}`);
  console.log(`   البريد: ${email}`);
  console.log('   الحساب مفعّل، وأُزيل القفل وعدّاد المحاولات الفاشلة.');
  console.log('   وأُبطلت الجلسات القائمة — امسح كوكيز الموقع قبل تسجيل الدخول.');

  if (fromArgv) {
    console.log('\n>> The password you passed is now in your shell history. Clear it:');
    console.log('   الكلمة التي مرّرتها باقيةٌ في سجلّ الأوامر. امسح السطر:');
    console.log('       history -d $(history 1)');
  }
  console.log('');
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

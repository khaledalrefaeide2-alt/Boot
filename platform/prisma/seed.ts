import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '../src/generated/prisma';

/**
 * البذرة الأولية — تُنشئ المالك الأول والمنصات الثلاث والتصنيفات والإعدادات.
 * آمنة للتشغيل المتكرر: لا تُكرّر أي سجل ولا تُعيد تعيين كلمة مرور موجودة.
 */
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL غير معرّف — انسخ .env.example إلى .env أولاً');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const PLATFORMS = [
  {
    code: 'facebook',
    name: 'فيسبوك',
    icon: 'facebook',
    color: '#1877F2',
    sortOrder: 1,
    defaultActorId: 'apify~facebook-posts-scraper',
    defaultActorInput: {},
  },
  {
    code: 'x',
    name: 'إكس',
    icon: 'x',
    color: '#0F1419',
    sortOrder: 2,
    defaultActorId: 'apidojo~tweet-scraper',
    defaultActorInput: {},
  },
  {
    code: 'instagram',
    name: 'إنستغرام',
    icon: 'instagram',
    color: '#E4405F',
    sortOrder: 3,
    defaultActorId: 'apify~instagram-scraper',
    defaultActorInput: {},
  },
];

const TOPICS = [
  { code: 'general', name: 'عام', color: '#64748B', sortOrder: 1 },
  { code: 'news', name: 'أخبار', color: '#2563EB', sortOrder: 2 },
  { code: 'services', name: 'خدمات', color: '#0891B2', sortOrder: 3 },
  { code: 'announcements', name: 'إعلانات وبيانات', color: '#7C3AED', sortOrder: 4 },
  { code: 'events', name: 'فعاليات', color: '#C2410C', sortOrder: 5 },
  { code: 'complaints', name: 'شكاوى وملاحظات', color: '#DC2626', sortOrder: 6 },
];

const SETTINGS = [
  {
    key: 'app.name',
    value: 'منصة رصد وتحليل المنصات الإعلامية',
    category: 'general',
    label: 'اسم المنصة',
    description: 'يظهر في الترويسة وعناوين الصفحات والتقارير',
  },
  {
    key: 'app.organization',
    value: '',
    category: 'general',
    label: 'اسم الجهة',
    description: 'يظهر في ترويسة التقارير المطبوعة',
  },
  {
    key: 'data.retentionDays',
    value: 365,
    category: 'data',
    label: 'مدة الاحتفاظ بالبيانات (أيام)',
    description: 'للعلم فقط — لا يوجد حذف تلقائي في النسخة الأولى',
  },
  {
    key: 'extraction.defaultMaxItems',
    value: 100,
    category: 'extraction',
    label: 'العدد الافتراضي للمنشورات في كل تشغيل',
    description: 'يُمرَّر إلى Apify كسقف فوترة إلزامي',
  },
  {
    key: 'extraction.defaultWindowDays',
    value: 30,
    category: 'extraction',
    label: 'نافذة الاستخراج الافتراضية (أيام)',
    description: 'أقدم تاريخ منشور يُطلب من الـ Actor',
  },
  {
    key: 'alerts.highEngagementThreshold',
    value: 1000,
    category: 'alerts',
    label: 'حد التفاعل المرتفع',
    description: 'يُطلق تنبيهاً داخلياً عند تجاوز المنشور هذا المجموع',
  },
  {
    key: 'alerts.negativeSentimentRatio',
    value: 0.4,
    category: 'alerts',
    label: 'نسبة المشاعر السلبية المقلقة',
    description: 'يُطلق تنبيهاً عند تجاوز نسبة السلبي في عملية استخراج',
  },
];

async function seedOwner(): Promise<void> {
  const email = process.env.SEED_OWNER_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_OWNER_PASSWORD;
  const name = process.env.SEED_OWNER_NAME?.trim() || 'مالك المنصة';

  if (!email || !password) {
    console.log('⏭️  تخطّي إنشاء المالك — SEED_OWNER_EMAIL أو SEED_OWNER_PASSWORD غير معرّف');
    return;
  }
  if (password.length < 10) {
    throw new Error('SEED_OWNER_PASSWORD يجب ألا تقل عن 10 محارف');
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`>> Owner already exists: ${email} (password unchanged)`);
    console.log('   المالك موجود مسبقاً ولم تُغيَّر كلمة مروره.');
    console.log('   لتغييرها:   npm run owner:reset -- "MyNewPassword123"');
    return;
  }

  await prisma.user.create({
    data: {
      email,
      name,
      passwordHash: await bcrypt.hash(password, 12),
      role: 'OWNER',
      status: 'ACTIVE',
      approvedAt: new Date(),
      jobTitle: 'مالك المنصة',
    },
  });
  console.log(`>> Owner account created: ${email}`);
  console.log('   أُنشئ حساب المالك — كلمة المرور هي SEED_OWNER_PASSWORD من ملف .env');
}

async function seedPlatforms(): Promise<void> {
  for (const platform of PLATFORMS) {
    await prisma.platform.upsert({
      where: { code: platform.code },
      // لا نستبدل إعدادات عدّلها المستخدم — نحدّث الاسم والترتيب فقط
      update: { name: platform.name, sortOrder: platform.sortOrder },
      create: platform,
    });
  }
  console.log(`✅ المنصات جاهزة: ${PLATFORMS.map((p) => p.name).join('، ')}`);
}

async function seedTopics(): Promise<void> {
  for (const topic of TOPICS) {
    await prisma.topic.upsert({
      where: { code: topic.code },
      update: { name: topic.name },
      create: topic,
    });
  }
  console.log(`✅ التصنيفات جاهزة (${TOPICS.length})`);
}

async function seedSettings(): Promise<void> {
  for (const setting of SETTINGS) {
    await prisma.setting.upsert({
      where: { key: setting.key },
      update: { label: setting.label, description: setting.description, category: setting.category },
      create: setting,
    });
  }
  console.log(`✅ الإعدادات جاهزة (${SETTINGS.length})`);
}

async function main(): Promise<void> {
  console.log('-- SEEDING / بدء تهيئة البيانات الأولية --\n');
  await seedPlatforms();
  await seedTopics();
  await seedSettings();
  await seedOwner();
  console.log('\n>> Seeding complete. Start the app with:   npm run dev');
  console.log('   اكتملت التهيئة.');
}

main()
  .catch((error) => {
    console.error('❌ فشلت التهيئة:', error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });

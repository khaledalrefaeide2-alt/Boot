/**
 * تنظيف روابط الوسائط غير الصالحة من المنشورات المخزّنة.
 *
 * كانت نسخة سابقة من المحوّل تقبل أي رابط في حقول الوسائط، فخُزّن الرابط
 * الدائم للمنشور (facebook.com/photo/?fbid=… مثلاً) على أنه رابط صورة.
 * المتصفح يطلبه فيستقبل صفحة HTML لا صورة، فتظهر الوسائط مكسورة.
 *
 * إعادة الاستخراج تصلح ما يعيده الـ Actor ضمن نافذته الزمنية وحده، أما
 * المنشورات الأقدم فتبقى بروابطها الخاطئة. هذا السكربت يصلح كل ما في
 * القاعدة دفعةً واحدة بالقاعدة نفسها التي يستعملها المحوّل.
 *
 * التشغيل:
 *     npm run media:repair            عرض ما سيُصلح دون تغيير
 *     npm run media:repair -- --apply تنفيذ الإصلاح فعلاً
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma';
import { isMediaUrl } from '../src/lib/apify/mappers';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('>> DATABASE_URL is missing from .env');
  console.error('   المتغير DATABASE_URL غير معرّف في ملف .env');
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const apply = process.argv.includes('--apply');

async function main(): Promise<void> {
  const posts = await prisma.post.findMany({
    select: { id: true, imageUrl: true, thumbnailUrl: true, videoUrl: true, mediaUrls: true },
  });

  let changed = 0;
  const samples: string[] = [];

  for (const post of posts) {
    const media = Array.isArray(post.mediaUrls)
      ? (post.mediaUrls as unknown[]).filter((u): u is string => typeof u === 'string')
      : [];
    const cleanMedia = media.filter(isMediaUrl);

    const next = {
      imageUrl: isMediaUrl(post.imageUrl) ? post.imageUrl : null,
      thumbnailUrl: isMediaUrl(post.thumbnailUrl) ? post.thumbnailUrl : null,
      videoUrl: isMediaUrl(post.videoUrl) ? post.videoUrl : null,
    };

    const mediaChanged = cleanMedia.length !== media.length;
    const fieldsChanged =
      next.imageUrl !== post.imageUrl ||
      next.thumbnailUrl !== post.thumbnailUrl ||
      next.videoUrl !== post.videoUrl;

    if (!mediaChanged && !fieldsChanged) continue;

    changed += 1;
    for (const bad of [post.imageUrl, post.thumbnailUrl, post.videoUrl]) {
      if (bad && !isMediaUrl(bad) && samples.length < 5 && !samples.includes(bad)) samples.push(bad);
    }

    if (apply) {
      await prisma.post.update({
        where: { id: post.id },
        data: {
          ...next,
          mediaUrls: (cleanMedia.length > 0 ? cleanMedia : undefined) as never,
        },
      });
    }
  }

  console.log(`\n-- MEDIA REPAIR / إصلاح روابط الوسائط --`);
  console.log(`   منشورات في القاعدة : ${posts.length}`);
  console.log(`   تحتاج إصلاحاً      : ${changed}`);

  if (samples.length > 0) {
    console.log('\n   نماذج من الروابط المرفوضة (صفحات لا ملفات):');
    for (const s of samples) console.log(`     - ${s.slice(0, 90)}`);
  }

  if (changed === 0) {
    console.log('\n>> Nothing to repair. All media URLs are valid.');
    console.log('   لا شيء يحتاج إصلاحاً — كل روابط الوسائط سليمة.\n');
    return;
  }

  if (apply) {
    console.log(`\n>> Repaired ${changed} posts.`);
    console.log(`   أُصلح ${changed} منشوراً. أعد تحميل الصفحة في المتصفح.\n`);
  } else {
    console.log('\n>> Preview only. Nothing was changed.');
    console.log('   هذا عرض فقط ولم يتغيّر شيء. للتنفيذ:');
    console.log('     npm run media:repair -- --apply\n');
  }
}

main()
  .catch((error) => {
    console.error('>> Repair failed:', error);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());

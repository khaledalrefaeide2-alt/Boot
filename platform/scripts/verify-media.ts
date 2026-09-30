/**
 * فحص مخزن المصغّرات.
 *
 * أكثره أمنيّ لا وظيفيّ: الخادم صار يطلب روابط تأتيه من المشغّل، ويقرأ
 * ملفات بمفاتيح تأتيه من المتصفّح. وكلاهما بابٌ لو تُرك مفتوحاً لأخرج ما
 * لا يُخرَج — بيانات شبكة Docker الداخلية من جهة، وملفات النظام من أخرى.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  canonicalMediaUrl,
  isFetchableMedia,
  mediaKeyFor,
  readThumbnail,
} from '../src/lib/media/store';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

/** قراءة الشيفرة بلا تعليقاتها — ملفّات هذا المشروع تشرح ما لا تفعله */
const readCode = (path: string) =>
  read(path)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

const checks: { name: string; ok: boolean; detail?: string }[] = [];
function check(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
}

// ── ما يُجلب
const ALLOWED = [
  'https://scontent.xx.fbcdn.net/v/t39/image.jpg',
  'https://scontent-lhr8-1.xx.fbcdn.net/v/t1.6435-9/abc.jpg?oh=00_AY&oe=6712',
  'https://pbs.twimg.com/media/Abc123.jpg',
  'https://instagram.fcai19-1.fbcdn.net/v/t51/photo.jpg',
  'https://media.licdn.com/dms/image/x/photo.jpg',
];
for (const url of ALLOWED) {
  check(`يُجلب: ${new URL(url).hostname}`, isFetchableMedia(url));
}

/*
 * ما لا يُجلب — وهذه هي الفحوص التي توجد لأجلها هذه المستندة.
 *
 * الخادم يطلب ما يُملى عليه، ورابطٌ إلى 169.254.169.254 يُخرج بيانات
 * المزوّد، ورابطٌ إلى postgres:5432 يمسّ القاعدة من الداخل. والمشغّل
 * طرفٌ خارجيّ: ما يُرجعه بياناتٌ لا أوامر.
 */
const BLOCKED: [string, string][] = [
  ['بيانات المزوّد', 'http://169.254.169.254/latest/meta-data/'],
  ['المضيف نفسه', 'http://localhost:3000/api/settings'],
  ['حلقة الاسترجاع', 'http://127.0.0.1/secret.jpg'],
  ['شبكة Docker الداخلية', 'http://postgres:5432/x.jpg'],
  ['شبكة خاصة', 'http://10.0.0.5/private.jpg'],
  ['ملف محلي', 'file:///etc/passwd'],
  ['صفحة منصة لا ملف', 'https://facebook.com/some/page'],
  ['مضيف عشوائي', 'https://evil.example.com/a.jpg'],
  ['فارغ', ''],
];
for (const [label, url] of BLOCKED) {
  check(`لا يُجلب: ${label}`, !isFetchableMedia(url), url.slice(0, 60));
}

// ── المفتاح
const key = mediaKeyFor('https://scontent.xx.fbcdn.net/v/t39/image.jpg');
check('المفتاح أربعون خانة ست عشرية', /^[a-f0-9]{40}$/.test(key), key);
check(
  'المفتاح ثابت للرابط نفسه',
  key === mediaKeyFor('https://scontent.xx.fbcdn.net/v/t39/image.jpg'),
);
check(
  'رابطان مختلفان مفتاحان مختلفان',
  key !== mediaKeyFor('https://scontent.xx.fbcdn.net/v/t39/other.jpg'),
);

// ══════════════ المفتاح لا يتغيّر بتغيّر التوقيع ══════════════

/*
 * ★ هذا الفحص يحرس القرص كلّه.
 *
 *   رابط فيسبوك للصورة الواحدة يحمل توقيعاً ينتهي (`oh`/`oe`) ومعرّفات
 *   جلسة. فلو دخلت في المفتاح لتولّد مفتاحٌ جديد بعد كلّ استخراج لصورةٍ
 *   واحدة — وملفٌّ ثانٍ على القرص لا يشير إليه أحد. وبعد أشهر يمتلئ
 *   المخزن بنُسَخٍ يتيمة فيُقلَّم، فتُحذف مصغّرات حيّة لتبقى نُسَخ ميتة.
 */
const SIGNED_A =
  'https://scontent.xx.fbcdn.net/v/t39/image.jpg?stp=dst-jpg_p480x480&_nc_ohc=AAA&oh=00_AY1&oe=6712';
const SIGNED_B =
  'https://scontent.xx.fbcdn.net/v/t39/image.jpg?stp=dst-jpg_p480x480&_nc_ohc=ZZZ&oh=00_BQ9&oe=6899';

check(
  'التوقيع المتغيّر لا يغيّر المفتاح',
  mediaKeyFor(SIGNED_A) === mediaKeyFor(SIGNED_B),
  'وإلا تولّد ملفٌّ جديد بعد كل استخراج لصورةٍ واحدة، فامتلأ القرص بنُسَخ يتيمة',
);
check(
  'والمقاس يبقى في المفتاح',
  mediaKeyFor(SIGNED_A) !== mediaKeyFor(SIGNED_A.replace('dst-jpg_p480x480', 'dst-jpg_p64x64')),
  'إسقاط stp يجمع المصغّرة والكاملة تحت مفتاح واحد فتُعرض أصغرهما مكان الأخرى',
);
check(
  'وصيغة تويتر تبقى كذلك',
  mediaKeyFor('https://pbs.twimg.com/media/A.jpg?name=small') !==
    mediaKeyFor('https://pbs.twimg.com/media/A.jpg?name=large'),
);
check(
  'والمسار المختلف مفتاح مختلف',
  mediaKeyFor(SIGNED_A) !== mediaKeyFor(SIGNED_A.replace('image.jpg', 'other.jpg')),
);
check(
  'والرابط المعطوب يُمرَّر كما هو بلا رمي',
  canonicalMediaUrl('ليس رابطاً') === 'ليس رابطاً',
);

// ══════════════ لا صورة تُفقد بصمت ══════════════

const cache = readCode('src/lib/media/cache-posts.ts');
const store = readCode('src/lib/media/store.ts');
const sweep = readCode('src/lib/media/sweep.ts');
const prune = readCode('src/lib/media/prune.ts');
const worker = readCode('src/worker/index.ts');

check(
  'الفشل نوعان: نهائيّ وعابر',
  /permanent: PERMANENT_STATUS\.has\(response\.status\)/.test(store),
  'رابطٌ ردّ بـ410 لا يحيا بإعادة السؤال، وانقطاعُ شبكةٍ يُشفى بمحاولةٍ ثانية — وخلطهما يُفسد الاثنين',
);
check(
  'و429 وأخطاء الخادم ليست نهائية',
  !/PERMANENT_STATUS = new Set\(\[[^\]]*429/.test(store) &&
    !/PERMANENT_STATUS = new Set\(\[[^\]]*50\d/.test(store),
  '«عد لاحقاً» ليست «لا شيء هنا»',
);
check(
  'كل محاولة تُسجَّل',
  /mediaCheckedAt: now/.test(cache) && /mediaAttempts: \{ increment: 1 \}/.test(cache),
  'محاولةٌ بلا أثر تعني ألّا يُعرف أحاول النظام وفشل أم لم يحاول أصلاً',
);
check(
  'والنهائي يخرج من الطابور',
  /mediaAttempts: maxAttempts/.test(cache),
  'بلا ذلك تدور المكنسة على عشرات الآلاف من الروابط الميتة فلا تبلغ الحيّ',
);
check(
  'والرابط غير الصالح يُسجَّل ولا يُتخطّى',
  /if \(!isFetchableMedia\(target\.url\)\) \{[\s\S]{0,220}?mediaAttempts: maxAttempts/.test(cache),
  'التخطّي الصامت يُبقيه في العدّاد إلى الأبد فلا يبلغ صفراً',
);
check(
  'والأحدث أوّلاً — ترتيب إنقاذ لا عرض',
  /orderBy: \{ publishedAt: 'desc' \}/.test(cache),
  'رابط المنصة يعيش ساعات: منشور اليوم يُنقذ الآن أو لا يُنقذ، ومنشور الشهر الماضي مات على كل حال',
);

check(
  'المكنسة لا ترمي أبداً',
  /catch \(error\)[\s\S]{0,260}?return \{ swept: false/.test(sweep),
  'تعمل في مؤقّت بلا من يلتقط خطأها، والاستثناء الخارج منها يسقط العامل كله',
);
check('والعامل يشغّلها', /sweepMedia\(/.test(worker));
check('ويحترم مفتاح الإطفاء', /if \(!settings\.auto\) return null;[\s\S]{0,160}?sweepMedia/.test(worker));
check('ويوقفها عند الإغلاق', /clearInterval\(mediaCacheTimer\)/.test(worker));

// ══════════════ التقليم لا يأكل الحيّ قبل الميّت ══════════════

check(
  'اليتيم يُحذف قبل المستعمَل',
  /if \(live\.has\(file\.key\)\) continue;/.test(prune),
  'ترتيبٌ بآخر قراءة وحده يحذف مصغّرةً معروضة في بطاقة ويُبقي عشر نُسَخ ميتة',
);
check(
  'والمستعمَل يُعرف من القاعدة لا يُخمَّن',
  /where: \{ mediaKey: \{ not: null \} \}/.test(prune),
);
check(
  'وما أُخرج حيّاً يُفرَّغ مفتاحه',
  /data: \{ mediaKey: null, mediaAttempts: maxAttempts \}/.test(prune),
  'ملفٌّ حُذف ومفتاحه باقٍ حالةٌ كاذبة: الصفّ يقول «صورتي محفوظة» والقرص يقول لا',
);
check(
  'ولا يُعاد جلبه فيدور القرص في حلقة',
  /mediaAttempts: maxAttempts/.test(prune),
  'يُجلب فيمتلئ، فيُقلَّم فيُجلب — بلا نهاية',
);
check(
  'وإخراج الحيّ يُعلَن تحذيراً',
  /console\.warn\([\s\S]{0,200}?MEDIA_MAX_MB/.test(worker),
  'حذفُ اليتيم تنظيف، وحذفُ المستعمَل فقدٌ في الأرشيف لا يجوز أن يمرّ في سطرٍ عادي',
);

// ══════════════ الإعدادات ══════════════

const migration = read('prisma/migrations/20260930090000_media_recovery/migration.sql');
for (const key of ['media.autoCache', 'media.batch', 'media.maxAttempts']) {
  check(`الإعداد «${key}» مبذورٌ في الترحيل`, migration.includes(`'${key}'`));
  check(`و«${key}» في ملفّ البذور كذلك`, read('prisma/seed.ts').includes(`'${key}'`));
}
check(
  'والبذر لا يفشل على قاعدة فيها الإعداد',
  /ON CONFLICT \("key"\) DO NOTHING/.test(migration),
);

/*
 * اجتياز المسار.
 *
 * المفتاح يصل من عنوان الطلب، ويُبنى به مسار ملف. فما لم يُتحقّق من شكله
 * صار `../../` طريقاً إلى أي ملف يقرؤه المستخدم الذي تعمل به الحاوية.
 */
const TRAVERSAL = [
  '../../../etc/passwd',
  '..%2f..%2fetc%2fpasswd',
  'abc/../../../secret',
  'ABCDEF0123456789abcdef0123456789abcdef01', // حروف كبيرة ليست من صيغتنا
  '',
  'x'.repeat(41),
];

async function main() {
  for (const bad of TRAVERSAL) {
    const result = await readThumbnail(bad);
    check(`يُرفض مفتاح خارج الصيغة: ${bad.slice(0, 28) || '(فارغ)'}`, result === null);
  }

  console.log('\n>> فحص مخزن المصغّرات\n');
  let failed = 0;
  for (const c of checks) {
    console.log(`  ${c.ok ? '✓' : '✗'} ${c.name}${c.detail && !c.ok ? `\n      ${c.detail}` : ''}`);
    if (!c.ok) failed += 1;
  }
  if (failed > 0) {
    console.error(`\n✗ ${failed} من ${checks.length} فحصاً فشل.\n`);
    process.exit(1);
  }
  console.log(`\n✓ سليم: ${checks.length} فحصاً كلها تمرّ.\n`);
}

void main();

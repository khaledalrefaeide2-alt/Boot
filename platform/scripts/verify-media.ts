/**
 * فحص مخزن المصغّرات.
 *
 * أكثره أمنيّ لا وظيفيّ: الخادم صار يطلب روابط تأتيه من المشغّل، ويقرأ
 * ملفات بمفاتيح تأتيه من المتصفّح. وكلاهما بابٌ لو تُرك مفتوحاً لأخرج ما
 * لا يُخرَج — بيانات شبكة Docker الداخلية من جهة، وملفات النظام من أخرى.
 */
import { isFetchableMedia, mediaKeyFor, readThumbnail } from '../src/lib/media/store';

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

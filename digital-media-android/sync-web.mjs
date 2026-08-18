/*
 * sync-web.mjs — نقل طبقة الويب من الإصدار السادس إلى غلاف التطبيق
 * ==================================================================
 * ‏www/ ليست مصدراً بل نسخة. المصدر الوحيد هو digital-media-v6، وهذا
 * السكربت ينقل منه ما يخصّ الواجهة ويُبقي ما يخصّ الغلاف (android.js
 * وandroid.css) كما هو، ثم يحقن وسمَيهما في الصفحات.
 *
 * النقل بسكربت لا باليد لأن النسخ اليدوي ينسى ملفاً أو يُبقي قديماً،
 * فتفترق النسختان بصمت — وهو أسوأ من افتراقهما بضجيج.
 */
import { readdir, readFile, writeFile, copyFile, mkdir, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, '..', 'digital-media-v6');
const WWW = join(here, 'www');

/* المصدر اختياري. من استلم مجلد التطبيق وحده لا يملك digital-media-v6
   المجاور، وأصول الويب مشحونة داخل www/ أصلاً — فلا شيء يُنقل، ويبقى
   عمل هذا السكربت مزامنةَ المشروع الأصلي وحدها. وسقوطه بخطأ هنا كان
   يوقف البناء كلّه عند من لا مصدر عنده. */
const hasSource = await access(SRC).then(() => true, () => false);
if (!hasSource) {
  console.log('لا يوجد مجلد المصدر digital-media-v6 بجانب هذا المشروع —');
  console.log('تُستعمل الأصول المشحونة في www/ كما هي. هذا وضع طبيعي لمن');
  console.log('استلم مجلد التطبيق وحده.');
  process.exit(0);
}

/* ما يخصّ الغلاف وحده: لا يُنسخ ولا يُمسح */
const SHELL = new Set(['android.js', 'android.css']);
/* ما لا معنى له داخل التطبيق: خادم قاعدة البيانات المحلي يبقى للحاسوب */
const SKIP = new Set(['capacitor.config.js']);

const HEAD = '<link rel="stylesheet" href="theme.css">';
const BOOT = '<script src="icons.js"></script>';

await mkdir(WWW, { recursive: true });
const wanted = (await readdir(SRC)).filter(f => /\.(html|js|css)$/.test(f) && !SKIP.has(f));

let copied = 0, patched = 0;
for (const f of wanted) {
  if (SHELL.has(f)) continue;
  if (f.endsWith('.html')) {
    let s = await readFile(join(SRC, f), 'utf8');
    // ورقة الغلاف بعد ورقة السمة لتغلبها، وسكربته قبل كل شيء ليعرَّف
    // FBXSave قبل أن تقرأه الوحدات
    if (!s.includes('android.css')) s = s.replace(HEAD, HEAD + '\n<link rel="stylesheet" href="android.css">');
    if (!s.includes('android.js'))  s = s.replace(BOOT, '<script src="android.js"></script>\n' + BOOT);
    await writeFile(join(WWW, f), s);
    patched++;
  } else {
    await copyFile(join(SRC, f), join(WWW, f));
    copied++;
  }
}
console.log(`نُقل ${copied} ملفاً و${patched} صفحة من digital-media-v6 إلى www/`);

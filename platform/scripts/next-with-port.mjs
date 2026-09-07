/**
 * مشغّل Next يقرأ المنفذ من APP_PORT ثم PORT، ويستمع على كل الواجهات.
 *
 * السبب: Next لا يقرأ منفذ الخادم من ملف .env — يقرأه من سطر الأوامر فقط.
 * وبدون هذا المشغّل يعمل التطبيق على المنفذ 3000 بينما APP_URL يشير إلى منفذ
 * آخر، فيرفض فحص مصدر الطلبات كل عمليات الحفظ وتسجيل الدخول.
 */
import 'dotenv/config';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';

const mode = process.argv[2] === 'start' ? 'start' : 'dev';
/*
 * أولوية المنفذ — ثلاث درجات، والأعلى يفوز:
 *
 *   1) APP_PORT   ← اختيارك الصريح، ويغلب كل ما عداه
 *   2) PORT       ← ما تحقنه منصات الاستضافة (App Platform وغيرها)
 *   3) 3000       ← الافتراضي للتطوير المحلي
 *
 * الترتيب مقصود بهذا الاتجاه: المنصة تحقن PORT دائماً، فلو غلب على APP_PORT
 * لتعذّر عليك تثبيت منفذ بعينه عندها. وبقاء APP_PORT أولاً يحفظ سلوك كل
 * إعداد محلي قائم كما هو.
 */
const portSource = process.env.APP_PORT ? 'APP_PORT' : process.env.PORT ? 'PORT' : 'الافتراضي';
const port = (process.env.APP_PORT ?? process.env.PORT ?? '3000').trim();

/*
 * عنوان الاستماع 0.0.0.0 صراحةً لا بالافتراض.
 *
 * Next يقرأ متغيّر HOSTNAME حين لا يُمرَّر -H، وDocker يضبط HOSTNAME على
 * معرّف الحاوية. فيستمع الخادم على عنوان الحاوية وحده بدل كل الواجهات،
 * ويصير وصول الوكيل إليه رهنَ تفاصيل الشبكة. التمرير الصريح يقطع ذلك.
 *
 * ويُتجاوز بـ APP_HOST وحده — لا بـ HOSTNAME، لأن الأخير ليس اختيارنا.
 */
const host = (process.env.APP_HOST ?? '0.0.0.0').trim();

if (!/^\d{2,5}$/.test(port)) {
  console.error(`✗ قيمة المنفذ من ${portSource} غير صالحة: "${port}" — يجب أن تكون رقم منفذ`);
  process.exit(1);
}

/*
 * تنبيه مبكر إذا لم يطابق عنوان التطبيق المنفذ، لأن ذلك يكسر تسجيل الدخول.
 *
 * لكن الشرط ليس «هل يحتوي العنوان رقم المنفذ؟». خلف وكيل عكسي في الإنتاج
 * يكون APP_URL هو العنوان العلني (https://example.com بلا منفذ) بينما
 * التطبيق يستمع داخلياً على 3000 — وهذا هو الوضع الصحيح لا تعارضاً. بحثٌ
 * نصّي ساذج عن «:3000» كان يطلق تحذيراً كاذباً عند كل إقلاع إنتاجي، ومن
 * يرى تحذيراً يعرف أنه كاذب يتعلّم تجاهل التحذيرات كلها.
 *
 * التعارض الحقيقي حالتان:
 *   • العنوان يحمل منفذاً صريحاً مخالفاً — خطأ مهما كان المضيف.
 *   • العنوان محلي بلا منفذ — أي أن المتصفح سيقصد 80 والتطبيق ليس هناك.
 * وما عدا ذلك فمضيف حقيقي خلف وكيل، ولا شأن لمنفذه العلني بمنفذنا.
 */
const appUrl = process.env.APP_URL ?? '';
if (appUrl) {
  let parsed;
  try {
    parsed = new URL(appUrl);
  } catch {
    parsed = null;
  }

  const isLocal = parsed
    ? ['localhost', '127.0.0.1', '[::1]', '::1'].includes(parsed.hostname)
    : false;
  const mismatch = parsed
    ? parsed.port
      ? parsed.port !== port
      : isLocal
    : false;

  if (mismatch) {
    console.warn('');
    console.warn(`⚠️  تعارض في الإعدادات: APP_PORT=${port} بينما APP_URL=${appUrl}`);
    console.warn('    يجب أن يحمل APP_URL رقم المنفذ نفسه، وإلا رُفض تسجيل الدخول.');
    console.warn(`    الصحيح:  APP_URL="http://localhost:${port}"`);
    console.warn('');
  }
}

/**
 * فحص المنفذ قبل التشغيل.
 *
 * إن كان مشغولاً يخرج Next برسالة EADDRINUSE ومكدّس استدعاءات لا يفهم منه
 * المستخدم ما العمل. الغالب أن نسخة سابقة من الخادم ما زالت تعمل في نافذة
 * أخرى، فنقول ذلك صراحةً مع الأمر الذي يحرّر المنفذ على نظامه.
 */
async function portIsBusy(portNumber) {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.once('error', (error) => resolve(error.code === 'EADDRINUSE'));
    probe.once('listening', () => probe.close(() => resolve(false)));
    probe.listen(portNumber, host);
  });
}

if (await portIsBusy(Number(port))) {
  const onWindows = process.platform === 'win32';
  console.error('');
  console.error(`>> Port ${port} is already in use. Free it, then run this again.`);
  console.error(`   المنفذ ${port} مشغول — الغالب أن الخادم يعمل في نافذة أخرى.`);
  console.error('');
  console.error('   أغلق تلك النافذة، أو حرّر المنفذ بهذا الأمر:');
  console.error(
    onWindows
      // ErrorAction SilentlyContinue يمنع خطأً أحمر مربكاً لو كان المنفذ حراً أصلاً
      ? `      Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }`
      : `      lsof -ti tcp:${port} | xargs kill -9`,
  );
  console.error('');
  console.error(`   أو شغّل على منفذ آخر بتغيير APP_PORT و APP_URL معاً في ملف .env`);
  console.error('');
  process.exit(1);
}

/*
 * نشغّل ملف Next نفسه بمحرّك Node مباشرة، بلا صدفة وسيطة.
 *
 * تمرير المعاملات مع shell: true يجمعها في نص واحد دون تهريب، وهو ما
 * حذّرت منه Node (DEP0190) لأنه يفتح باب حقن الأوامر. التشغيل المباشر
 * يلغي الصدفة كلياً، ويعمل على ويندوز ولينكس معاً دون اختلاف.
 */
const require = createRequire(import.meta.url);
const nextBin = require.resolve('next/dist/bin/next');

const child = spawn(process.execPath, [nextBin, mode, '-p', port, '-H', host], {
  stdio: 'inherit',
});

child.on('exit', (code) => process.exit(code ?? 0));
process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));

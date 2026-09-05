/**
 * مشغّل Next يقرأ المنفذ من APP_PORT في ملف البيئة.
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
const port = (process.env.APP_PORT ?? '3000').trim();

if (!/^\d{2,5}$/.test(port)) {
  console.error(`✗ قيمة APP_PORT غير صالحة: "${port}" — يجب أن تكون رقم منفذ`);
  process.exit(1);
}

// تنبيه مبكر إذا لم يطابق عنوان التطبيق المنفذ، لأن ذلك يكسر تسجيل الدخول
const appUrl = process.env.APP_URL ?? '';
if (appUrl && !appUrl.includes(`:${port}`)) {
  console.warn('');
  console.warn(`⚠️  تعارض في الإعدادات: APP_PORT=${port} بينما APP_URL=${appUrl}`);
  console.warn('    يجب أن يحمل APP_URL رقم المنفذ نفسه، وإلا رُفض تسجيل الدخول.');
  console.warn(`    الصحيح:  APP_URL="http://localhost:${port}"`);
  console.warn('');
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
    probe.listen(portNumber, '0.0.0.0');
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
      ? `      Get-NetTCPConnection -LocalPort ${port} | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }`
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

const child = spawn(process.execPath, [nextBin, mode, '-p', port], {
  stdio: 'inherit',
});

child.on('exit', (code) => process.exit(code ?? 0));
process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));

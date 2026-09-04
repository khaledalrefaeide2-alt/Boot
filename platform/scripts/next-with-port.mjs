/**
 * مشغّل Next يقرأ المنفذ من APP_PORT في ملف البيئة.
 *
 * السبب: Next لا يقرأ منفذ الخادم من ملف .env — يقرأه من سطر الأوامر فقط.
 * وبدون هذا المشغّل يعمل التطبيق على المنفذ 3000 بينما APP_URL يشير إلى منفذ
 * آخر، فيرفض فحص مصدر الطلبات كل عمليات الحفظ وتسجيل الدخول.
 */
import 'dotenv/config';
import { spawn } from 'node:child_process';

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

const child = spawn('npx', ['next', mode, '-p', port], {
  stdio: 'inherit',
  shell: true,
});

child.on('exit', (code) => process.exit(code ?? 0));
process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));

/**
 * فحص أن تحميل وحدات الخادم لا يفتح اتصالاً بشبكة.
 *
 *   npm run verify:build-safety
 *
 * لماذا ملف مستقل: `next build` يستورد كل وحدة مسار مرتين — مرة ليقرأ
 * إعداداتها، ومرة في كل عملية عامل أثناء توليد الصفحات. فأي اتصال يُفتح عند
 * الاستيراد يتكرر في بيئة لا يوجد فيها لا Redis ولا قاعدة، ويترك حلقة إعادة
 * محاولة حيّة إلى آخر البناء. وهذا ما ملأ سجل النشر بسطور «[redis] خطأ في
 * الاتصال» أثناء البناء على Render.
 *
 * الفحص لا يثق بقراءة الشيفرة: يعترض `Socket.prototype.connect` فعلياً ويعدّ
 * ما يُفتح، لأن الاتصال قد يأتي من عمق مكتبة لا من سطر نراه.
 */
import net from 'node:net';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';

process.env.DATABASE_URL ??= 'postgresql://build:build@127.0.0.1:5432/build?schema=public';
process.env.SESSION_SECRET ??= 'build-time-placeholder-secret-value-0123456789';
process.env.REDIS_URL ??= 'redis://127.0.0.1:6379';

const attempts: string[] = [];
const realConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function patched(this: net.Socket, ...args: unknown[]) {
  const target = args[0];
  attempts.push(
    typeof target === 'object' && target !== null
      ? JSON.stringify(target)
      : String(target),
  );
  // لا نصل فعلاً: الفحص يقيس النية لا النتيجة
  return this;
} as typeof net.Socket.prototype.connect;

let failures = 0;

function check(label: string, ok: boolean, detail = ''): void {
  if (!ok) failures++;
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? `  — ${detail}` : ''}`);
}

async function main(): Promise<void> {
  console.log('\n>> لا اتصالات عند تحميل الوحدات\n');

  const redisModule = await import('../src/lib/redis');
  const dbModule = await import('../src/lib/db');
  const queueModule = await import('../src/lib/queue');

  check('استيراد lib/redis و lib/db و lib/queue لا يفتح أي مقبس',
    attempts.length === 0, attempts.join(', '));

  check('lib/redis لا يصدّر عميلاً جاهزاً باسم redis',
    !('redis' in redisModule),
    'العميل يُطلب بـ getRedis() فلا يُنشأ بمجرد الاستيراد');

  check('lib/db يصدّر prisma', 'prisma' in dbModule);
  check('lib/queue لا يُنشئ طابوراً عند التحميل',
    attempts.length === 0);

  // وبعد الطلب الصريح: العميل يُنشأ لكنه ينتظر أول أمر
  const client = redisModule.getRedis();
  check('getRedis() ينشئ عميلاً بلا اتصال فوري',
    client.status === 'wait', `الحالة: ${client.status}`);
  check('ولا مقبس فُتح بعد',
    attempts.length === 0, attempts.join(', '));

  net.Socket.prototype.connect = realConnect;
  client.disconnect();

  clientBoundary();

  console.log(
    failures === 0
      ? '\n>> سليم: تحميل الوحدات بلا أثر خارجي، والاتصال عند أول استعمال حقيقي.\n'
      : `\n>> ✗ ${failures} فحصاً فاشلاً.\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

/*
 * ══════════ حدُّ العميل: دالّةٌ من وحدةِ عميلٍ لا يناديها الخادم ══════════
 *
 * ★ هذا الفحص وُلد من خطأٍ وقع فعلاً.
 *
 *   صفحةُ «غير موجود» مكوّنُ خادم، وفيها رابطٌ بهيئة زرّ، فاستوردت
 *   `buttonVariants` من `components/ui/button` — وذاك الملفّ يبدأ
 *   بـ`use client`. فكلُّ ما يُصدَّر منه مرجعٌ إلى العميل لا دالّة:
 *
 *     Attempted to call buttonVariants() from the server
 *
 *   ولم تكشفه الأنواع ولا البناء — بل فتحُ الصفحة. والمكوّن (باسمٍ
 *   كبير) يمرّ لأنّه يُعرض ولا يُنادى؛ والدالّة (باسمٍ صغير) تُنادى.
 *
 *   فيُفحص: كلُّ ملفٍّ لا يبدأ بـ`use client` إذا استورد من وحدةٍ تبدأ
 *   به اسماً يبدأ بحرفٍ صغير — فذاك نداءٌ ينتظر أن يقع.
 */
function clientBoundary(): void {
  const root = process.cwd();

  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((entry) => {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) return entry === 'generated' ? [] : walk(full);
      return /\.tsx?$/.test(entry) ? [full] : [];
    });

  const files = walk(join(root, 'src'));
  const isClient = (file: string): boolean => {
    try {
      return /^\s*['"]use client['"]/.test(readFileSync(file, 'utf8'));
    } catch {
      return false;
    }
  };

  /** مسارُ الاستيراد إلى ملفٍّ على القرص — بالاسم المستعار أو النسبي */
  const resolveImport = (from: string, spec: string): string | null => {
    const base = spec.startsWith('@/')
      ? join(root, 'src', spec.slice(2))
      : spec.startsWith('.')
        ? resolve(dirname(from), spec)
        : null;
    if (!base) return null;
    for (const candidate of [`${base}.tsx`, `${base}.ts`, join(base, 'index.tsx'), join(base, 'index.ts')]) {
      try {
        if (statSync(candidate).isFile()) return candidate;
      } catch {
        /* يُجرَّب التالي */
      }
    }
    return null;
  };

  const offenders: string[] = [];
  for (const file of files) {
    const code = readFileSync(file, 'utf8');
    if (/^\s*['"]use client['"]/.test(code)) continue;

    for (const match of code.matchAll(/import\s+(type\s+)?\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/g)) {
      const [, typeOnly, names, spec] = match;
      if (typeOnly || !names || !spec) continue;
      const target = resolveImport(file, spec);
      if (!target || !isClient(target)) continue;

      for (const raw of names.split(',')) {
        const name = (raw.split(' as ').pop() ?? '').trim();
        if (!name || raw.trim().startsWith('type ')) continue;
        if (/^[a-z]/.test(name)) {
          offenders.push(`${file.replace(`${root}/`, '')}: ${name} ← ${spec}`);
        }
      }
    }
  }

  check(
    'لا دالّةَ عميلٍ يناديها ملفُّ خادم',
    offenders.length === 0,
    offenders.join(' | '),
  );
}

void main();

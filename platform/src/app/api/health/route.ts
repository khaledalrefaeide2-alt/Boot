import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { redis } from '@/lib/redis';

/**
 * فحص صحّة للخادم — يستعمله Docker والوكيل العكسي ومراقبة الاستضافة.
 *
 * مفتوح بلا مصادقة عمداً، ولذلك لا يقول شيئاً: `ok` أو لا. سبب العطل يُقرأ
 * من السجلات أو من شاشة الإدارة داخل الموقع، لأن نقطة مكشوفة تعلن «القاعدة
 * ساقطة» تعطي من يفحص الخوادم خريطةَ ما يعمل وما لا يعمل مجاناً.
 *
 * الحكم يشمل القاعدة و Redis معاً: خادم يردّ على HTTP بينما قاعدته ساقطة
 * ليس سليماً، وإعلانه سليماً يعني أن الموازن سيوجّه إليه طلبات تفشل كلها.
 */
export const dynamic = 'force-dynamic';

const TIMEOUT_MS = 3000;

function withTimeout<T>(work: Promise<T>): Promise<T> {
  return Promise.race([
    work,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS),
    ),
  ]);
}

export async function GET() {
  const checks = await Promise.allSettled([
    withTimeout(prisma.$queryRaw`SELECT 1`),
    withTimeout(redis.ping()),
  ]);

  const healthy = checks.every((check) => check.status === 'fulfilled');

  return NextResponse.json(
    { ok: healthy },
    {
      status: healthy ? 200 : 503,
      headers: { 'cache-control': 'no-store' },
    },
  );
}

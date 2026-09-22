import type { NextRequest } from 'next/server';
import { jsonError, requirePermission } from '@/lib/api';
import { PERMISSIONS } from '@/lib/auth/rbac';
import { readThumbnail } from '@/lib/media/store';

type Params = { params: Promise<{ key: string }> };

/**
 * تقديم مصغّرة محفوظة.
 *
 * محميّ بصلاحية الاطلاع كبقية المسارات: الصور محتوى مرصود لا ملفات عامة،
 * و`<img>` يُرسل ملفّات الارتباط على المصدر نفسه فلا يحتاج شيئاً إضافياً.
 *
 * والتخزين المؤقت طويلٌ وثابت: المفتاح بصمةُ الرابط، فمحتوى المفتاح لا
 * يتغيّر أبداً — ومفتاحٌ جديد يعني صورةً جديدة بعنوان جديد.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    await requirePermission(PERMISSIONS.POSTS_VIEW);
    const { key } = await params;

    const buffer = await readThumbnail(key);
    if (!buffer) return new Response('غير موجود', { status: 404 });

    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'image/webp',
        'Content-Length': String(buffer.byteLength),
        'Cache-Control': 'private, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}

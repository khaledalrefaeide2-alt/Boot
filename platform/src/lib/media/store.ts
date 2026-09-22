import 'server-only';
import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { isMediaUrl } from '@/lib/apify/mappers';

/**
 * مخزن المصغّرات.
 *
 * وُجد لأن الرابط وحده لا يكفي: روابط صور فيسبوك موقّعة وتنتهي صلاحيتها بعد
 * ساعات إلى أيام (`oh`/`oe` في الرابط)، فالمنشور القديم يفقد صورته وإن بقي
 * رابطها في القاعدة. والمنصة أرشيفٌ يمتدّ سنوات، فأرشيفٌ بلا صور نصفُ أرشيف.
 *
 * فتُجلب الصورة مرةً واحدة عند الاستيراد — حين يكون الرابط حيّاً — وتُحفظ
 * مصغّرةً. وما بعدها لا يعني انتهاءُ الرابط شيئاً.
 */

/** عرض المصغّرة — يكفي البطاقة وشبكة المنشورات، ولا يُخزّن ما لا يُعرض */
const WIDTH = 480;
const QUALITY = 72;

/** سقف التحميل: صورة أكبر من هذا ليست مصغّرةً لبطاقة بل خطأ في المصدر */
const MAX_BYTES = 12 * 1024 * 1024;
const TIMEOUT_MS = 12_000;

/*
 * مضيفات الوسائط المسموح جلبها.
 *
 * هذه ليست تكراراً لـ`isMediaUrl` بل طبقةٌ فوقها: تلك تسأل «أهذا رابط
 * ملف؟» وهذه تسأل «أنجلبه من خادمنا؟». والفرق أمنيّ — الخادم يطلب ما
 * يُملى عليه، فرابطٌ إلى 169.254.169.254 أو إلى شبكة Docker الداخلية
 * يُخرج أسراراً لو لم تُقيَّد الوجهة بقائمة.
 */
const ALLOWED_HOSTS =
  /(^|\.)(fbcdn\.net|cdninstagram\.com|cdninstagram\.net|twimg\.com|licdn\.com|akamaihd\.net)$/i;

export function mediaRoot(): string {
  return process.env.MEDIA_DIR?.trim() || '/app/media';
}

/** مفتاح الصورة بصمةُ رابطها — فالصورة المشتركة بين منشورات تُحفظ مرة */
export function mediaKeyFor(url: string): string {
  return createHash('sha256').update(url).digest('hex').slice(0, 40);
}

function filePath(key: string): string {
  /*
   * مجلّدان من حرفين قبل الملف.
   *
   * عشرات الآلاف من الملفات في مجلّد واحد تُبطئ كلّ عملية عليه على أنظمة
   * الملفات الشائعة. والتوزيع على 256 مجلّداً يُبقي كلاً منها بالمئات.
   */
  return path.join(mediaRoot(), key.slice(0, 2), `${key}.webp`);
}

export function isFetchableMedia(url: string | null | undefined): url is string {
  if (!url || !isMediaUrl(url)) return false;
  try {
    return ALLOWED_HOSTS.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

export async function hasThumbnail(key: string): Promise<boolean> {
  try {
    const info = await stat(filePath(key));
    return info.isFile() && info.size > 0;
  } catch {
    return false;
  }
}

export async function readThumbnail(key: string): Promise<Buffer | null> {
  // المفتاح يأتي من الرابط، فيُتحقّق من شكله قبل أن يُبنى به مسار
  if (!/^[a-f0-9]{40}$/.test(key)) return null;
  try {
    return await readFile(filePath(key));
  } catch {
    return null;
  }
}

/**
 * جلب الصورة وحفظها مصغّرة.
 *
 * يُرجع المفتاح عند النجاح و`null` عند أي تعثّر — ولا يرمي أبداً: فشلُ صورةٍ
 * واحدة لا يجوز أن يُفشل استيراد دفعة.
 */
export async function storeThumbnail(url: string): Promise<string | null> {
  if (!isFetchableMedia(url)) return null;

  const key = mediaKeyFor(url);
  if (await hasThumbnail(key)) return key;

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      // بلا مُحيل: لا يُسرَّب عنوان المنصة الداخلية إلى خوادم المنصات
      referrerPolicy: 'no-referrer',
      redirect: 'follow',
    });
    if (!response.ok) return null;

    const length = Number(response.headers.get('content-length') ?? '0');
    if (length > MAX_BYTES) return null;

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_BYTES) return null;

    const thumbnail = await sharp(buffer, { failOn: 'none' })
      .rotate()
      .resize({ width: WIDTH, withoutEnlargement: true })
      .webp({ quality: QUALITY })
      .toBuffer();

    const target = filePath(key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, thumbnail);
    return key;
  } catch {
    return null;
  }
}

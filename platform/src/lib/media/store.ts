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

/*
 * معاملات التوقيع — تتغيّر مع كلّ استخراج ولا تغيّر الصورة.
 *
 * ★ بدون إسقاطها يتضاعف المخزن بلا أن يزيد فيه شيء.
 *
 *   رابط فيسبوك للصورة الواحدة يحمل توقيعاً ينتهي (`oh`/`oe`) ومعرّفات
 *   جلسة (`_nc_ohc` وأخواتها). فإعادة استخراج المنشور نفسه غداً تعطي
 *   رابطاً مختلف الحروف لصورةٍ واحدة — ومفتاحاً مختلفاً، وملفاً ثانياً
 *   على القرص لا يشير إليه أحد. وبعد أشهر يمتلئ المخزن بنُسَخٍ يتيمة،
 *   فيُقلَّم — فتُحذف مصغّرات حيّة لتبقى نُسَخ ميتة.
 *
 *   ولا يُسقَط `stp` ولا `name` ولا `format`: تلك تحدّد المقاس والصيغة،
 *   وإسقاطها يجمع الصورة المصغّرة والكاملة تحت مفتاح واحد فتُحفظ أصغرهما
 *   وتُعرض مكان الأخرى.
 */
const SIGNATURE_PARAM =
  /^(oh|oe|_nc_(ohc|oc|sid|ht|cat|gid|zt|tp|eui2|ad|rid|rml)|ccb|efg|edm|__cft__.*|__tn__|expires|signature|key-pair-id|x-amz-.*|sig|token)$/i;

/**
 * صورة الرابط التي يُشتقّ منها المفتاح.
 *
 * دالّة خالصة — تُفحص وحدها.
 */
export function canonicalMediaUrl(url: string): string {
  try {
    const parsed = new URL(url);
    for (const name of [...parsed.searchParams.keys()]) {
      if (SIGNATURE_PARAM.test(name)) parsed.searchParams.delete(name);
    }
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return url;
  }
}

/** مفتاح الصورة بصمةُ رابطها المجرَّد — فالصورة الواحدة تُحفظ مرة */
export function mediaKeyFor(url: string): string {
  return createHash('sha256').update(canonicalMediaUrl(url)).digest('hex').slice(0, 40);
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
 * نتيجة محاولة الحفظ.
 *
 * ★ الفشل نوعان لا نوع واحد، والخلط بينهما يُفسد إعادة المحاولة كلّها.
 *
 *   رابطٌ ردّ بـ410 ميتٌ لن يحيا، وإعادةُ سؤاله كلّ أربع دقائق إلى الأبد
 *   طلبٌ لا ينتهي على خوادم المنصة. وانقطاعُ شبكةٍ لحظي يُشفى بمحاولةٍ
 *   بعد دقائق، وحسبانه نهائياً يُفقد صورةً كان يمكن إنقاذها.
 *
 *   فيُفصل النوعان هنا — عند المصدر — لا يُخمَّنان في المكنسة.
 */
export type StoreOutcome =
  | { ok: true; key: string }
  | { ok: false; permanent: boolean; reason: string };

/**
 * رموز الحالة التي لا تُعاد المحاولة بعدها.
 *
 * 403 و410 هما أكثرها وقوعاً: توقيعٌ انتهت صلاحيته، ومحتوىً حُذف من
 * مصدره. و429 و5xx ليست منها — تلك «عد لاحقاً» لا «لا شيء هنا».
 */
const PERMANENT_STATUS = new Set([400, 401, 403, 404, 410, 451]);

/**
 * جلب الصورة وحفظها مصغّرة.
 *
 * لا يرمي أبداً: فشلُ صورةٍ واحدة لا يجوز أن يُفشل استيراد دفعة.
 */
export async function storeThumbnail(url: string): Promise<StoreOutcome> {
  // رابطٌ خارج المضيفات المسموحة لن يصير مسموحاً بمحاولةٍ ثانية
  if (!isFetchableMedia(url)) {
    return { ok: false, permanent: true, reason: 'رابط غير صالح أو مضيف غير مسموح' };
  }

  const key = mediaKeyFor(url);
  if (await hasThumbnail(key)) return { ok: true, key };

  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      // بلا مُحيل: لا يُسرَّب عنوان المنصة الداخلية إلى خوادم المنصات
      referrerPolicy: 'no-referrer',
      redirect: 'follow',
    });
  } catch (error) {
    // انقطاعٌ أو مهلة — يُعاد لاحقاً
    return {
      ok: false,
      permanent: false,
      reason: error instanceof Error ? error.name : 'تعذّر الاتصال',
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      permanent: PERMANENT_STATUS.has(response.status),
      reason: `HTTP ${response.status}`,
    };
  }

  try {
    const length = Number(response.headers.get('content-length') ?? '0');
    if (length > MAX_BYTES) {
      return { ok: false, permanent: true, reason: 'أكبر من الحدّ' };
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength === 0) {
      return { ok: false, permanent: false, reason: 'ردّ فارغ' };
    }
    if (buffer.byteLength > MAX_BYTES) {
      return { ok: false, permanent: true, reason: 'أكبر من الحدّ' };
    }

    const thumbnail = await sharp(buffer, { failOn: 'none' })
      .rotate()
      .resize({ width: WIDTH, withoutEnlargement: true })
      .webp({ quality: QUALITY })
      .toBuffer();

    const target = filePath(key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, thumbnail);
    return { ok: true, key };
  } catch (error) {
    /*
     * الوصول إلى هنا يعني بايتاتٍ لا تُقرأ صورةً، أو قرصاً لا يُكتب عليه.
     *
     * والأولى نهائية — البايتات نفسها ستعود غداً — والثانية عابرة. ولا
     * سبيل إلى التفريق بيقين، فتُعدّ عابرة: إعادةُ محاولةٍ زائدة أرخص من
     * أرشيفٍ فقد صوره لأن القرص امتلأ دقيقةً واحدة.
     */
    return {
      ok: false,
      permanent: false,
      reason: error instanceof Error ? error.message.slice(0, 80) : 'تعذّرت المعالجة',
    };
  }
}

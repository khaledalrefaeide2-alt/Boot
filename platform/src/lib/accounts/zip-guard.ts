import { inflateRawSync } from 'node:zlib';

/**
 * حارس الملفات المضغوطة قبل قراءتها — دالّة خالصة تُفحص وحدها.
 *
 * ★ ملف xlsx أرشيفُ zip، وExcelJS يفكّه كلّه في الذاكرة.
 *
 *   فملفٌّ بخمسة ميغابايت (الحدّ المسموح) قد ينفكّ إلى غيغابايتات: ورقةٌ
 *   من أصفارٍ تتكرّر تنضغط ألف مرّة ([zip bomb](https://en.wikipedia.org/wiki/Zip_bomb)).
 *   ورفعُ ملفٍّ كهذا مرّةً واحدة يكفي ليستنزف ذاكرة التطبيق فيسقط الموقع
 *   على الجميع.
 *
 *   والأحجام المكتوبة في فهرس الأرشيف لا يُوثق بها — يكتبها صانع الملف.
 *   فالحارس **يفكّ فعلاً** كلّ مدخلٍ بسقفٍ على الناتج (`maxOutputLength`):
 *   يتوقّف zlib عند بلوغه ولا يُكمل. وبعدها وحدها تُسلَّم البايتات لـExcelJS.
 *
 *   والكلفة فكٌّ زائد مرّةً لملفٍّ صغير — ملف ٥٠٠ صف لا يتجاوز بضع مئات
 *   من الكيلوبايتات منفوكاً.
 */
export interface ZipLimits {
  /** مجموع ما تنفكّ إليه المدخلات كلّها */
  maxTotalBytes: number;
  /** أقصى عدد مدخلات — ملف Excel العادي بالعشرات */
  maxEntries: number;
}

export const XLSX_LIMITS: ZipLimits = { maxTotalBytes: 64 * 1024 * 1024, maxEntries: 2000 };

export type ZipVerdict = { ok: true; totalBytes: number; entries: number } | { ok: false; reason: string };

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

export function inspectZip(input: ArrayBuffer | Uint8Array, limits: ZipLimits = XLSX_LIMITS): ZipVerdict {
  const buf = Buffer.from(input instanceof Uint8Array ? input : new Uint8Array(input));
  if (buf.length < 22) return { ok: false, reason: 'ليس أرشيفاً صالحاً' };

  // سجلّ نهاية الفهرس: في آخر 22 بايتاً، أو قبلها بتعليقٍ أقصاه 65535
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i -= 1) {
    if (buf.readUInt32LE(i) === EOCD_SIGNATURE) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) return { ok: false, reason: 'ليس أرشيفاً صالحاً' };

  const entries = buf.readUInt16LE(eocd + 10);
  const centralOffset = buf.readUInt32LE(eocd + 16);
  // ‏0xFFFF/0xFFFFFFFF علامة ZIP64 — ولا يحتاجها ملف Excel بهذا الحجم
  if (entries === 0xffff || centralOffset === 0xffffffff) {
    return { ok: false, reason: 'أرشيفٌ بصيغة ZIP64 غير مقبول' };
  }
  if (entries > limits.maxEntries) return { ok: false, reason: 'عدد الملفات داخل الأرشيف كبير جداً' };

  let pointer = centralOffset;
  let total = 0;
  for (let n = 0; n < entries; n += 1) {
    if (pointer + 46 > buf.length || buf.readUInt32LE(pointer) !== CENTRAL_SIGNATURE) {
      return { ok: false, reason: 'فهرس الأرشيف تالف' };
    }
    const method = buf.readUInt16LE(pointer + 10);
    const compressedSize = buf.readUInt32LE(pointer + 20);
    const declaredSize = buf.readUInt32LE(pointer + 24);
    const nameLength = buf.readUInt16LE(pointer + 28);
    const extraLength = buf.readUInt16LE(pointer + 30);
    const commentLength = buf.readUInt16LE(pointer + 32);
    const localOffset = buf.readUInt32LE(pointer + 42);
    pointer += 46 + nameLength + extraLength + commentLength;

    if (compressedSize === 0xffffffff || declaredSize === 0xffffffff || localOffset === 0xffffffff) {
      return { ok: false, reason: 'أرشيفٌ بصيغة ZIP64 غير مقبول' };
    }
    if (localOffset + 30 > buf.length || buf.readUInt32LE(localOffset) !== LOCAL_SIGNATURE) {
      return { ok: false, reason: 'أرشيفٌ تالف' };
    }
    const dataStart =
      localOffset + 30 + buf.readUInt16LE(localOffset + 26) + buf.readUInt16LE(localOffset + 28);
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > buf.length) return { ok: false, reason: 'أرشيفٌ تالف' };

    const budget = limits.maxTotalBytes - total;
    if (method === 0) {
      // مخزَّن بلا ضغط: حجمه حجمُ بايتاته
      total += compressedSize;
    } else if (method === 8) {
      try {
        total += inflateRawSync(buf.subarray(dataStart, dataEnd), { maxOutputLength: Math.max(1, budget) })
          .length;
      } catch (error) {
        // zlib يرمي RangeError حين يبلغ الناتج السقف — وهو ما نبحث عنه
        if (error instanceof RangeError) return { ok: false, reason: 'الملف ينفكّ إلى حجمٍ أكبر من المسموح' };
        return { ok: false, reason: 'أرشيفٌ تالف' };
      }
    } else {
      return { ok: false, reason: 'طريقة ضغطٍ غير مدعومة' };
    }
    if (total > limits.maxTotalBytes) return { ok: false, reason: 'الملف ينفكّ إلى حجمٍ أكبر من المسموح' };
  }

  return { ok: true, totalBytes: total, entries };
}

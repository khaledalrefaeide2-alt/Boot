import 'server-only';
import ExcelJS from 'exceljs';
import { prisma } from '@/lib/db';
import { urlSchema } from '@/lib/validation/common';
import {
  ACCOUNT_OWNERSHIP_LABELS,
  ACCOUNT_TYPE_LABELS,
  ACCOUNT_VISIBILITY_LABELS,
  ENTITY_STATUS_LABELS,
} from '@/lib/domain/constants';
import type {
  AccountOwnership,
  AccountType,
  AccountVisibility,
  EntityStatus,
} from '@/generated/prisma';

/**
 * استيراد الحسابات من ملف Excel.
 *
 * الملف يكتبه موظف لا مبرمج، فالقراءة متسامحة قصداً: العناوين تُطابق بعد
 * تجريدها من التشكيل والمسافات، والقيم تُقبل بالعربية كما تظهر في الشاشة
 * وبالرمز الإنجليزي معاً، والمنصة تُطابق باسمها أو برمزها. التساهل في
 * القراءة لا في التحقق: كل صف لا يستوفي الشروط يُرفض بسببه مكتوباً.
 */

export const IMPORT_COLUMNS = [
  'المنصة',
  'اسم الحساب',
  'رابط الحساب',
  'اسم المستخدم',
  'المعرّف الخارجي',
  'نوع الحساب',
  'الملكية',
  'الظهور',
  'اللغة',
  'الدولة',
  'الحالة',
] as const;

/** الأعمدة التي لا يصلح الصف بدونها */
const REQUIRED_COLUMNS = ['المنصة', 'اسم الحساب', 'رابط الحساب'] as const;

/** حدّ الصفوف في الملف الواحد — يحمي الذاكرة ويمنع استيراداً بالخطأ */
export const MAX_IMPORT_ROWS = 500;

export type RowState = 'ready' | 'duplicate' | 'error';

export interface ImportRow {
  /** رقم الصف في الملف كما يراه المستخدم في Excel */
  line: number;
  state: RowState;
  message: string | null;
  name: string;
  url: string;
  platformName: string;
  data: {
    platformId: string;
    name: string;
    url: string;
    username: string | null;
    externalId: string | null;
    type: AccountType;
    ownership: AccountOwnership;
    visibility: AccountVisibility;
    language: string | null;
    country: string | null;
    status: EntityStatus;
  } | null;
}

export interface ImportReport {
  rows: ImportRow[];
  ready: number;
  duplicates: number;
  errors: number;
}

export class ImportError extends Error {}

/* ------------------------------- تطبيع النصوص ------------------------------ */

const ARABIC_DIACRITICS = /[ً-ْـ]/g;

/**
 * تطبيع نص للمطابقة لا للعرض.
 *
 * الهمزات والتاء المربوطة والتشكيل تختلف بين كاتب وآخر في الكلمة نفسها،
 * فلو طابقنا حرفياً لرُفض «المعرف الخارجي» لأن القالب كتبها «المعرّف».
 */
function normalize(value: unknown): string {
  return String(value ?? '')
    .replace(ARABIC_DIACRITICS, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** قراءة قيمة خلية كنص، مع تسطيح الصيغ والروابط التي تعيدها ExcelJS ككائنات */
function cellText(cell: ExcelJS.Cell | undefined): string {
  const value = cell?.value;
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value).trim();
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    // الرابط في Excel كائن {text, hyperlink}، والصيغة كائن {result}
    const record = value as unknown as Record<string, unknown>;
    if (typeof record.text === 'string') return record.text.trim();
    if (typeof record.hyperlink === 'string') return record.hyperlink.trim();
    if (record.result !== undefined && record.result !== null) return String(record.result).trim();
    if (Array.isArray(record.richText)) {
      return record.richText.map((part) => String((part as { text?: string }).text ?? '')).join('').trim();
    }
  }
  return '';
}

/** بناء جدول «قيمة مقبولة ← رمز» من التسميات العربية ومن الرموز نفسها */
function lookupFrom<T extends string>(labels: Record<T, string>, extra: Record<string, T> = {}) {
  const table = new Map<string, T>();
  for (const [code, label] of Object.entries(labels) as [T, string][]) {
    table.set(normalize(code), code);
    table.set(normalize(label), code);
  }
  for (const [alias, code] of Object.entries(extra)) table.set(normalize(alias), code);
  return table;
}

const TYPE_LOOKUP = lookupFrom<AccountType>(ACCOUNT_TYPE_LABELS, {
  صفحه: 'PAGE',
  شخصي: 'PROFILE',
  حساب: 'PROFILE',
  مجموعه: 'GROUP',
  قناه: 'CHANNEL',
  اخرى: 'OTHER',
});
const OWNERSHIP_LOOKUP = lookupFrom<AccountOwnership>(ACCOUNT_OWNERSHIP_LABELS, {
  'حساب نملكه': 'OWNED',
  نملكه: 'OWNED',
  داخلي: 'OWNED',
  'جهه اخرى': 'EXTERNAL',
  خارجي: 'EXTERNAL',
});
const VISIBILITY_LOOKUP = lookupFrom<AccountVisibility>(ACCOUNT_VISIBILITY_LABELS, {
  علني: 'PUBLIC',
  مغلق: 'PRIVATE',
});
const STATUS_LOOKUP = lookupFrom<EntityStatus>(ENTITY_STATUS_LABELS, {
  مفعل: 'ACTIVE',
  يعمل: 'ACTIVE',
  موقوف: 'INACTIVE',
  معطل: 'INACTIVE',
  متوقفه: 'INACTIVE',
});

/** قائمة القيم المقبولة لعرضها في رسالة الخطأ وفي ورقة القالب */
export const ALLOWED_VALUES = {
  'نوع الحساب': Object.values(ACCOUNT_TYPE_LABELS),
  الملكية: Object.values(ACCOUNT_OWNERSHIP_LABELS),
  الظهور: Object.values(ACCOUNT_VISIBILITY_LABELS),
  الحالة: Object.values(ENTITY_STATUS_LABELS),
} as const;

/* --------------------------------- التحليل -------------------------------- */

function readHeader(sheet: ExcelJS.Worksheet): Map<string, number> {
  const header = new Map<string, number>();
  const row = sheet.getRow(1);
  row.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
    const key = normalize(cellText(cell));
    if (key && !header.has(key)) header.set(key, columnNumber);
  });
  return header;
}

/**
 * قراءة الملف وتحويله إلى تقرير جاهز للعرض أو للحفظ.
 *
 * لا يكتب شيئاً في القاعدة: يقرأ منها المنصات والروابط المسجلة ليحكم على
 * كل صف. فالمعاينة والتنفيذ يستدعيان الدالة نفسها ويريان النتيجة نفسها.
 */
export async function parseAccountsWorkbook(buffer: ArrayBuffer): Promise<ImportReport> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch {
    throw new ImportError('تعذّرت قراءة الملف — تأكد أنه بصيغة Excel ‏(.xlsx) وغير تالف');
  }

  const sheet = workbook.worksheets[0];
  if (!sheet) throw new ImportError('الملف لا يحتوي على أي ورقة');

  const header = readHeader(sheet);
  const missing = REQUIRED_COLUMNS.filter((column) => !header.has(normalize(column)));
  if (missing.length > 0) {
    throw new ImportError(
      `الأعمدة التالية مفقودة من الصف الأول: ${missing.join('، ')}. نزّل القالب واستعمله كما هو`,
    );
  }

  const column = (name: string): number | undefined => header.get(normalize(name));
  const valueAt = (row: ExcelJS.Row, name: string): string => {
    const index = column(name);
    return index ? cellText(row.getCell(index)) : '';
  };

  const platforms = await prisma.platform.findMany({
    select: { id: true, name: true, code: true, status: true },
  });
  const platformLookup = new Map<string, (typeof platforms)[number]>();
  for (const platform of platforms) {
    platformLookup.set(normalize(platform.name), platform);
    platformLookup.set(normalize(platform.code), platform);
  }

  const existing = await prisma.account.findMany({ select: { platformId: true, url: true } });
  const existingKeys = new Set(existing.map((account) => `${account.platformId}|${account.url}`));
  const seenInFile = new Map<string, number>();

  const rows: ImportRow[] = [];

  for (let line = 2; line <= sheet.rowCount; line += 1) {
    const row = sheet.getRow(line);
    const platformCell = valueAt(row, 'المنصة');
    const name = valueAt(row, 'اسم الحساب');
    const url = valueAt(row, 'رابط الحساب');

    // صف فارغ تماماً يُتخطى بصمت: جداول Excel تحمل صفوفاً فارغة في ذيلها
    if (!platformCell && !name && !url) continue;

    if (rows.length >= MAX_IMPORT_ROWS) {
      throw new ImportError(
        `الملف يتجاوز ${MAX_IMPORT_ROWS} صفاً. قسّمه إلى ملفات أصغر ثم استوردها تباعاً`,
      );
    }

    const fail = (message: string): void => {
      rows.push({ line, state: 'error', message, name, url, platformName: platformCell, data: null });
    };

    if (!name) {
      fail('اسم الحساب فارغ');
      continue;
    }
    if (!platformCell) {
      fail('المنصة فارغة');
      continue;
    }

    const platform = platformLookup.get(normalize(platformCell));
    if (!platform) {
      const names = platforms.map((p) => p.name).join('، ');
      fail(`منصة غير معروفة. المنصات المسجلة: ${names || 'لا توجد منصات بعد'}`);
      continue;
    }
    if (platform.status !== 'ACTIVE') {
      fail(`المنصة «${platform.name}» متوقفة — فعّلها أولاً من إدارة المنصات`);
      continue;
    }

    const parsedUrl = urlSchema.safeParse(url);
    if (!parsedUrl.success) {
      fail(parsedUrl.error.issues[0]?.message ?? 'رابط الحساب غير صالح');
      continue;
    }
    const cleanUrl = parsedUrl.data;

    const decode = <T extends string>(
      columnName: string,
      lookup: Map<string, T>,
      fallback: T,
    ): T | null => {
      const raw = valueAt(row, columnName);
      if (!raw) return fallback;
      const code = lookup.get(normalize(raw));
      return code ?? null;
    };

    const type = decode<AccountType>('نوع الحساب', TYPE_LOOKUP, 'PAGE');
    if (!type) {
      fail(`قيمة «نوع الحساب» غير مقبولة. المقبول: ${ALLOWED_VALUES['نوع الحساب'].join('، ')}`);
      continue;
    }
    const ownership = decode<AccountOwnership>('الملكية', OWNERSHIP_LOOKUP, 'EXTERNAL');
    if (!ownership) {
      fail(`قيمة «الملكية» غير مقبولة. المقبول: ${ALLOWED_VALUES.الملكية.join('، ')}`);
      continue;
    }
    const visibility = decode<AccountVisibility>('الظهور', VISIBILITY_LOOKUP, 'PUBLIC');
    if (!visibility) {
      fail(`قيمة «الظهور» غير مقبولة. المقبول: ${ALLOWED_VALUES.الظهور.join('، ')}`);
      continue;
    }
    const status = decode<EntityStatus>('الحالة', STATUS_LOOKUP, 'ACTIVE');
    if (!status) {
      fail(`قيمة «الحالة» غير مقبولة. المقبول: ${ALLOWED_VALUES.الحالة.join('، ')}`);
      continue;
    }

    const key = `${platform.id}|${cleanUrl}`;
    const base = { line, name, url: cleanUrl, platformName: platform.name };

    const twin = seenInFile.get(key);
    if (twin !== undefined) {
      rows.push({ ...base, state: 'duplicate', message: `مكرر مع الصف ${twin} في الملف نفسه`, data: null });
      continue;
    }
    seenInFile.set(key, line);

    if (existingKeys.has(key)) {
      rows.push({ ...base, state: 'duplicate', message: 'مسجّل مسبقاً على المنصة نفسها', data: null });
      continue;
    }

    const trim = (value: string, max: number): string | null =>
      value ? value.slice(0, max) : null;

    rows.push({
      ...base,
      state: 'ready',
      message: null,
      data: {
        platformId: platform.id,
        name: name.slice(0, 160),
        url: cleanUrl,
        username: trim(valueAt(row, 'اسم المستخدم'), 120),
        externalId: trim(valueAt(row, 'المعرّف الخارجي'), 120),
        type,
        ownership,
        visibility,
        language: trim(valueAt(row, 'اللغة'), 10),
        country: trim(valueAt(row, 'الدولة'), 80),
        status,
      },
    });
  }

  if (rows.length === 0) throw new ImportError('الملف لا يحتوي على أي صف بيانات تحت الصف الأول');

  return {
    rows,
    ready: rows.filter((row) => row.state === 'ready').length,
    duplicates: rows.filter((row) => row.state === 'duplicate').length,
    errors: rows.filter((row) => row.state === 'error').length,
  };
}

/* --------------------------------- القالب --------------------------------- */

/** قالب فارغ بالأعمدة المطلوبة وصف مثال وورقة تشرح القيم المقبولة */
export async function buildImportTemplate(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'منصة رصد وتحليل المنصات الإعلامية';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('الحسابات', {
    views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }],
  });
  sheet.columns = IMPORT_COLUMNS.map((column) => ({
    header: column,
    key: column,
    width: column === 'رابط الحساب' ? 46 : 20,
  }));

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF123A63' } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'right' };
  headerRow.height = 24;

  const platforms = await prisma.platform.findMany({
    where: { status: 'ACTIVE' },
    orderBy: { sortOrder: 'asc' },
    select: { name: true },
  });
  const samplePlatform = platforms[0]?.name ?? 'فيسبوك';

  const example = sheet.addRow([
    samplePlatform,
    'الصفحة الرسمية للوزارة',
    'https://www.facebook.com/example-page',
    'example.page',
    '',
    ACCOUNT_TYPE_LABELS.PAGE,
    ACCOUNT_OWNERSHIP_LABELS.OWNED,
    ACCOUNT_VISIBILITY_LABELS.PUBLIC,
    'ar',
    'الأردن',
    ENTITY_STATUS_LABELS.ACTIVE,
  ]);
  example.font = { italic: true, color: { argb: 'FF7A7A7A' } };

  const guide = workbook.addWorksheet('القيم المقبولة', { views: [{ rightToLeft: true }] });
  guide.columns = [
    { header: 'العمود', key: 'column', width: 22 },
    { header: 'إلزامي', key: 'required', width: 12 },
    { header: 'القيم المقبولة', key: 'values', width: 70 },
  ];
  const guideHeader = guide.getRow(1);
  guideHeader.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
  guideHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF123A63' } };
  guideHeader.alignment = { vertical: 'middle', horizontal: 'right' };

  const platformNames = platforms.map((platform) => platform.name).join('، ');
  const rows: [string, string, string][] = [
    ['المنصة', 'نعم', platformNames || 'أضف منصة واحدة على الأقل من إدارة المنصات'],
    ['اسم الحساب', 'نعم', 'نص حر حتى 160 حرفاً'],
    ['رابط الحساب', 'نعم', 'رابط كامل يبدأ بـ https://‏ — وهو ما يميّز الحساب فلا يتكرر على المنصة نفسها'],
    ['اسم المستخدم', 'لا', 'المعرّف القصير للحساب، مثل example.page'],
    ['المعرّف الخارجي', 'لا', 'رقم أو معرّف الحساب على المنصة إن توفر'],
    ['نوع الحساب', 'لا', `${ALLOWED_VALUES['نوع الحساب'].join('، ')} — الافتراضي: ${ACCOUNT_TYPE_LABELS.PAGE}`],
    ['الملكية', 'لا', `${ALLOWED_VALUES.الملكية.join('، ')} — الافتراضي: ${ACCOUNT_OWNERSHIP_LABELS.EXTERNAL}`],
    ['الظهور', 'لا', `${ALLOWED_VALUES.الظهور.join('، ')} — الافتراضي: ${ACCOUNT_VISIBILITY_LABELS.PUBLIC}`],
    ['اللغة', 'لا', 'رمز اللغة: ar أو en'],
    ['الدولة', 'لا', 'اسم الدولة'],
    ['الحالة', 'لا', `${ALLOWED_VALUES.الحالة.join('، ')} — الافتراضي: ${ENTITY_STATUS_LABELS.ACTIVE}`],
  ];
  for (const row of rows) {
    const added = guide.addRow(row);
    added.alignment = { vertical: 'top', horizontal: 'right', wrapText: true };
  }

  guide.addRow([]);
  const note = guide.addRow([
    'ملاحظة',
    '',
    `احذف صف المثال قبل الاستيراد. إعدادات الاستخراج (النافذة الزمنية، التكرار، أقصى عدد) تأخذ القيم الافتراضية وتُعدَّل من شاشة الحساب. الحد الأقصى ${MAX_IMPORT_ROWS} صفاً في الملف الواحد.`,
  ]);
  note.font = { bold: true };
  note.alignment = { vertical: 'top', horizontal: 'right', wrapText: true };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

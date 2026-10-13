import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/*
 * tailwind-merge يعرف مقاسات الظل المعيارية (xs, sm, lg …) ويحلّ التعارض
 * بينها، لكنه لا يعرف مستويات الارتفاع عندنا. بدونه يبقى الصنفان معاً في
 * السلسلة حين يمرّر مكوّن ظلاً مخالفاً لظل الأساس، ويصير الفائز ترتيبَ
 * القواعد في ملف CSS لا نيّة من كتب المكوّن. فنُعرّفها في المجموعة نفسها.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      shadow: [{ shadow: ['elev-0', 'elev-1', 'elev-2', 'elev-3', 'elev-4'] }],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

const AR_LOCALE = 'ar';

/** تنسيق الأعداد بالأرقام العربية الغربية مع فواصل الآلاف */
export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat(AR_LOCALE, { useGrouping: true }).format(value);
}

/** اختصار الأعداد الكبيرة: 12.4 ألف / 3.1 مليون */
export function formatCompactNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  if (Math.abs(value) < 1000) return formatNumber(value);
  if (Math.abs(value) < 1_000_000) return `${(value / 1000).toFixed(1).replace(/\.0$/, '')} ألف`;
  return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')} مليون`;
}

/** نسبة مئوية بمنزلة عشرية واحدة */
export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${value.toFixed(digits).replace(/\.0$/, '')}٪`;
}

const dateFormatter = new Intl.DateTimeFormat(AR_LOCALE, {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

const dateTimeFormatter = new Intl.DateTimeFormat(AR_LOCALE, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const shortDateFormatter = new Intl.DateTimeFormat(AR_LOCALE, {
  month: 'short',
  day: 'numeric',
});

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return dateFormatter.format(date);
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return dateTimeFormatter.format(date);
}

export function formatShortDate(value: Date | string | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return shortDateFormatter.format(date);
}

/** فارق زمني نسبي بالعربية: قبل 5 دقائق */
export function formatRelativeTime(value: Date | string | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';

  const diffSeconds = Math.round((date.getTime() - Date.now()) / 1000);
  const abs = Math.abs(diffSeconds);
  const rtf = new Intl.RelativeTimeFormat(AR_LOCALE, { numeric: 'auto' });

  if (abs < 60) return rtf.format(Math.round(diffSeconds), 'second');
  if (abs < 3600) return rtf.format(Math.round(diffSeconds / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diffSeconds / 3600), 'hour');
  if (abs < 2592000) return rtf.format(Math.round(diffSeconds / 86400), 'day');
  if (abs < 31536000) return rtf.format(Math.round(diffSeconds / 2592000), 'month');
  return rtf.format(Math.round(diffSeconds / 31536000), 'year');
}

const sameYearFormatter = new Intl.DateTimeFormat(AR_LOCALE, {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

const otherYearFormatter = new Intl.DateTimeFormat(AR_LOCALE, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});

/**
 * وقت نشر المنشور كما يُقرأ في بطاقة — قصيرٌ ودقيق معاً.
 *
 * ★ نسبيٌّ لما مضى عليه أقلّ من يوم، ومطلقٌ لما بعده.
 *
 *   «قبل ٣ ساعات» تُقرأ في لمحة وتقول ما يحتاجه الرصد الحيّ: هل هذا
 *   جديد؟ أمّا «قبل ١٧ يوماً» فلا يُبنى عليها شيء — من يكتب تقريراً
 *   يحتاج «١٠ أكتوبر، ٢:٠٥ م». والسنة تُحذف في السنة الجارية وحدها،
 *   والساعة تُحذف فيما قبلها: منشورٌ من العام الماضي يُسأل عن يومه.
 *
 * والوقت بتوقيت جهاز القارئ — البطاقة تُرسم في متصفّحه. والوقت الكامل
 * يوضع في `title` و`dateTime` بجانب هذا، فلا يضيع شيءٌ بالاختصار.
 *
 * دالّة خالصة بمعامل «الآن» — تُفحص وحدها.
 */
export function formatPublishedAt(
  value: Date | string | null | undefined,
  now: Date = new Date(),
): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';

  const ageMs = now.getTime() - date.getTime();
  if (ageMs < 60_000 && ageMs > -60_000) return 'الآن';
  if (ageMs > 0 && ageMs < 86_400_000) {
    const rtf = new Intl.RelativeTimeFormat(AR_LOCALE, { numeric: 'auto' });
    return ageMs < 3_600_000
      ? rtf.format(-Math.round(ageMs / 60_000), 'minute')
      : rtf.format(-Math.round(ageMs / 3_600_000), 'hour');
  }
  return date.getFullYear() === now.getFullYear()
    ? sameYearFormatter.format(date)
    : otherYearFormatter.format(date);
}

/** مدة بالميلي ثانية إلى صيغة عربية مقروءة */
export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || ms < 0) return '—';
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${formatNumber(seconds)} ثانية`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes < 60) return rest ? `${minutes} د ${rest} ث` : `${minutes} دقيقة`;
  const hours = Math.floor(minutes / 60);
  return `${hours} س ${minutes % 60} د`;
}

/** اقتطاع النص مع الحفاظ على الكلمات */
export function truncate(text: string | null | undefined, maxLength = 160): string {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).replace(/\s+\S*$/, '')}…`;
}

/** بداية اليوم بتوقيت UTC — مفتاح جداول الإحصاءات اليومية */
export function startOfUtcDay(date: Date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** إضافة أيام إلى تاريخ */
export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/**
 * صيغة المعدود العربي الصحيحة لعدد معطى.
 *
 * العربية تصرّف المعدود على أربع صيغ لا على اثنتين كالإنجليزية: المفرد،
 * والمثنى، وجمع القلة من ثلاثة إلى عشرة، ثم المفرد المنصوب فيما فوقها.
 * فـ«3 حساب» و«12 حسابات» كلاهما خطأ ظاهر لقارئ عربي.
 *
 * العدد نفسه يبقى على المستدعي ليضعه في عنصر مستقل، لأن الأرقام تُعرض
 * يساراً داخل نص يمينيّ فتحتاج عزلاً باتجاهها.
 */
/**
 * تغيّر النصف الثاني من الفترة عن نصفها الأول، نسبةً مئوية.
 *
 * ★ رقمٌ محسوب من المعروض لا مُستدعىً من مكان آخر.
 *
 *   شارة «+٢٨٪» في لوحة مقاييس تُقرأ «مقارنةً بالفترة السابقة» عادةً —
 *   وتلك تحتاج استعلاماً ثانياً على نافذةٍ سابقة. وما لم يُجلب فعلاً لا
 *   يجوز أن يُعرض: رقمٌ مختلَق بجانب رقمٍ صحيح يُفسد الاثنين.
 *
 *   فهذه تقارن نصفَي النافذة المعروضة نفسها — بيانٌ في اليد، ومعناه
 *   مكتوبٌ لقارئ الشاشة صراحةً حتى لا يُقرأ غير ما هو.
 *
 * وتُعيد `undefined` حين لا يصحّ الحساب: نصفٌ فارغ، أو أساسٌ صفر — والقسمة
 * على صفر تعطي ∞ تُطبع «Infinity٪» في البطاقة.
 */
export function halfOverHalfChange(values: number[]): number | undefined {
  if (values.length < 4) return undefined;

  const middle = Math.floor(values.length / 2);
  const sum = (list: number[]) => list.reduce((total, value) => total + (value || 0), 0);

  const first = sum(values.slice(0, middle));
  const second = sum(values.slice(middle));
  if (first <= 0) return undefined;

  return ((second - first) / first) * 100;
}

export function arabicPlural(
  count: number,
  forms: { one: string; two: string; few: string; many: string },
): string {
  const value = Math.abs(count) % 100;
  if (value === 1) return forms.one;
  if (value === 2) return forms.two;
  if (value >= 3 && value <= 10) return forms.few;
  return forms.many;
}

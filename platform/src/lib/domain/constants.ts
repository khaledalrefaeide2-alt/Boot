import type {
  AccountOwnership,
  AccountType,
  AccountVisibility,
  EntityStatus,
  ExtractionStatus,
  ExtractionTrigger,
  NotificationSeverity,
  NotificationType,
  PostType,
  ReportFormat,
  ReportPeriod,
  ReportStatus,
  Sentiment,
  UserStatus,
} from '@/generated/prisma';

/** رموز المنصات المعتمدة في النسخة الأولى */
export const PLATFORM_CODES = ['facebook', 'x', 'instagram'] as const;
export type PlatformCode = (typeof PLATFORM_CODES)[number];

export const USER_STATUS_LABELS: Record<UserStatus, string> = {
  PENDING: 'بانتظار الموافقة',
  ACTIVE: 'مفعّل',
  DISABLED: 'معطّل',
};

/** الرسائل المعروضة للمستخدم عند منع الدخول */
export const AUTH_MESSAGES = {
  PENDING: 'حسابك بانتظار الموافقة',
  DISABLED: 'حسابك معطل',
  INVALID: 'البريد الإلكتروني أو كلمة المرور غير صحيحة',
  LOCKED: 'تم إيقاف المحاولات مؤقتاً بسبب تكرار الفشل، حاول بعد قليل',
} as const;

export const ENTITY_STATUS_LABELS: Record<EntityStatus, string> = {
  ACTIVE: 'نشط',
  INACTIVE: 'متوقف',
};

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  PAGE: 'صفحة',
  PROFILE: 'حساب شخصي',
  GROUP: 'مجموعة',
  CHANNEL: 'قناة',
  OTHER: 'أخرى',
};

export const ACCOUNT_OWNERSHIP_LABELS: Record<AccountOwnership, string> = {
  OWNED: 'حساب نملكه',
  EXTERNAL: 'جهة أخرى',
};

export const ACCOUNT_VISIBILITY_LABELS: Record<AccountVisibility, string> = {
  PUBLIC: 'عام',
  PRIVATE: 'خاص',
};

export const EXTRACTION_STATUS_LABELS: Record<ExtractionStatus, string> = {
  PENDING: 'بانتظار التشغيل',
  RUNNING: 'قيد التشغيل',
  SUCCEEDED: 'ناجحة',
  FAILED: 'فاشلة',
  CANCELLED: 'ملغاة',
  NO_RESULTS: 'بلا نتائج',
};

/** لون كل حالة استخراج في الواجهة */
export const EXTRACTION_STATUS_TONE: Record<ExtractionStatus, 'neutral' | 'info' | 'success' | 'danger' | 'warning'> = {
  PENDING: 'neutral',
  RUNNING: 'info',
  SUCCEEDED: 'success',
  FAILED: 'danger',
  CANCELLED: 'neutral',
  NO_RESULTS: 'warning',
};

export const EXTRACTION_TRIGGER_LABELS: Record<ExtractionTrigger, string> = {
  MANUAL: 'يدوي',
  SCHEDULED: 'مجدول',
  WEBHOOK: 'Webhook',
};

export const POST_TYPE_LABELS: Record<PostType, string> = {
  TEXT: 'نص',
  IMAGE: 'صورة',
  VIDEO: 'فيديو',
  REEL: 'ريل',
  LINK: 'رابط',
  ALBUM: 'ألبوم',
  STORY: 'قصة',
  OTHER: 'أخرى',
};

export const SENTIMENT_LABELS: Record<Sentiment, string> = {
  POSITIVE: 'إيجابي',
  NEUTRAL: 'محايد',
  NEGATIVE: 'سلبي',
  MIXED: 'مختلط',
  UNKNOWN: 'غير محدد',
};

export const SENTIMENT_TONE: Record<Sentiment, 'success' | 'neutral' | 'danger' | 'warning'> = {
  POSITIVE: 'success',
  NEUTRAL: 'neutral',
  NEGATIVE: 'danger',
  MIXED: 'warning',
  UNKNOWN: 'neutral',
};

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  EXTRACTION_FAILED: 'فشل عملية استخراج',
  EXTRACTION_SUCCEEDED: 'نجاح عملية استخراج',
  EXTRACTION_NO_RESULTS: 'عملية استخراج بلا نتائج',
  HIGH_ENGAGEMENT_POST: 'منشور مرتفع التفاعل',
  NEGATIVE_SENTIMENT_SPIKE: 'ارتفاع في المشاعر السلبية',
  KEYWORD_HIT: 'ظهور كلمة مفتاحية مهمة',
  USER_PENDING_APPROVAL: 'مستخدم بانتظار الموافقة',
  SYSTEM: 'إشعار نظام',
};

export const NOTIFICATION_SEVERITY_TONE: Record<NotificationSeverity, 'neutral' | 'success' | 'warning' | 'danger'> = {
  INFO: 'neutral',
  SUCCESS: 'success',
  WARNING: 'warning',
  ERROR: 'danger',
};

export const REPORT_FORMAT_LABELS: Record<ReportFormat, string> = {
  EXCEL: 'Excel',
  PDF: 'PDF',
};

export const REPORT_PERIOD_LABELS: Record<ReportPeriod, string> = {
  DAILY: 'يومي',
  WEEKLY: 'أسبوعي',
  MONTHLY: 'شهري',
  CUSTOM: 'مخصص',
};

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  PENDING: 'بانتظار التنفيذ',
  RUNNING: 'قيد التنفيذ',
  SUCCEEDED: 'مكتمل',
  FAILED: 'فاشل',
};

/** النطاقات الزمنية الجاهزة في الفلاتر */
export const DATE_RANGES = [
  { value: 'today', label: 'اليوم', days: 1 },
  { value: '7d', label: 'آخر 7 أيام', days: 7 },
  { value: '30d', label: 'آخر 30 يوماً', days: 30 },
  { value: '90d', label: 'آخر 90 يوماً', days: 90 },
  { value: 'custom', label: 'مخصص', days: 0 },
] as const;

export type DateRangeValue = (typeof DATE_RANGES)[number]['value'];

/** اللغات الشائعة في المحتوى المرصود */
export const LANGUAGE_LABELS: Record<string, string> = {
  ar: 'العربية',
  en: 'الإنجليزية',
  fr: 'الفرنسية',
  tr: 'التركية',
  fa: 'الفارسية',
  und: 'غير محددة',
};

export function languageLabel(code: string | null | undefined): string {
  if (!code) return 'غير محددة';
  return LANGUAGE_LABELS[code] ?? code;
}

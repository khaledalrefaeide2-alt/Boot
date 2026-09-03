import 'server-only';
import { headers } from 'next/headers';
import { prisma } from '@/lib/db';
import type { Role } from '@/generated/prisma';

/** الأفعال الحساسة التي تُسجَّل في سجل التدقيق */
export const AUDIT_ACTIONS = {
  LOGIN_SUCCESS: 'auth.login.success',
  LOGIN_FAILED: 'auth.login.failed',
  LOGIN_BLOCKED: 'auth.login.blocked',
  LOGOUT: 'auth.logout',
  PASSWORD_CHANGED: 'auth.password.changed',
  PASSWORD_RESET_REQUESTED: 'auth.password.reset_requested',
  PASSWORD_RESET_COMPLETED: 'auth.password.reset_completed',

  USER_CREATED: 'user.created',
  USER_UPDATED: 'user.updated',
  USER_APPROVED: 'user.approved',
  USER_DISABLED: 'user.disabled',
  USER_ENABLED: 'user.enabled',
  USER_ROLE_CHANGED: 'user.role_changed',
  USER_PASSWORD_RESET_BY_ADMIN: 'user.password_reset_by_admin',

  PLATFORM_CREATED: 'platform.created',
  PLATFORM_UPDATED: 'platform.updated',
  PLATFORM_DELETED: 'platform.deleted',

  ACCOUNT_CREATED: 'account.created',
  ACCOUNT_UPDATED: 'account.updated',
  ACCOUNT_DELETED: 'account.deleted',

  EXTRACTION_STARTED: 'extraction.started',
  EXTRACTION_CANCELLED: 'extraction.cancelled',
  EXTRACTION_COMPLETED: 'extraction.completed',
  EXTRACTION_FAILED: 'extraction.failed',

  POST_UPDATED: 'post.updated',
  POST_HIDDEN: 'post.hidden',
  POST_RESTORED: 'post.restored',
  POST_DELETED: 'post.deleted',

  TAXONOMY_CREATED: 'taxonomy.created',
  TAXONOMY_UPDATED: 'taxonomy.updated',
  TAXONOMY_DELETED: 'taxonomy.deleted',

  REPORT_EXPORTED: 'report.exported',
  TEMPLATE_CREATED: 'template.created',
  TEMPLATE_UPDATED: 'template.updated',
  TEMPLATE_DELETED: 'template.deleted',

  SETTINGS_UPDATED: 'settings.updated',
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

/** تسميات عربية للأفعال — تُستخدم في صفحة السجلات */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  'auth.login.success': 'تسجيل دخول ناجح',
  'auth.login.failed': 'محاولة دخول فاشلة',
  'auth.login.blocked': 'حجب محاولة دخول',
  'auth.logout': 'تسجيل خروج',
  'auth.password.changed': 'تغيير كلمة المرور',
  'auth.password.reset_requested': 'طلب استعادة كلمة المرور',
  'auth.password.reset_completed': 'إتمام استعادة كلمة المرور',
  'user.created': 'إنشاء مستخدم',
  'user.updated': 'تعديل مستخدم',
  'user.approved': 'الموافقة على مستخدم',
  'user.disabled': 'تعطيل مستخدم',
  'user.enabled': 'تفعيل مستخدم',
  'user.role_changed': 'تغيير دور مستخدم',
  'user.password_reset_by_admin': 'إعادة تعيين كلمة مرور من الإدارة',
  'platform.created': 'إضافة منصة',
  'platform.updated': 'تعديل منصة',
  'platform.deleted': 'حذف منصة',
  'account.created': 'إضافة حساب',
  'account.updated': 'تعديل حساب',
  'account.deleted': 'حذف حساب',
  'extraction.started': 'بدء عملية استخراج',
  'extraction.cancelled': 'إلغاء عملية استخراج',
  'extraction.completed': 'اكتمال عملية استخراج',
  'extraction.failed': 'فشل عملية استخراج',
  'post.updated': 'تعديل منشور',
  'post.hidden': 'إخفاء منشور',
  'post.restored': 'استعادة منشور',
  'post.deleted': 'حذف منشور',
  'taxonomy.created': 'إضافة تصنيف أو كلمة',
  'taxonomy.updated': 'تعديل تصنيف أو كلمة',
  'taxonomy.deleted': 'حذف تصنيف أو كلمة',
  'report.exported': 'تصدير تقرير',
  'template.created': 'إنشاء قالب',
  'template.updated': 'تعديل قالب',
  'template.deleted': 'حذف قالب',
  'settings.updated': 'تعديل الإعدادات',
};

export interface AuditActor {
  id?: string | null;
  email?: string | null;
  role?: Role | null;
}

export interface AuditEntry {
  action: AuditAction | string;
  entityType: string;
  entityId?: string | null;
  summary?: string | null;
  metadata?: Record<string, unknown> | null;
}

/** استخراج عنوان الطلب ومعرّف المتصفح من ترويسات الطلب */
export async function requestMeta(): Promise<{ ipAddress: string | null; userAgent: string | null }> {
  try {
    const h = await headers();
    const forwarded = h.get('x-forwarded-for');
    const ipAddress = forwarded?.split(',')[0]?.trim() || h.get('x-real-ip') || null;
    return { ipAddress, userAgent: h.get('user-agent')?.slice(0, 500) ?? null };
  } catch {
    return { ipAddress: null, userAgent: null };
  }
}

/**
 * تسجيل عملية حساسة. لا يُفشل العملية الأصلية أبداً إذا تعذّر التسجيل.
 */
export async function audit(actor: AuditActor | null, entry: AuditEntry): Promise<void> {
  try {
    const meta = await requestMeta();
    await prisma.auditLog.create({
      data: {
        userId: actor?.id ?? null,
        actorEmail: actor?.email ?? null,
        actorRole: actor?.role ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        summary: entry.summary ?? null,
        metadata: (entry.metadata ?? undefined) as never,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      },
    });
  } catch (error) {
    console.error('[audit] تعذّر تسجيل العملية:', error);
  }
}

/** تسجيل من خارج سياق الطلب (العامل الخلفي) */
export async function auditSystem(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorEmail: 'system',
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        summary: entry.summary ?? null,
        metadata: (entry.metadata ?? undefined) as never,
      },
    });
  } catch (error) {
    console.error('[audit] تعذّر تسجيل عملية النظام:', error);
  }
}

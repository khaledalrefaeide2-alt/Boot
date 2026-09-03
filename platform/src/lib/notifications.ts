import 'server-only';
import { prisma } from '@/lib/db';
import type { NotificationSeverity, NotificationType, Role } from '@/generated/prisma';

export interface NotificationInput {
  type: NotificationType;
  title: string;
  body?: string | null;
  severity?: NotificationSeverity;
  link?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  /** موجّه لمستخدم بعينه */
  userId?: string | null;
  /** أو موجّه لكل أصحاب دور معيّن */
  role?: Role | null;
}

/**
 * إنشاء تنبيه داخل الموقع.
 * لا توجد تنبيهات خارجية (بريد/واتساب/تيليجرام) في النسخة الأولى.
 * لا تُفشل هذه الدالة العملية الأصلية أبداً.
 */
export async function notify(input: NotificationInput): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        type: input.type,
        title: input.title.slice(0, 300),
        body: input.body?.slice(0, 2000) ?? null,
        severity: input.severity ?? 'INFO',
        link: input.link ?? null,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        userId: input.userId ?? null,
        role: input.role ?? null,
      },
    });
  } catch (error) {
    console.error('[notifications] تعذّر إنشاء التنبيه:', error);
  }
}

/** تنبيه موجّه للمشرفين والمدراء والمالك */
export async function notifyOperators(input: Omit<NotificationInput, 'userId' | 'role'>): Promise<void> {
  await Promise.all([
    notify({ ...input, role: 'SUPERVISOR' }),
    notify({ ...input, role: 'ADMIN' }),
    notify({ ...input, role: 'OWNER' }),
  ]);
}

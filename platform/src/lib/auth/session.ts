import 'server-only';
import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { timingSafeEqual } from 'node:crypto';
import { prisma } from '@/lib/db';
import { env, isProduction } from '@/lib/env';
import { generateToken, hashToken } from './password';
import { effectivePermissions, type Permission } from './rbac';
import type { AccountAccess, Role, UserStatus } from '@/generated/prisma';

export const SESSION_COOKIE = 'mm_session';
export const CSRF_COOKIE = 'mm_csrf';
export const CSRF_HEADER = 'x-csrf-token';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  status: UserStatus;
  /// نطاق البيانات — يُقرأ في كل استعلام فيُحمل مع الجلسة لا باستعلام إضافي
  accountAccess: AccountAccess;
  jobTitle: string | null;
  avatarUrl: string | null;
  permissions: Permission[];
  mustChangePassword: boolean;
  sessionId: string;
}

function sessionMaxAgeSeconds(): number {
  return env.SESSION_TTL_DAYS * 24 * 60 * 60;
}

/** إنشاء جلسة جديدة وتثبيت كوكيز آمنة */
export async function createSession(
  userId: string,
  meta: { ipAddress?: string | null; userAgent?: string | null } = {},
): Promise<void> {
  const token = generateToken(32);
  const csrfSecret = generateToken(24);
  const expiresAt = new Date(Date.now() + sessionMaxAgeSeconds() * 1000);

  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      csrfSecret,
      expiresAt,
      ipAddress: meta.ipAddress ?? null,
      userAgent: meta.userAgent?.slice(0, 500) ?? null,
    },
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: sessionMaxAgeSeconds(),
  });
  // رمز CSRF مقروء من الواجهة عمداً (نمط الإرسال المزدوج)
  cookieStore.set(CSRF_COOKIE, csrfSecret, {
    httpOnly: false,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: sessionMaxAgeSeconds(),
  });
}

/** إنهاء الجلسة الحالية */
export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session
      .updateMany({
        where: { tokenHash: hashToken(token), revokedAt: null },
        data: { revokedAt: new Date() },
      })
      .catch(() => undefined);
  }
  cookieStore.delete(SESSION_COOKIE);
  cookieStore.delete(CSRF_COOKIE);
}

/** إبطال كل جلسات مستخدم — يُستدعى عند التعطيل أو تغيير كلمة المرور */
export async function revokeAllSessions(userId: string): Promise<void> {
  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/**
 * قراءة الجلسة الحالية والتحقق من صلاحيتها وحالة المستخدم.
 * مُخزّنة على مستوى الطلب الواحد عبر cache() لتفادي استعلامات مكررة.
 */
export const getSession = cache(async (): Promise<SessionUser | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      expiresAt: true,
      revokedAt: true,
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          status: true,
          accountAccess: true,
          jobTitle: true,
          avatarUrl: true,
          permissions: true,
          mustChangePassword: true,
        },
      },
    },
  });

  if (!session || session.revokedAt || session.expiresAt.getTime() < Date.now()) return null;
  // المستخدم المعطل أو المعلّق لا يملك جلسة فعّالة مهما كان الكوكي
  if (session.user.status !== 'ACTIVE') return null;

  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role: session.user.role,
    status: session.user.status,
    accountAccess: session.user.accountAccess,
    jobTitle: session.user.jobTitle,
    avatarUrl: session.user.avatarUrl,
    permissions: effectivePermissions(session.user),
    mustChangePassword: session.user.mustChangePassword,
    sessionId: session.id,
  };
});

/** تحديث آخر ظهور للجلسة — لا يُنتظر ولا يُفشل الطلب */
export function touchSession(sessionId: string): void {
  void prisma.session
    .update({ where: { id: sessionId }, data: { lastSeenAt: new Date() } })
    .catch(() => undefined);
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** العناوين الموثوقة: عنوان التطبيق، وما أُضيف صراحةً في ملف البيئة */
function trustedOrigins(): string[] {
  const list = [env.APP_URL, ...env.APP_ALLOWED_ORIGINS.split(',')];
  const origins: string[] = [];
  for (const entry of list) {
    const value = entry.trim();
    if (!value) continue;
    try {
      origins.push(new URL(value).origin);
    } catch {
      // عنوان غير صالح في الإعدادات يُتجاهل ولا يُسقط الفحص كله
    }
  }
  return origins;
}

function isTrustedOrigin(origin: string): boolean {
  try {
    return trustedOrigins().includes(new URL(origin).origin);
  } catch {
    return false;
  }
}

/**
 * التحقق من CSRF للطلبات المغيِّرة: فحص المصدر + رمز الإرسال المزدوج.
 * يُعيد رسالة الخطأ عند الفشل، أو null عند النجاح.
 */
export async function verifyCsrf(): Promise<string | null> {
  const headerStore = await headers();
  const cookieStore = await cookies();

  const origin = headerStore.get('origin');
  if (origin && !isTrustedOrigin(origin)) return 'مصدر الطلب غير موثوق';

  const cookieToken = cookieStore.get(CSRF_COOKIE)?.value;
  const headerToken = headerStore.get(CSRF_HEADER);
  if (!cookieToken || !headerToken) return 'رمز الحماية مفقود';
  if (!safeEqual(cookieToken, headerToken)) return 'رمز الحماية غير صالح';

  return null;
}

/** تنظيف الجلسات المنتهية — يُستدعى دورياً من العامل الخلفي */
export async function purgeExpiredSessions(): Promise<number> {
  const result = await prisma.session.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return result.count;
}

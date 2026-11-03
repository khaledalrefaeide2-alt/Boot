import 'server-only';
import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { timingSafeEqual } from 'node:crypto';
import { prisma } from '@/lib/db';
import { env, isProduction } from '@/lib/env';
import {
  SESSION_COOKIE,
  CSRF_COOKIE,
  LEGACY_COOKIES,
  PAGE_PATH_HEADER,
  PASSWORD_CHANGE_PAGE,
  cookieDeletion,
} from './cookies';
import { generateToken, hashToken } from './password';
import { effectivePermissions, type Permission } from './rbac';
import type { AccountAccess, Role, UserStatus } from '@/generated/prisma';

/*
 * الأسماء تُعاد من `cookies.ts` لا تُعرَّف هنا: الوسيط يحتاجها وهو لا
 * يستطيع قراءة ملفّ فيه `server-only`، فمصدرها وحدةٌ محايدة بينهما.
 */
export { SESSION_COOKIE, CSRF_COOKIE, SESSION_EXPIRED_PARAM } from './cookies';
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
  // كوكيز ما قبل البادئة لا يقرؤها أحد بعد اليوم — فلا تبقى في المتصفّح
  for (const legacy of LEGACY_COOKIES) cookieStore.delete(cookieDeletion(legacy));
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
  cookieStore.delete(cookieDeletion(SESSION_COOKIE));
  cookieStore.delete(cookieDeletion(CSRF_COOKIE));
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

  /*
   * صاحب كلمة المرور المؤقتة لا يرى صفحةً غير صفحة تغييرها.
   *
   * المسار يكتبه الوسيط للصفحات وحدها؛ ومسارات API لا تحمله، وتُمنع
   * هناك في `requireAuth`. والفحص هنا لا في التخطيط لأنّ التخطيط لا يُعاد
   * تنفيذه حين يتنقّل المستخدم داخل الموقع — والصفحة تُعاد دائماً.
   */
  if (session.user.mustChangePassword) {
    const pagePath = (await headers()).get(PAGE_PATH_HEADER);
    if (pagePath && pagePath !== PASSWORD_CHANGE_PAGE) {
      /*
       * استيرادٌ عند الحاجة: `next/navigation` يجرّ سياقات React الخاصّة
       * بالواجهة، والعامل الخلفي وفحوص `scripts/` تستورد هذا الملف خارج
       * Next — فيسقط تحميلها كلّها لو استُورد في رأسه.
       */
      const { redirect } = await import('next/navigation');
      redirect(`${PASSWORD_CHANGE_PAGE}?change-password=1`);
    }
  }

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
 * فحصُ المصدر وحده — لما لا جلسة قبله.
 *
 * ★ الدخول نفسه يحتاج حماية من التزوير، وإن بدا ذلك غريباً.
 *
 *   صفحةٌ خبيثة تستطيع أن تُرسل نموذج دخولٍ إلى منصّتنا **بحساب
 *   المهاجم**، فيصير الموظّف داخلاً بحسابٍ ليس حسابه وهو لا يدري. فكلّ
 *   ما يبحث عنه ويحفظه ويصدّره بعدها يقع في حسابٍ يملكه الخصم ويقرؤه
 *   متى شاء.
 *
 *   ورمزُ الإرسال المزدوج لا يُستعمل هنا — لا جلسة بعدُ فلا رمز.
 *   وفحصُ المصدر يكفي: المتصفّحات ترسل `Origin` في كلّ طلبٍ مغيّر،
 *   وصفحةُ الخصم لا تستطيع تزويرها.
 *
 *   والطلب بلا `Origin` يُقبل: عملاءُ غير المتصفّحات لا يرسلونها،
 *   وردُّهم يكسر أدوات المشغّل. والهجوم المقصود هنا متصفّحيّ، ويرسلها.
 */
export async function verifyRequestOrigin(): Promise<string | null> {
  const origin = (await headers()).get('origin');
  if (origin && !isTrustedOrigin(origin)) return 'مصدر الطلب غير موثوق';
  return null;
}

/**
 * سرّ CSRF المخزَّن مع الجلسة الحالية — أو null إن لم تكن جلسةٌ صالحة.
 *
 * لا يُحمل في `SessionUser`: ذاك يُمرَّر إلى مكوّنات الواجهة، وهذا لا
 * يحتاجه إلا الفحص هنا.
 */
const sessionCsrfSecret = cache(async (): Promise<string | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { csrfSecret: true, revokedAt: true, expiresAt: true },
  });
  if (!session || session.revokedAt || session.expiresAt.getTime() < Date.now()) return null;
  return session.csrfSecret;
});

/**
 * التحقق من CSRF للطلبات المغيِّرة: فحص المصدر + رمز الإرسال المزدوج
 * مربوطاً بالجلسة.
 *
 * ★ كان الرمز يُقارَن بالكوكي وحدها، والجلسة تحفظ سرّها ولا يسألها أحد.
 *
 *   والإرسال المزدوج بلا ربطٍ يصمد ما دام الخصم لا يكتب كوكيز على نطاقنا.
 *   وعلى نطاقٍ مشترك مثل `hstgr.cloud` يستطيع جارٌ أن يكتبها. فالمقارنة
 *   الآن بالسرّ المخزَّن مع الجلسة نفسها في القاعدة: رمزٌ لم تُصدره هذه
 *   الجلسة لا يمرّ، أيّاً كان ما في الكوكي.
 *
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

  const expected = await sessionCsrfSecret();
  if (!expected || !safeEqual(headerToken, expected)) return 'رمز الحماية غير صالح';

  return null;
}

/** تنظيف الجلسات المنتهية — يُستدعى دورياً من العامل الخلفي */
export async function purgeExpiredSessions(): Promise<number> {
  const result = await prisma.session.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return result.count;
}

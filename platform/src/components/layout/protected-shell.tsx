import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { SESSION_EXPIRED_PARAM } from '@/lib/auth/cookies';
import { can, PERMISSIONS } from '@/lib/auth/rbac';
import { getAppName } from '@/lib/settings';
import { ADMIN_NAV, VIEWER_NAV, filterNav } from '@/lib/domain/navigation';
import { AppShell } from './app-shell';

/** عدد التنبيهات غير المقروءة الموجّهة للمستخدم أو لدوره */
async function unreadNotificationCount(userId: string, role: string): Promise<number> {
  try {
    return await prisma.notification.count({
      where: {
        isRead: false,
        OR: [{ userId }, { role: role as never }],
      },
    });
  } catch {
    return 0;
  }
}

/**
 * غلاف كل الصفحات المحمية — يتحقق من الجلسة والصلاحية قبل عرض أي شيء.
 * هذا هو الحدّ الأمني الفعلي، وليس الوسيط.
 */
export async function ProtectedShell({
  area,
  children,
}: {
  area: 'viewer' | 'admin';
  children: React.ReactNode;
}) {
  const user = await getSession();
  /*
   * العلامة ليست زينةً في الرابط: هي ما يمنع حلقة التحويل.
   *
   * الوسيط يرى الكوكي موجودةً فيُعيد كلّ قادمٍ من `/login` إلى `/`،
   * وهنا نعرف أنّها ميّتة — فنقولها له صراحةً، فيمسحها ويفتح الصفحة
   * بدل أن يردّنا. وبدونها يدور الاثنان إلى أن يقف المتصفّح.
   */
  if (!user) redirect(`/login?${SESSION_EXPIRED_PARAM}=1`);

  if (area === 'admin' && !can(user, PERMISSIONS.ADMIN_ACCESS)) {
    redirect('/');
  }

  const [appName, unreadCount] = await Promise.all([
    getAppName(),
    unreadNotificationCount(user.id, user.role),
  ]);

  const sections = filterNav(area === 'admin' ? ADMIN_NAV : VIEWER_NAV, user.permissions);

  return (
    <AppShell
      user={{ name: user.name, email: user.email, role: user.role }}
      sections={sections}
      appName={appName}
      unreadCount={unreadCount}
      canAccessAdmin={can(user, PERMISSIONS.ADMIN_ACCESS)}
      isAdminArea={area === 'admin'}
      permissions={user.permissions}
    >
      {children}
    </AppShell>
  );
}

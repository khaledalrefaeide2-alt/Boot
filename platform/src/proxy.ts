import { NextResponse, type NextRequest } from 'next/server';

/**
 * الوسيط (proxy) يوجّه الزوار بسرعة فقط — التحقق الحقيقي من الجلسة والصلاحيات
 * يتم في مكوّنات الخادم وفي كل مسار API. لا يُعتمد عليه كحدّ أمني.
 */
const PUBLIC_PATHS = ['/login', '/forgot-password', '/reset-password'];

const SESSION_COOKIE = 'mm_session';

export default function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSessionCookie = Boolean(request.cookies.get(SESSION_COOKIE)?.value);
  const isPublic = PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));

  if (!hasSessionCookie && !isPublic) {
    const loginUrl = new URL('/login', request.url);
    if (pathname !== '/') loginUrl.searchParams.set('next', `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  if (hasSessionCookie && isPublic) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * كل المسارات عدا:
     * - مسارات API (تتحقق بنفسها وترجع 401 بدل التحويل)
     * - ملفات Next الداخلية والأصول الثابتة
     */
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp|woff2?)$).*)',
  ],
};

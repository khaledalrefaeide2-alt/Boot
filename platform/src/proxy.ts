import { NextResponse, type NextRequest } from 'next/server';
import {
  CSRF_COOKIE,
  SESSION_COOKIE,
  SESSION_EXPIRED_PARAM,
  PAGE_PATH_HEADER,
  NONCE_HEADER,
  cookieDeletion,
} from '@/lib/auth/cookies';
import { contentSecurityPolicy, generateNonce } from '@/lib/security/csp';

/**
 * الوسيط (proxy) يوجّه الزوار بسرعة فقط — التحقق الحقيقي من الجلسة والصلاحيات
 * يتم في مكوّنات الخادم وفي كل مسار API. لا يُعتمد عليه كحدّ أمني.
 */
const PUBLIC_PATHS = ['/login', '/forgot-password', '/reset-password'];

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
    /*
     * ★ الكوكي الميّتة لا تُعيد صاحبها إلى الداخل.
     *
     *   الوسيط يعرف أنّ الكوكي موجودة ولا يعرف أنّها صالحة — لا قاعدة
     *   بيانات هنا. والخادم يعرف: `getSession()` يردّ null للجلسة
     *   المنتهية أو المُبطَلة أو لمستخدمٍ عُطّل.
     *
     *   فكانا يتدافعان إلى الأبد: الخادم يُحوّل إلى `/login` لأن الجلسة
     *   ميّتة، والوسيط يُعيده إلى `/` لأن الكوكي موجودة، والخادم يُحوّل…
     *   حتى يقف المتصفّح عند ERR_TOO_MANY_REDIRECTS — والموقع كله
     *   يسقط في وجه كلّ من انتهت جلسته، لا صفحةٌ منه.
     *
     *   والعلامة هي قول الخادم: «سألتُ القاعدة، وهذه ميّتة». فتُمسح
     *   الكوكيان وتُعرض صفحة الدخول — وهو ما كان يجب أن يراه من البداية.
     */
    if (request.nextUrl.searchParams.get(SESSION_EXPIRED_PARAM) === '1') {
      const response = renderPage(request, pathname);
      response.cookies.delete(cookieDeletion(SESSION_COOKIE));
      response.cookies.delete(cookieDeletion(CSRF_COOKIE));
      return response;
    }
    return NextResponse.redirect(new URL('/', request.url));
  }

  return renderPage(request, pathname);
}

/**
 * متابعة الطلب إلى الصفحة — بمسارها ورمز سياستها.
 *
 * كلّ صفحةٍ تمرّ من هنا لا من `NextResponse.next()` مباشرة: صفحةٌ بلا رمز
 * تُرفض نصوصها كلّها تحت السياسة الجديدة، فتظهر بيضاء بلا تفاعل.
 *
 * - المسار لـ`getSession` (كلمة المرور المؤقتة) — يُكتب فوق ما أرسله العميل.
 * - والسياسة تُكتب في **الطلب** ليقرأ Next الرمز منها ويضعه على وسومه،
 *   وفي **الردّ** ليفرضها المتصفّح. و`x-nonce` للتخطيط الجذري، يمرّره
 *   إلى مكتبة السمة التي تكتب نصّها السطري.
 */
function renderPage(request: NextRequest, pathname: string): NextResponse {
  const nonce = generateNonce();
  const policy = contentSecurityPolicy(nonce, { dev: process.env.NODE_ENV === 'development' });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(PAGE_PATH_HEADER, pathname);
  requestHeaders.set(NONCE_HEADER, nonce);
  requestHeaders.set('content-security-policy', policy);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', policy);
  return response;
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

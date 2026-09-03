import 'server-only';
import { NextResponse } from 'next/server';
import { ZodError, type ZodType } from 'zod';
import { getSession, verifyCsrf, type SessionUser } from '@/lib/auth/session';
import { can, type Permission } from '@/lib/auth/rbac';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { requestMeta } from '@/lib/audit';

/** خطأ معالَج بعناية — يحمل رمز حالة ورسالة عربية آمنة للعرض */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const errors = {
  unauthorized: (msg = 'يجب تسجيل الدخول للمتابعة') => new ApiError(401, msg),
  forbidden: (msg = 'لا تملك صلاحية تنفيذ هذه العملية') => new ApiError(403, msg),
  notFound: (msg = 'العنصر المطلوب غير موجود') => new ApiError(404, msg),
  badRequest: (msg = 'البيانات المرسلة غير صالحة', details?: unknown) =>
    new ApiError(400, msg, details),
  conflict: (msg = 'يوجد تعارض مع بيانات موجودة مسبقاً') => new ApiError(409, msg),
  tooMany: (msg = 'محاولات كثيرة جداً، حاول لاحقاً') => new ApiError(429, msg),
  server: (msg = 'حدث خطأ غير متوقع في الخادم') => new ApiError(500, msg),
};

export function jsonOk<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ ok: true, data }, init);
}

export function jsonError(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { ok: false, error: error.message, details: error.details ?? null },
      { status: error.status },
    );
  }
  if (error instanceof ZodError) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of error.issues) {
      const path = issue.path.join('.') || '_';
      if (!fieldErrors[path]) fieldErrors[path] = issue.message;
    }
    return NextResponse.json(
      { ok: false, error: 'البيانات المرسلة غير صالحة', details: fieldErrors },
      { status: 400 },
    );
  }
  console.error('[api] خطأ غير متوقع:', error);
  return NextResponse.json(
    { ok: false, error: 'حدث خطأ غير متوقع في الخادم' },
    { status: 500 },
  );
}

/** يتطلب جلسة فعّالة */
export async function requireAuth(): Promise<SessionUser> {
  const user = await getSession();
  if (!user) throw errors.unauthorized();
  return user;
}

/** يتطلب جلسة فعّالة مع صلاحية محددة */
export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const user = await requireAuth();
  if (!can(user, permission)) throw errors.forbidden();
  return user;
}

/** يتطلب أي صلاحية من قائمة */
export async function requireAnyPermission(permissions: Permission[]): Promise<SessionUser> {
  const user = await requireAuth();
  if (!permissions.some((p) => can(user, p))) throw errors.forbidden();
  return user;
}

/** التحقق من CSRF لكل طلب مغيّر — يُستدعى قبل أي كتابة */
export async function requireCsrf(): Promise<void> {
  const problem = await verifyCsrf();
  if (problem) throw new ApiError(403, problem);
}

/** حماية معدل عامة للعمليات المغيّرة، مربوطة بالمستخدم */
export async function guardMutationRate(userId: string): Promise<void> {
  const result = await rateLimit(
    `mutation:${userId}`,
    RATE_LIMITS.MUTATION.limit,
    RATE_LIMITS.MUTATION.window,
  );
  if (!result.allowed) throw errors.tooMany();
}

/** قراءة جسم الطلب والتحقق منه عبر Zod */
export async function parseBody<T>(request: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw errors.badRequest('تعذّر قراءة بيانات الطلب');
  }
  return schema.parse(raw);
}

/** قراءة معاملات البحث من الرابط والتحقق منها */
export function parseQuery<T>(request: Request, schema: ZodType<T>): T {
  const url = new URL(request.url);
  const raw: Record<string, string | string[]> = {};
  for (const key of new Set(url.searchParams.keys())) {
    const values = url.searchParams.getAll(key);
    raw[key] = values.length > 1 ? values : (values[0] as string);
  }
  return schema.parse(raw);
}

export { requestMeta };

'use client';

/** قراءة رمز الحماية من الكوكي — نمط الإرسال المزدوج ضد CSRF */
function readCsrfToken(): string {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.match(/(?:^|;\s*)mm_csrf=([^;]*)/);
  return match?.[1] ? decodeURIComponent(match[1]) : '';
}

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: Record<string, string> | null,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
  details?: Record<string, string> | null;
}

async function request<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') headers['x-csrf-token'] = readCsrfToken();

  const response = await fetch(path, {
    method,
    headers,
    credentials: 'same-origin',
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  // انتهاء الجلسة أثناء الاستخدام — نعيد المستخدم إلى صفحة الدخول
  if (response.status === 401 && typeof window !== 'undefined') {
    const isAuthPage = window.location.pathname.startsWith('/login');
    if (!isAuthPage) {
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    }
  }

  let payload: ApiResponse<T>;
  try {
    payload = (await response.json()) as ApiResponse<T>;
  } catch {
    throw new ApiClientError(response.status, 'تعذّر قراءة رد الخادم');
  }

  if (!response.ok || !payload.ok) {
    throw new ApiClientError(
      response.status,
      payload.error ?? 'حدث خطأ غير متوقع',
      payload.details ?? null,
    );
  }

  return payload.data as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  delete: <T>(path: string, body?: unknown) => request<T>('DELETE', path, body),
};

/** بناء رابط مع معاملات بحث، متجاهلاً الفارغ منها */
export function buildQuery(base: string, params: Record<string, unknown>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '' ) continue;
    if (Array.isArray(value)) {
      for (const item of value) if (item !== '' && item != null) search.append(key, String(item));
    } else {
      search.set(key, String(value));
    }
  }
  const queryString = search.toString();
  return queryString ? `${base}?${queryString}` : base;
}

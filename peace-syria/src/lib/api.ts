import type {
  AppStatus,
  Guideline,
  MeterResult,
  ModerationStatus,
  Post,
  Report,
  Rumor,
  RumorVerification,
  Story,
} from '../../shared/types';

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: init?.body ? { 'Content-Type': 'application/json', ...init?.headers } : init?.headers,
    });
  } catch {
    throw new ApiError('تعذّر الاتصال بالخادم. تحقّق من اتصالك بالإنترنت وحاول مجدداً.', 0);
  }

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const payload = isJson ? await response.json().catch(() => null) : null;

  if (!response.ok) {
    const message =
      (payload as { error?: string } | null)?.error ?? `تعذّر إتمام الطلب (رمز الخطأ ${response.status}).`;
    throw new ApiError(message, response.status);
  }

  return payload as T;
}

const post = <T>(url: string, body: unknown) =>
  request<T>(url, { method: 'POST', body: JSON.stringify(body) });

const patch = <T>(url: string, body: unknown) =>
  request<T>(url, { method: 'PATCH', body: JSON.stringify(body) });

const qs = (params: Record<string, string | undefined>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value && value !== 'all') search.set(key, value);
  }
  const str = search.toString();
  return str ? `?${str}` : '';
};

export const api = {
  getStatus: () => request<AppStatus>('/api/status'),
  setCrisisMode: (crisisMode: boolean) => patch<AppStatus>('/api/status', { crisisMode }),

  analyzeText: (text: string) => post<MeterResult>('/api/meter/analyze', { text }),

  getPosts: (params: { status?: string; category?: string; q?: string } = {}) =>
    request<{ posts: Post[]; categories: string[] }>(`/api/posts${qs(params)}`),
  generatePosts: (count = 3, focus?: string) =>
    post<{ posts: Post[]; status: AppStatus }>('/api/posts/generate', { count, focus }),
  setPostStatus: (id: string, status: ModerationStatus) =>
    patch<{ post: Post; status: AppStatus }>(`/api/posts/${id}`, { status }),

  getRumors: (params: { q?: string; category?: string } = {}) =>
    request<{ rumors: Rumor[]; categories: string[] }>(`/api/rumors${qs(params)}`),
  verifyRumor: (text: string) => post<RumorVerification>('/api/rumors/verify', { text }),
  submitRumor: (body: { claim: string; category?: string; source?: string }) =>
    post<{ rumor: Rumor }>('/api/rumors', body),

  getStories: (status: 'approved' | 'pending' | 'rejected' | 'all' = 'approved') =>
    request<{ stories: Story[] }>(`/api/stories?status=${status}`),
  submitStory: (body: { name: string; location: string; title: string; content: string }) =>
    post<{ story: Story }>('/api/stories', body),
  setStoryStatus: (id: string, status: ModerationStatus) =>
    patch<{ story: Story; status: AppStatus }>(`/api/stories/${id}`, { status }),

  getGuidelines: () => request<{ guidelines: Guideline[]; categories: string[] }>('/api/guidelines'),

  submitReport: (body: {
    url: string;
    platform: string;
    type: string;
    description: string;
    attachmentName?: string | null;
    contactEmail?: string | null;
  }) => post<{ report: Report }>('/api/reports', body),
};

export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'حدث خطأ غير متوقع، حاول مرة أخرى.';

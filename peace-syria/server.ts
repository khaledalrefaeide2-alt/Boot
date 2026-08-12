import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import express, { type NextFunction, type Request, type Response } from 'express';

import { AiError, MODEL_NAME, generateJson, isAiConfigured, schemas } from './server/gemini.js';
import { guidelines, seedPosts, seedRumors, seedStories } from './server/seed.js';
import type {
  AppStatus,
  MeterResult,
  ModerationStatus,
  Post,
  Report,
  Rumor,
  RumorVerification,
  Story,
} from './shared/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProduction = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT ?? 5173);

/* ------------------------------------------------------------------ */
/* In-memory store (MVP — resets on restart)                           */
/* ------------------------------------------------------------------ */

let posts: Post[] = [...seedPosts];
let stories: Story[] = [...seedStories];
let rumors: Rumor[] = [...seedRumors];
let reports: Report[] = [];
let crisisMode = false;
let crisisUpdatedAt = new Date().toISOString();

const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

class HttpError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

function requireText(value: unknown, field: string, { min = 1, max = 5000 } = {}): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length < min) {
    throw new HttpError(`الحقل "${field}" مطلوب ويجب ألا يقل عن ${min} حرفاً.`);
  }
  if (text.length > max) {
    throw new HttpError(`الحقل "${field}" أطول من الحد المسموح (${max} حرفاً).`);
  }
  return text;
}

function clampScore(value: unknown, fallback = 50): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function parseModeration(value: unknown): ModerationStatus {
  if (value === 'approved' || value === 'rejected' || value === 'pending') return value;
  throw new HttpError('حالة المراجعة غير صالحة. القيم المسموحة: pending أو approved أو rejected.');
}

const normalize = (value: string) =>
  value
    .toLowerCase()
    .replace(/[ً-ٰٟ]/g, '') // strip Arabic diacritics
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه');

const matches = (haystack: string[], needle: string) => {
  const q = normalize(needle);
  return haystack.some((field) => normalize(field).includes(q));
};

function buildStatus(): AppStatus {
  return {
    crisisMode,
    updatedAt: crisisUpdatedAt,
    aiConfigured: isAiConfigured(),
    model: MODEL_NAME,
    counts: {
      posts: posts.length,
      approvedPosts: posts.filter((p) => p.status === 'approved').length,
      pendingPosts: posts.filter((p) => p.status === 'pending').length,
      stories: stories.length,
      pendingStories: stories.filter((s) => s.status === 'pending').length,
      rumors: rumors.length,
      pendingRumors: rumors.filter((r) => r.moderation === 'pending').length,
      reports: reports.length,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Prompts                                                             */
/* ------------------------------------------------------------------ */

const PEACE_CONTEXT = `أنت مساعد لغوي متخصص في بناء السلام الرقمي في السياق السوري.
تعمل ضمن منصة "سلام في سوريا" التي تهدف إلى خفض التوتر ومكافحة خطاب الكراهية والشائعات.
التزم دائماً بما يلي:
- الحياد التام تجاه جميع الأطراف والمكوّنات والمناطق، ولا تنحاز لأي جهة سياسية أو طائفية.
- لا تذكر أسماء أشخاص أو جهات بعينها بصيغة اتهامية، ولا تصدر أحكاماً على الأفراد.
- ارفض التعميم على أي فئة أو طائفة أو منطقة أو قومية، وفرّق دائماً بين الفعل والفاعل والانتماء.
- استخدم لغة عربية فصحى مبسطة وواضحة يفهمها القارئ العادي.
- أعد الإجابة بصيغة JSON صالحة فقط ومطابقة للمخطط المطلوب دون أي نص إضافي.`;

const meterSystem = `${PEACE_CONTEXT}
مهمتك: تحليل نص يكتبه مستخدم قبل نشره على وسائل التواصل، وقياس مدى سلامته اللغوية.
معايير الدرجة (safetyScore):
- 85-100: لغة هادئة ومحترمة بلا تعميم أو تحريض.
- 60-84: مقبولة لكن فيها انفعال أو صياغة قد تُفهم خطأ.
- 30-59: لغة عدائية أو تعميم واضح على فئة.
- 0-29: تحريض مباشر أو خطاب كراهية أو تهديد.
حقل rewrittenText يجب أن يحافظ على قصد الكاتب ومطلبه المشروع، لكن بصياغة سلمية غير تحريضية،
وأن يكون جاهزاً للنشر كما هو. إذا كان النص سليماً أصلاً، حسّنه تحسيناً طفيفاً فقط.
حقل flaggedPhrases يحتوي فقط على عبارات مقتبسة حرفياً من النص الأصلي، ويكون فارغاً إن لم توجد.`;

const rumorSystem = `${PEACE_CONTEXT}
مهمتك: تقييم ادعاء أو شائعة منتشرة وتقديم تصحيح مسؤول.
لا تملك وصولاً إلى الإنترنت، لذلك اعتمد على التحليل المنهجي: مؤشرات الصياغة الانفعالية،
غياب المصدر، الطابع العاجل، عدم قابلية التحقق، والتناقض الداخلي.
إن لم تتوفر لديك معلومات كافية للحكم، اجعل status = "غير مؤكدة" واشرح في correction
سبب عدم إمكانية التأكيد وما الذي يحتاجه القارئ للتحقق بنفسه، دون اختلاق مصادر أو أرقام أو تواريخ.
credibilityScore يعبّر عن مدى مصداقية الادعاء: 0 يعني كاذب تماماً و100 يعني موثق بالكامل.
حقل advice خطوة عملية واحدة أو خطوتان للتحقق قبل إعادة النشر.`;

const postsSystem = `${PEACE_CONTEXT}
مهمتك: كتابة منشورات يومية قصيرة جاهزة للنشر على وسائل التواصل، تعزز التهدئة والتعايش والوعي الرقمي.
شروط المنشور:
- بين 40 و70 كلمة، بلغة دافئة وإنسانية بعيدة عن الوعظ والشعارات الجوفاء.
- يحتوي فكرة عملية واحدة يستطيع القارئ تطبيقها اليوم.
- لا يذكر أحداثاً أو أرقاماً أو تواريخ محددة قد تكون غير دقيقة، ولا ينسب أقوالاً لأشخاص حقيقيين.
- عناوين مختصرة لا تتجاوز ست كلمات، ووسوم بالعربية دون رمز #.
- تنوّع في التصنيفات وفي زوايا الطرح، ولا تكرر أفكار المنشورات المذكورة في الطلب.`;

/* ------------------------------------------------------------------ */
/* API routes                                                          */
/* ------------------------------------------------------------------ */

const api = express.Router();

/* ---- Status / crisis mode ---- */

api.get('/status', (_req, res) => {
  res.json(buildStatus());
});

api.patch('/status', (req, res) => {
  const { crisisMode: next } = req.body ?? {};
  if (typeof next !== 'boolean') {
    throw new HttpError('القيمة crisisMode يجب أن تكون true أو false.');
  }
  crisisMode = next;
  crisisUpdatedAt = new Date().toISOString();
  res.json(buildStatus());
});

/* ---- Peace meter ---- */

api.post('/meter/analyze', async (req, res) => {
  const text = requireText(req.body?.text, 'النص', { min: 10, max: 4000 });

  const result = await generateJson<MeterResult>({
    systemInstruction: meterSystem,
    schema: schemas.meter,
    temperature: 0.25,
    prompt: `حلّل النص التالي وأعد النتيجة بصيغة JSON:\n"""\n${text}\n"""`,
  });

  res.json({
    isCalm: Boolean(result.isCalm),
    hasGeneralization: Boolean(result.hasGeneralization),
    safetyScore: clampScore(result.safetyScore),
    analysis: String(result.analysis ?? '').trim(),
    rewrittenText: String(result.rewrittenText ?? '').trim(),
    flaggedPhrases: Array.isArray(result.flaggedPhrases) ? result.flaggedPhrases.slice(0, 8).map(String) : [],
    tone: result.tone ? String(result.tone) : undefined,
  } satisfies MeterResult);
});

/* ---- Posts ---- */

api.get('/posts', (req, res) => {
  const { status, category, q } = req.query as Record<string, string | undefined>;
  let result = [...posts];

  if (status && status !== 'all') result = result.filter((p) => p.status === status);
  if (category && category !== 'all') result = result.filter((p) => p.category === category);
  if (q?.trim()) result = result.filter((p) => matches([p.title, p.content, p.category, ...p.hashtags], q));

  result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json({
    posts: result,
    categories: [...new Set(posts.map((p) => p.category))],
  });
});

api.post('/posts/generate', async (req, res) => {
  const count = Math.max(1, Math.min(6, Number(req.body?.count) || 3));
  const focus = typeof req.body?.focus === 'string' ? req.body.focus.trim().slice(0, 120) : '';
  const recentTitles = posts.slice(0, 12).map((p) => p.title);

  const crisisLine = crisisMode
    ? 'المنصة في "وضع الأزمة" حالياً: ركّز على التهدئة الفورية، التحقق قبل النشر، وطمأنة الناس دون إنكار قلقهم.'
    : 'المنصة في الوضع الاعتيادي: ركّز على البناء طويل الأمد للتعايش والوعي الرقمي.';

  const generated = await generateJson<{ posts: Array<Omit<Post, 'id' | 'status' | 'source' | 'createdAt'>> }>({
    systemInstruction: postsSystem,
    schema: schemas.posts,
    temperature: 0.95,
    prompt: [
      `اكتب ${count} منشورات جديدة.`,
      crisisLine,
      focus ? `ركّز على الموضوع التالي: ${focus}.` : '',
      recentTitles.length ? `تجنّب تكرار هذه العناوين المنشورة سابقاً: ${recentTitles.join(' | ')}.` : '',
    ]
      .filter(Boolean)
      .join('\n'),
  });

  const created: Post[] = (generated.posts ?? []).slice(0, count).map((p) => ({
    id: uid('post'),
    title: String(p.title ?? '').trim() || 'منشور جديد',
    content: String(p.content ?? '').trim(),
    category: String(p.category ?? 'تهدئة').trim(),
    safetyScore: clampScore(p.safetyScore, 90),
    hashtags: Array.isArray(p.hashtags) ? p.hashtags.slice(0, 4).map((h) => String(h).replace(/^#/, '')) : [],
    status: 'pending',
    source: 'ai',
    createdAt: new Date().toISOString(),
  }));

  if (!created.length) {
    throw new AiError('لم يتم توليد أي منشور صالح، حاول مرة أخرى.');
  }

  posts = [...created, ...posts];
  res.status(201).json({ posts: created, status: buildStatus() });
});

api.patch('/posts/:id', (req, res) => {
  const status = parseModeration(req.body?.status);
  const post = posts.find((p) => p.id === req.params.id);
  if (!post) throw new HttpError('المنشور غير موجود.', 404);
  post.status = status;
  res.json({ post, status: buildStatus() });
});

/* ---- Rumors ---- */

api.get('/rumors', (req, res) => {
  const { q, category } = req.query as Record<string, string | undefined>;
  let result = rumors.filter((r) => r.moderation === 'approved');

  if (category && category !== 'all') result = result.filter((r) => r.category === category);
  if (q?.trim()) result = result.filter((r) => matches([r.claim, r.correction, r.category, r.status], q));

  result.sort((a, b) => b.verifiedAt.localeCompare(a.verifiedAt));
  res.json({
    rumors: result,
    categories: [...new Set(rumors.filter((r) => r.moderation === 'approved').map((r) => r.category))],
  });
});

api.post('/rumors/verify', async (req, res) => {
  const text = requireText(req.body?.text, 'نص الشائعة', { min: 10, max: 3000 });

  const result = await generateJson<RumorVerification>({
    systemInstruction: rumorSystem,
    schema: schemas.rumor,
    temperature: 0.3,
    prompt: `قيّم الادعاء التالي وأعد النتيجة بصيغة JSON:\n"""\n${text}\n"""`,
  });

  res.json({
    status: String(result.status ?? 'غير مؤكدة'),
    category: String(result.category ?? 'غير مصنّف'),
    correction: String(result.correction ?? '').trim(),
    advice: String(result.advice ?? '').trim(),
    credibilityScore: clampScore(result.credibilityScore, 30),
    riskLevel: result.riskLevel ? String(result.riskLevel) : undefined,
    reasoning: result.reasoning ? String(result.reasoning) : undefined,
  } satisfies RumorVerification);
});

api.post('/rumors', (req, res) => {
  const claim = requireText(req.body?.claim, 'نص الشائعة', { min: 10, max: 2000 });
  const category = typeof req.body?.category === 'string' && req.body.category.trim() ? req.body.category.trim() : 'غير مصنّف';
  const source = typeof req.body?.source === 'string' ? req.body.source.trim().slice(0, 300) : '';

  const rumor: Rumor = {
    id: uid('rumor'),
    claim,
    correction: '',
    category,
    status: 'قيد التحقق',
    credibilityScore: 0,
    source: source || 'بلاغ من مستخدم',
    verifiedAt: new Date().toISOString(),
    submitted: true,
    moderation: 'pending',
  };

  rumors = [rumor, ...rumors];
  res.status(201).json({ rumor });
});

/* ---- Stories ---- */

api.get('/stories', (req, res) => {
  const status = (req.query.status as string | undefined) ?? 'approved';
  const result = status === 'all' ? [...stories] : stories.filter((s) => s.status === status);
  result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json({ stories: result });
});

api.post('/stories', (req, res) => {
  const story: Story = {
    id: uid('story'),
    name: requireText(req.body?.name, 'الاسم', { min: 2, max: 60 }),
    location: requireText(req.body?.location, 'المكان', { min: 2, max: 60 }),
    title: requireText(req.body?.title, 'عنوان القصة', { min: 4, max: 120 }),
    content: requireText(req.body?.content, 'نص القصة', { min: 30, max: 3000 }),
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  stories = [story, ...stories];
  res.status(201).json({ story });
});

api.patch('/stories/:id', (req, res) => {
  const status = parseModeration(req.body?.status);
  const story = stories.find((s) => s.id === req.params.id);
  if (!story) throw new HttpError('القصة غير موجودة.', 404);
  story.status = status;
  res.json({ story, status: buildStatus() });
});

/* ---- Guidelines & reports ---- */

api.get('/guidelines', (_req, res) => {
  res.json({ guidelines, categories: [...new Set(guidelines.map((g) => g.category))] });
});

api.get('/reports', (_req, res) => {
  res.json({ reports: [...reports].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) });
});

api.post('/reports', (req, res) => {
  const reference = `RP-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const report: Report = {
    id: uid('report'),
    url: requireText(req.body?.url, 'رابط المحتوى', { min: 5, max: 500 }),
    platform: requireText(req.body?.platform, 'المنصة', { min: 2, max: 60 }),
    type: requireText(req.body?.type, 'نوع المخالفة', { min: 2, max: 80 }),
    description: requireText(req.body?.description, 'وصف البلاغ', { min: 20, max: 3000 }),
    attachmentName: typeof req.body?.attachmentName === 'string' ? req.body.attachmentName.slice(0, 200) : null,
    contactEmail: typeof req.body?.contactEmail === 'string' && req.body.contactEmail.trim() ? req.body.contactEmail.trim().slice(0, 120) : null,
    createdAt: new Date().toISOString(),
    reference,
  };

  reports = [report, ...reports];
  res.status(201).json({ report });
});

/* ------------------------------------------------------------------ */
/* App bootstrap                                                       */
/* ------------------------------------------------------------------ */

async function createServer() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '256kb' }));

  app.use('/api', api);

  // Unmatched API routes must answer JSON, never the SPA shell.
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'المسار المطلوب غير موجود.' });
  });

  // Central error handler — keeps Arabic, user-facing messages consistent.
  app.use('/api', (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    let status = 500;
    let message = 'حدث خطأ غير متوقع في الخادم، حاول مرة أخرى.';

    if (err instanceof HttpError || err instanceof AiError) {
      status = err.status;
      message = err.message;
    } else if (err instanceof SyntaxError) {
      status = 400;
      message = 'تعذّر قراءة البيانات المرسلة، تأكد من صحة الطلب.';
    } else if (typeof (err as { status?: unknown })?.status === 'number') {
      status = (err as { status: number }).status;
    }

    if (status >= 500) console.error('[api]', err);
    res.status(status).json({ error: message });
  });

  if (isProduction) {
    const distPath = path.resolve(__dirname, 'dist');
    const indexHtml = await fs.readFile(path.join(distPath, 'index.html'), 'utf-8').catch(() => {
      throw new Error('لم يتم العثور على مجلد dist. شغّل "npm run build" أولاً.');
    });

    app.use(express.static(distPath, { index: false, maxAge: '1y' }));
    app.use((_req, res) => {
      res.status(200).set({ 'Content-Type': 'text/html' }).end(indexHtml);
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      root: __dirname,
      appType: 'custom',
      server: { middlewareMode: true },
    });

    app.use(vite.middlewares);
    app.use(async (req, res, next) => {
      try {
        const template = await fs.readFile(path.resolve(__dirname, 'index.html'), 'utf-8');
        const html = await vite.transformIndexHtml(req.originalUrl, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
      } catch (error) {
        vite.ssrFixStacktrace(error as Error);
        next(error);
      }
    });
  }

  return app;
}

createServer()
  .then((app) => {
    app.listen(PORT, () => {
      console.log(`\n  ✅ سلام في سوريا — الخادم يعمل على http://localhost:${PORT}`);
      console.log(`  الوضع: ${isProduction ? 'production' : 'development'} | نموذج Gemini: ${MODEL_NAME}`);
      if (!isAiConfigured()) {
        console.warn('  ⚠️  GEMINI_API_KEY غير مضبوط — ميزات الذكاء الاصطناعي ستُرجع خطأ 503 حتى تضيفه في .env\n');
      } else {
        console.log('  🔑 مفتاح Gemini مُحمَّل (لا يُرسل إلى المتصفح مطلقاً)\n');
      }
    });
  })
  .catch((error) => {
    console.error('فشل إقلاع الخادم:', error);
    process.exit(1);
  });

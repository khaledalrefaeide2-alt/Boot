import 'server-only';
import OpenAI from 'openai';
import {
  ASSISTANT_LIMITS,
  AssistantConfigError,
  getAssistantConfig,
  MISSING_KEY_MESSAGE,
} from './config';
import type { ChatMessage } from './types';

/*
 * عميل OpenAI — خادميّ بحت.
 *
 * `import 'server-only'` في أعلى الملف ليس تعليقاً: لو استورد مكوّن عميل
 * هذا الملف بالخطأ لفشل البناء بدل أن يُحزَم المفتاح في حزمة المتصفّح.
 * وهو الحاجز الوحيد الذي يعمل وقت التصريف لا وقت المراجعة.
 */

export class AssistantError extends Error {
  /** رمز داخلي للتمييز في السجل — لا يُعرض للمستخدم */
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 502) {
    super(message);
    this.name = 'AssistantError';
    this.code = code;
    this.status = status;
  }
}

let cached: OpenAI | null = null;
let cachedKey: string | null = null;

function client(): OpenAI {
  const config = getAssistantConfig();
  // المفتاح قد يتغيّر بإعادة تشغيل الخدمة؛ الذاكرة تُبطَل عند تغيّره
  if (!cached || cachedKey !== config.openaiApiKey) {
    cached = new OpenAI({
      apiKey: config.openaiApiKey,
      timeout: ASSISTANT_LIMITS.requestTimeoutMs,
      maxRetries: 1,
    });
    cachedKey = config.openaiApiKey;
  }
  return cached;
}

/**
 * ترجمة أخطاء المزوّد إلى رسائل عربية قابلة للتصرّف.
 *
 * والقاعدة هنا: لا يصل نصّ الخطأ الأصلي إلى المستخدم أبداً. رسائل
 * المزوّد إنجليزية، وقد تحمل تفاصيل حساب أو معرّف طلب أو جزءاً من
 * الإعدادات؛ فتُصنَّف ويُعاد نصّ مكتوب عندنا. والأصل يبقى في السجل
 * الخادمي لمن يشخّص.
 */
export function toAssistantError(error: unknown): AssistantError {
  if (error instanceof AssistantConfigError) {
    return new AssistantError('config', error.message, 503);
  }
  if (error instanceof AssistantError) return error;

  if (error instanceof OpenAI.APIError) {
    const status = error.status ?? 0;

    if (status === 401 || status === 403) {
      return new AssistantError(
        'invalid_key',
        'مفتاح OpenAI غير صالح. تحقق من المفتاح المستخدم.',
        502,
      );
    }
    if (status === 429) {
      // 429 تعني الحصة أو الرصيد معاً؛ يُفرَّق بينهما بنوع الخطأ
      const type = (error.error as { type?: string } | undefined)?.type ?? '';
      if (type.includes('insufficient_quota')) {
        return new AssistantError(
          'quota',
          'رصيد OpenAI غير كافٍ أو تم تجاوز الحد المسموح.',
          502,
        );
      }
      return new AssistantError(
        'rate_limited',
        'تم تجاوز حدّ الطلبات لدى OpenAI. حاول بعد قليل.',
        429,
      );
    }
    if (status === 404) {
      return new AssistantError(
        'model_not_found',
        'النموذج المحدد غير متاح في حسابك. جرّب gpt-4o-mini.',
        502,
      );
    }
    if (status >= 500) {
      return new AssistantError(
        'upstream',
        'تعذر الاتصال بخدمة OpenAI. حاول مرة أخرى لاحقًا.',
        502,
      );
    }
    return new AssistantError('api', 'تعذّر تنفيذ الطلب لدى OpenAI. حاول مرة أخرى.', 502);
  }

  if (error instanceof OpenAI.APIConnectionTimeoutError) {
    return new AssistantError(
      'timeout',
      'استغرقت المعالجة وقتًا طويلًا. حاول مرة أخرى.',
      504,
    );
  }
  if (error instanceof OpenAI.APIConnectionError) {
    return new AssistantError(
      'connection',
      'تعذر الاتصال بخدمة OpenAI. حاول مرة أخرى لاحقًا.',
      502,
    );
  }

  if (!process.env.OPENAI_API_KEY?.trim()) {
    return new AssistantError('config', MISSING_KEY_MESSAGE, 503);
  }
  return new AssistantError('unknown', 'تعذّر إنتاج الإجابة. حاول مرة أخرى.', 502);
}

/*
 * البحث في الويب.
 *
 * يمرّ بـResponses API لا بـChat Completions: أداة البحث المدمجة لا
 * تعمل إلا هناك. ويُبقى المسار القديم كما هو ولا يُمسّ — فإن تعثّر
 * الجديد أعاد إطفاءُ الإعداد السلوكَ السابق كاملاً بلا نشر.
 *
 * والرسائل تُترجَم لا تُمرَّر كما هي: `system` تصير `instructions`،
 * والباقي `input`. وهو اختلافٌ في الشكل لا في المعنى.
 */
function splitMessages(messages: ChatMessage[]): {
  instructions: string;
  input: { role: 'user' | 'assistant'; content: string }[];
} {
  const instructions = messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n\n');

  const input = messages
    .filter((m): m is ChatMessage & { role: 'user' | 'assistant' } => m.role !== 'system')
    .map((m) => ({ role: m.role, content: m.content }));

  return { instructions, input };
}

/** أداة البحث — الوصول الحيّ مسموح، وحجم السياق متوسّط */
const WEB_SEARCH_TOOL = { type: 'web_search' as const, search_context_size: 'medium' as const };

/**
 * استخراج النصّ من ردّ Responses.
 *
 * `output_text` حقلٌ ميسّر في المكتبة، ولا يُعتمد عليه وحده: الردّ الذي
 * يحمل استدعاء أداة قد يضع النصّ في عناصر المخرجات. فيُقرأ الميسَّر أولاً
 * ثمّ يُمشى على المخرجات — وأيّهما وجد نصّاً كفى.
 */
function responseText(response: unknown): string {
  const record = response as {
    output_text?: unknown;
    output?: { type?: string; content?: { type?: string; text?: unknown }[] }[];
  };

  if (typeof record.output_text === 'string' && record.output_text.trim()) {
    return record.output_text.trim();
  }

  const parts: string[] = [];
  for (const item of record.output ?? []) {
    if (item.type !== 'message') continue;
    for (const piece of item.content ?? []) {
      if (piece.type === 'output_text' && typeof piece.text === 'string') parts.push(piece.text);
    }
  }
  return parts.join('').trim();
}

/** استدعاء مع بحث في الويب — يُعيد النصّ كاملاً */
export async function generateWithWebSearch(
  messages: ChatMessage[],
): Promise<{ content: string; model: string; promptTokens?: number; completionTokens?: number }> {
  const config = getAssistantConfig();
  const { instructions, input } = splitMessages(messages);

  try {
    const response = await client().responses.create({
      model: config.chatModel,
      instructions,
      input,
      tools: [WEB_SEARCH_TOOL],
      temperature: 0.2,
      max_output_tokens: 1800,
    });

    const content = responseText(response);
    if (!content) {
      throw new AssistantError('empty', 'لم تُنتج الخدمة إجابة. حاول مرة أخرى.', 502);
    }

    return {
      content,
      model: response.model,
      promptTokens: response.usage?.input_tokens,
      completionTokens: response.usage?.output_tokens,
    };
  } catch (error) {
    throw toAssistantError(error);
  }
}

/**
 * استدعاء مع بحث في الويب، متدفّقاً.
 *
 * ويُرسَل حدثٌ حين يبدأ البحث: المستخدم ينتظر صامتاً ثوانيَ بينما يبحث
 * النموذج، وصمتُ عشر ثوانٍ يُقرأ عطلاً فيُعاد تحميل الصفحة ويضيع الجواب.
 */
export async function* streamWithWebSearch(
  messages: ChatMessage[],
): AsyncGenerator<{ kind: 'delta'; text: string } | { kind: 'searching' }, void, undefined> {
  const config = getAssistantConfig();
  const { instructions, input } = splitMessages(messages);

  try {
    const stream = await client().responses.create({
      model: config.chatModel,
      instructions,
      input,
      tools: [WEB_SEARCH_TOOL],
      temperature: 0.2,
      max_output_tokens: 1800,
      stream: true,
    });

    for await (const event of stream) {
      if (event.type === 'response.output_text.delta' && event.delta) {
        yield { kind: 'delta', text: event.delta };
      } else if (event.type === 'response.web_search_call.in_progress') {
        yield { kind: 'searching' };
      }
    }
  } catch (error) {
    throw toAssistantError(error);
  }
}

/** استدعاء المحادثة — يُعيد النصّ كاملاً */
export async function generateAssistantResponse(
  messages: ChatMessage[],
): Promise<{ content: string; model: string; promptTokens?: number; completionTokens?: number }> {
  const config = getAssistantConfig();
  try {
    const completion = await client().chat.completions.create({
      model: config.chatModel,
      messages,
      temperature: 0.2,
      max_tokens: 1400,
    });

    const content = completion.choices[0]?.message?.content?.trim();
    if (!content) {
      throw new AssistantError('empty', 'لم تُنتج الخدمة إجابة. حاول مرة أخرى.', 502);
    }

    return {
      content,
      model: completion.model,
      promptTokens: completion.usage?.prompt_tokens,
      completionTokens: completion.usage?.completion_tokens,
    };
  } catch (error) {
    throw toAssistantError(error);
  }
}

/** استدعاء المحادثة متدفّقاً — يُعيد مقاطع النصّ تباعاً */
export async function* streamAssistantResponse(
  messages: ChatMessage[],
): AsyncGenerator<string, void, undefined> {
  const config = getAssistantConfig();
  try {
    const stream = await client().chat.completions.create({
      model: config.chatModel,
      messages,
      temperature: 0.2,
      max_tokens: 1400,
      stream: true,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) yield delta;
    }
  } catch (error) {
    throw toAssistantError(error);
  }
}

/*
 * توليد المتّجهات.
 *
 * المتّجه يُعاد مُوحَّد الطول (L2). والسبب أن جيب التمام بين متّجهين
 * مُوحَّدين هو ضربُ النقطة نفسه — بلا جذور ولا قسمة. وبما أن القياس
 * سيجري في SQL على قاعدة بلا pgvector، فكلّ عملية حسابية تُحذف من
 * الاستعلام تُحذف مضروبةً في عدد المرشّحين.
 */
function normalize(vector: number[]): number[] {
  let sum = 0;
  for (const value of vector) sum += value * value;
  const norm = Math.sqrt(sum);
  if (!norm || !Number.isFinite(norm)) return vector;
  return vector.map((value) => value / norm);
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const [first] = await generateEmbeddings([text]);
  if (!first) throw new AssistantError('empty', 'تعذّر تحليل السؤال. حاول مرة أخرى.', 502);
  return first;
}

/** توليد دفعة متّجهات — أرخص وأسرع من استدعاء لكل نصّ */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const config = getAssistantConfig();
  try {
    const response = await client().embeddings.create({
      model: config.embedModel,
      input: texts,
    });
    // الترتيب مضمون بالحقل `index` لا بترتيب الوصول
    const sorted = [...response.data].sort((a, b) => a.index - b.index);
    return sorted.map((item) => normalize(item.embedding));
  } catch (error) {
    throw toAssistantError(error);
  }
}

/** اختبار اتصال خفيف — للمدير وحده، ولا يُعيد أي جزء من المفتاح */
export async function pingOpenAI(): Promise<{ chatModel: string; embedModel: string }> {
  const config = getAssistantConfig();
  try {
    await client().chat.completions.create({
      model: config.chatModel,
      messages: [{ role: 'user', content: 'رد بكلمة: جاهز' }],
      max_tokens: 5,
    });
    await client().embeddings.create({ model: config.embedModel, input: 'اختبار' });
    return { chatModel: config.chatModel, embedModel: config.embedModel };
  } catch (error) {
    throw toAssistantError(error);
  }
}

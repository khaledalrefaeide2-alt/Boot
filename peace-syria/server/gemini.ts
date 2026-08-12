import { GoogleGenAI, Type, type Schema } from '@google/genai';

/**
 * Thin wrapper around the Gemini SDK. Lives on the server only — the API key
 * is read from the process environment and is never sent to the browser.
 */

export class AiError extends Error {
  status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = 'AiError';
    this.status = status;
  }
}

const MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';
const REQUEST_TIMEOUT_MS = 60_000;

let client: GoogleGenAI | null = null;

export function isAiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY);
}

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new AiError(
      'خدمة الذكاء الاصطناعي غير مهيّأة على الخادم. أضف مفتاح GEMINI_API_KEY في ملف .env ثم أعد تشغيل الخادم.',
      503,
    );
  }
  if (!client) {
    client = new GoogleGenAI({ apiKey });
  }
  return client;
}

/** Models occasionally wrap JSON in markdown fences — strip them before parsing. */
function extractJson(raw: string): unknown {
  const trimmed = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.search(/[[{]/);
    const end = Math.max(trimmed.lastIndexOf('}'), trimmed.lastIndexOf(']'));
    if (start !== -1 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new AiError('تعذّر قراءة استجابة الذكاء الاصطناعي، حاول مرة أخرى.');
  }
}

interface GenerateJsonOptions {
  prompt: string;
  schema: Schema;
  systemInstruction: string;
  temperature?: number;
}

/** Calls Gemini with a response schema and returns the parsed JSON payload. */
export async function generateJson<T>({
  prompt,
  schema,
  systemInstruction,
  temperature = 0.4,
}: GenerateJsonOptions): Promise<T> {
  const ai = getClient();

  let response;
  try {
    response = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {
        systemInstruction,
        temperature,
        responseMimeType: 'application/json',
        responseSchema: schema,
        httpOptions: { timeout: REQUEST_TIMEOUT_MS },
      },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error('[gemini] request failed:', detail);
    if (/api[_ -]?key|permission|unauthenticated|401|403/i.test(detail)) {
      throw new AiError('مفتاح Gemini غير صالح أو لا يملك صلاحية الوصول.', 502);
    }
    if (/quota|429|rate/i.test(detail)) {
      throw new AiError('تم تجاوز حد الاستخدام المسموح لخدمة الذكاء الاصطناعي، حاول بعد قليل.', 429);
    }
    if (/timeout|abort|ETIMEDOUT|ENOTFOUND|ECONNRESET|fetch failed/i.test(detail)) {
      throw new AiError('انتهت مهلة الاتصال بخدمة الذكاء الاصطناعي، حاول مرة أخرى.', 504);
    }
    throw new AiError('تعذّر الاتصال بخدمة الذكاء الاصطناعي حالياً.', 502);
  }

  const text = response.text;
  if (!text) {
    throw new AiError('لم تُرجع خدمة الذكاء الاصطناعي أي نتيجة، حاول مرة أخرى.');
  }
  return extractJson(text) as T;
}

/** Shared schema fragments used by the API routes. */
export const schemas = {
  meter: {
    type: Type.OBJECT,
    properties: {
      isCalm: { type: Type.BOOLEAN, description: 'هل النص هادئ وخالٍ من التحريض؟' },
      hasGeneralization: { type: Type.BOOLEAN, description: 'هل يحتوي على تعميم تجاه فئة أو طائفة أو منطقة؟' },
      safetyScore: { type: Type.INTEGER, description: 'درجة سلامة اللغة من 0 إلى 100' },
      analysis: { type: Type.STRING, description: 'تحليل موجز بالعربية في 2-4 جمل' },
      rewrittenText: { type: Type.STRING, description: 'إعادة صياغة النص بلغة سلمية تحافظ على المعنى' },
      flaggedPhrases: {
        type: Type.ARRAY,
        description: 'العبارات المسيئة أو المُعمِّمة كما وردت في النص',
        items: { type: Type.STRING },
      },
      tone: { type: Type.STRING, description: 'وصف نبرة النص بكلمة أو كلمتين بالعربية' },
    },
    required: ['isCalm', 'hasGeneralization', 'safetyScore', 'analysis', 'rewrittenText'],
    propertyOrdering: [
      'isCalm',
      'hasGeneralization',
      'safetyScore',
      'tone',
      'analysis',
      'flaggedPhrases',
      'rewrittenText',
    ],
  } satisfies Schema,

  rumor: {
    type: Type.OBJECT,
    properties: {
      status: {
        type: Type.STRING,
        description: 'إحدى القيم: كاذبة، مضللة، صحيحة جزئياً، صحيحة، غير مؤكدة',
        enum: ['كاذبة', 'مضللة', 'صحيحة جزئياً', 'صحيحة', 'غير مؤكدة'],
      },
      category: { type: Type.STRING, description: 'تصنيف الشائعة بالعربية' },
      correction: { type: Type.STRING, description: 'التصحيح والحقيقة بلغة واضحة' },
      advice: { type: Type.STRING, description: 'نصيحة عملية للتحقق قبل النشر' },
      credibilityScore: { type: Type.INTEGER, description: 'مصداقية الادعاء من 0 إلى 100' },
      riskLevel: { type: Type.STRING, description: 'مستوى الخطورة: منخفض، متوسط، مرتفع', enum: ['منخفض', 'متوسط', 'مرتفع'] },
      reasoning: { type: Type.STRING, description: 'مؤشرات التحقق التي اعتُمد عليها' },
    },
    required: ['status', 'category', 'correction', 'advice', 'credibilityScore'],
    propertyOrdering: ['status', 'category', 'credibilityScore', 'riskLevel', 'correction', 'advice', 'reasoning'],
  } satisfies Schema,

  posts: {
    type: Type.OBJECT,
    properties: {
      posts: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING, description: 'عنوان قصير جذّاب' },
            content: { type: Type.STRING, description: 'نص المنشور، 40-70 كلمة، جاهز للنشر' },
            category: {
              type: Type.STRING,
              description: 'تصنيف المنشور',
              enum: ['تهدئة', 'تعايش', 'توعية رقمية', 'مكافحة الشائعات', 'دعم نفسي', 'تكافل مجتمعي'],
            },
            safetyScore: { type: Type.INTEGER, description: 'درجة سلامة اللغة من 0 إلى 100' },
            hashtags: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'وسوم بدون رمز #' },
          },
          required: ['title', 'content', 'category', 'safetyScore'],
          propertyOrdering: ['title', 'content', 'category', 'safetyScore', 'hashtags'],
        },
      },
    },
    required: ['posts'],
  } satisfies Schema,
};

export const MODEL_NAME = MODEL;

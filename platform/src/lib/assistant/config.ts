import 'server-only';
import { z } from 'zod';

/*
 * إعدادات المساعد — تُقرأ من البيئة وحدها.
 *
 * ولا تُقرأ على مستوى الوحدة بل داخل دالة. الفرق ليس أسلوبياً: قراءةٌ على
 * مستوى الوحدة تُنفَّذ أثناء `next build` حين تُستورد الوحدة لتحليل
 * المسارات، فيفشل البناء على خادم لا يحمل المفتاح — وهو بالضبط ما وقع في
 * هذا المشروع مع Redis من قبل. فالقراءة مؤجَّلة إلى أول طلب حقيقي.
 */

const schema = z.object({
  OPENAI_API_KEY: z.string().trim().min(1),
  OPENAI_CHAT_MODEL: z.string().trim().min(1).default('gpt-4o-mini'),
  OPENAI_EMBED_MODEL: z.string().trim().min(1).default('text-embedding-3-small'),
});

export interface AssistantConfig {
  openaiApiKey: string;
  chatModel: string;
  embedModel: string;
}

/** رسالة الغياب موحّدة، فلا تختلف صياغتها بين مسار ومسار */
export const MISSING_KEY_MESSAGE =
  'لم يتم ضبط مفتاح OpenAI. أضف OPENAI_API_KEY في ملف البيئة.';

export class AssistantConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssistantConfigError';
  }
}

/**
 * أبعاد المتّجه لكل نموذج معروف.
 *
 * البُعد ليس تفصيلاً: عمود المتّجه يُملأ بأرقام بطول ثابت، ومقارنة متّجه
 * بطول 1536 بآخر بطول 3072 ليست «أقلّ دقّة» بل بلا معنى أصلاً. فالبُعد
 * يُخزَّن مع كل صفّ ويُقارَن قبل الاستعمال.
 */
const KNOWN_DIMS: Record<string, number> = {
  'text-embedding-3-small': 1536,
  'text-embedding-3-large': 3072,
  'text-embedding-ada-002': 1536,
};

export function embeddingDimensions(model: string): number | null {
  return KNOWN_DIMS[model] ?? null;
}

/** هل ضُبط المفتاح؟ — فحص لا يرمي، يُستعمل في لوحات الحالة */
export function isAssistantConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

/** قراءة الإعدادات، أو رمي خطأ عربي واضح */
export function getAssistantConfig(): AssistantConfig {
  const parsed = schema.safeParse({
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_CHAT_MODEL: process.env.OPENAI_CHAT_MODEL,
    OPENAI_EMBED_MODEL: process.env.OPENAI_EMBED_MODEL,
  });

  if (!parsed.success) {
    if (!process.env.OPENAI_API_KEY?.trim()) {
      throw new AssistantConfigError(MISSING_KEY_MESSAGE);
    }
    throw new AssistantConfigError('إعدادات المساعد غير صالحة. راجع متغيّرات البيئة.');
  }

  return {
    openaiApiKey: parsed.data.OPENAI_API_KEY,
    chatModel: parsed.data.OPENAI_CHAT_MODEL,
    embedModel: parsed.data.OPENAI_EMBED_MODEL,
  };
}

/** حدود المعالجة — مكتوبة هنا لا مبعثرة في المسارات */
export const ASSISTANT_LIMITS = {
  /** أقصى طول لسؤال المستخدم */
  maxMessageChars: 2000,
  /** عدد المقاطع المسترجَعة دلالياً */
  retrievalTopK: 10,
  /** سقف المرشّحين قبل حساب التشابه — يحدّ تكلفة الاستعلام */
  candidateCap: 3000,
  /** عدد الرسائل السابقة المُمرَّرة كسياق محادثة */
  historyTurns: 8,
  /** مهلة استدعاء OpenAI بالميلي‌ثانية */
  requestTimeoutMs: 45_000,
  /** نافذة التحليل الافتراضية بالأيام */
  defaultWindowDays: 7,
} as const;

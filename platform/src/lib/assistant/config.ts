import 'server-only';
import { z } from 'zod';
import { REASONING_EFFORTS, type ReasoningEffort } from './model-params';

/*
 * إعدادات المساعد — تُقرأ من البيئة وحدها.
 *
 * ولا تُقرأ على مستوى الوحدة بل داخل دالة. الفرق ليس أسلوبياً: قراءةٌ على
 * مستوى الوحدة تُنفَّذ أثناء `next build` حين تُستورد الوحدة لتحليل
 * المسارات، فيفشل البناء على خادم لا يحمل المفتاح — وهو بالضبط ما وقع في
 * هذا المشروع مع Redis من قبل. فالقراءة مؤجَّلة إلى أول طلب حقيقي.
 */

/** النموذج الافتراضي حين لا يُضبط `OPENAI_CHAT_MODEL` */
export const DEFAULT_CHAT_MODEL = 'gpt-6.1-sol';

/*
 * عمق التفكير — يسري على نماذج الاستدلال وحدها، ويُتجاهَل لغيرها.
 *
 * وهو إعدادان لا إعداد واحد لأنّ المهمّتين مختلفتان في ثمن الانتظار:
 * تصنيف المنشور يجري في الخلفية ولا ينتظره أحد، فيستحقّ تفكيراً أعمق.
 * والمساعد يُسأل وصاحبه ينظر إلى الشاشة، وكلّ ثانية تفكير يراها صمتاً.
 */
const effort = (fallback: ReasoningEffort) =>
  z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.enum(REASONING_EFFORTS))
    .default(fallback);

const schema = z.object({
  OPENAI_API_KEY: z.string().trim().min(1),
  OPENAI_CHAT_MODEL: z.string().trim().min(1).default(DEFAULT_CHAT_MODEL),
  OPENAI_EMBED_MODEL: z.string().trim().min(1).default('text-embedding-3-small'),
  OPENAI_ANALYSIS_EFFORT: effort('medium'),
  OPENAI_ASSISTANT_EFFORT: effort('low'),
});

export interface AssistantConfig {
  openaiApiKey: string;
  chatModel: string;
  embedModel: string;
  /** عمق التفكير في تصنيف المنشورات */
  analysisEffort: ReasoningEffort;
  /** عمق التفكير في إجابات المساعد */
  assistantEffort: ReasoningEffort;
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
    // السلسلة الفارغة تُعامَل غياباً: `KEY=""` في ملف البيئة يعني «الافتراضي»
    OPENAI_ANALYSIS_EFFORT: process.env.OPENAI_ANALYSIS_EFFORT?.trim() || undefined,
    OPENAI_ASSISTANT_EFFORT: process.env.OPENAI_ASSISTANT_EFFORT?.trim() || undefined,
  });

  if (!parsed.success) {
    if (!process.env.OPENAI_API_KEY?.trim()) {
      throw new AssistantConfigError(MISSING_KEY_MESSAGE);
    }
    /*
     * خطأ عمق التفكير يُسمّى باسمه.
     *
     * قيمةٌ مكتوبة خطأً في ملف البيئة («meduim») تُوقف التصنيف كلّه، و«الإعدادات
     * غير صالحة» وحدها تترك المدير يفتّش الملفّ سطراً سطراً. واسم المتغيّر
     * ليس سرّاً، والقيم المسموحة ليست سرّاً.
     */
    const badEffort = parsed.error.issues
      .map((issue) => issue.path[0])
      .find((key) => key === 'OPENAI_ANALYSIS_EFFORT' || key === 'OPENAI_ASSISTANT_EFFORT');
    if (badEffort) {
      throw new AssistantConfigError(
        `قيمة ${String(badEffort)} غير صالحة. القيم المسموحة: ${REASONING_EFFORTS.join(' أو ')}.`,
      );
    }
    throw new AssistantConfigError('إعدادات المساعد غير صالحة. راجع متغيّرات البيئة.');
  }

  return {
    openaiApiKey: parsed.data.OPENAI_API_KEY,
    chatModel: parsed.data.OPENAI_CHAT_MODEL,
    embedModel: parsed.data.OPENAI_EMBED_MODEL,
    analysisEffort: parsed.data.OPENAI_ANALYSIS_EFFORT,
    assistantEffort: parsed.data.OPENAI_ASSISTANT_EFFORT,
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

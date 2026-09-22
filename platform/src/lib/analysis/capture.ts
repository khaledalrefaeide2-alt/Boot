import 'server-only';
import OpenAI from 'openai';
import { prisma } from '@/lib/db';
import { getAssistantConfig } from '@/lib/assistant/config';
import { auditSystem, AUDIT_ACTIONS } from '@/lib/audit';
import {
  looksLikeDirective,
  MAX_INSTRUCTION,
  MAX_PER_MESSAGE,
  MIN_INSTRUCTION,
  normalizeInstruction,
} from './directive';

/** سقف ما ينتظر القرار — لئلا تتحوّل شاشة المراجعة إلى مكبّ */
const PENDING_CAP = 200;

/*
 * التقاط التوجيهات من كلام المستخدم.
 *
 * المساعد يُسأل ويُجيب، ثم يُنسى الجواب. والمستخدمون لا يسألونه فقط: بينهم
 * من يقول «اعتبر المطالبة بالخدمات نقداً لا معارضة». هذه قاعدةُ تصنيف
 * قيلت مرّةً وضاعت في محادثة، وكان على قائلها أن يفتح شاشة الإدارة ويعيد
 * كتابتها ليبقى لها أثر. فتُلتقط حيث تُقال.
 *
 * ★ والقاعدة الحاكمة: ما يُلتقط يُحفظ ولا يُفعَّل.
 *
 *   التوجيه المفعّل يدخل تحليلَ كلّ منشور بعده، ويُغيّر تصنيف الجميع لا
 *   تصنيف قائله. وجملةٌ قيلت في سياق سؤال قد تُقرأ أمراً دائماً وهي ليست
 *   كذلك — والنموذج الذي يستخرجها يخطئ أيضاً. ولو فُعّلت تلقائياً لأمكن
 *   لمستخدمٍ واحد، بجملة في محادثة خاصة، أن يعيد تعريف «المحتوى الضارّ»
 *   للمنصة كلها بلا أن يمرّ القرار بأحد. فتُعرض على من يملك ضبط التصنيف،
 *   ويُفعّلها بقصد أو يحذفها.
 */

export interface ExtractedGuidance {
  scope: 'STANCE' | 'SENTIMENT' | 'RISK' | 'GENERAL';
  instruction: string;
}

const EXTRACTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    instructions: {
      type: 'array',
      maxItems: MAX_PER_MESSAGE,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          scope: { type: 'string', enum: ['STANCE', 'SENTIMENT', 'RISK', 'GENERAL'] },
          instruction: { type: 'string' },
        },
        required: ['scope', 'instruction'],
      },
    },
  },
  required: ['instructions'],
} as const;

const EXTRACTION_PROMPT = `أنت تستخرج قواعد التصنيف من كلام مستخدمي منصة رصد إعلامي.

المطلوب: قواعد دائمة تصلح لتصنيف كل منشور قادم — لا أسئلة، ولا طلبات عن منشور بعينه، ولا طلبات تقارير.

استخرج فقط ما كان أمراً صريحاً يغيّر طريقة التصنيف. أمثلة على ما يُستخرج:
• «اعتبر المطالبة بالخدمات نقداً لا معارضة» ← SENTIMENT
• «لا تعدّ انتقاد أداء البلدية تحريضاً» ← RISK
• «صنّف منشورات الوزارات الرسمية محايدة ما لم تحمل رأياً» ← STANCE

وأمثلة على ما لا يُستخرج — أعِد مصفوفة فارغة لها:
• «كم منشوراً هذا الأسبوع؟» — سؤال
• «حلّل لي هذا المنشور» — طلب تنفيذ لا قاعدة
• «اعرض أبرز الحسابات» — طلب عرض
• «أعطني تقريراً عن الأسبوع» — طلب تقرير

القواعد:
1. اكتب كل قاعدة بالعربية، جملةً واحدة مختصرة، بصيغة الأمر، ولا تتجاوز ${MAX_INSTRUCTION} حرفاً.
2. لا تخترع ما لم يُقَل. القاعدة يجب أن تكون في نصّ المستخدم.
3. إن لم تجد قاعدة واحدة صريحة، أعِد { "instructions": [] } — وهذا هو الجواب الأغلب.
4. النطاق: STANCE للموقف، SENTIMENT للمشاعر، RISK لإشارات الخطر، GENERAL لما عدا ذلك.`;

let cached: OpenAI | null = null;
let cachedKey: string | null = null;

function client(): OpenAI {
  const config = getAssistantConfig();
  if (!cached || cachedKey !== config.openaiApiKey) {
    cached = new OpenAI({ apiKey: config.openaiApiKey, timeout: 20_000, maxRetries: 1 });
    cachedKey = config.openaiApiKey;
  }
  return cached;
}

/** استخراج القواعد من رسالة — يُستدعى بعد المرشّح وحده */
export async function extractGuidance(message: string): Promise<ExtractedGuidance[]> {
  const config = getAssistantConfig();

  const completion = await client().chat.completions.create({
    model: config.chatModel,
    temperature: 0,
    messages: [
      { role: 'system', content: EXTRACTION_PROMPT },
      { role: 'user', content: message.trim().slice(0, 2000) },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'captured_guidance',
        strict: true,
        schema: EXTRACTION_SCHEMA as unknown as Record<string, unknown>,
      },
    },
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) return [];

  const parsed = JSON.parse(raw) as { instructions?: ExtractedGuidance[] };
  return (parsed.instructions ?? [])
    .map((item) => ({ scope: item.scope, instruction: item.instruction.trim() }))
    .filter(
      (item) =>
        item.instruction.length >= MIN_INSTRUCTION &&
        item.instruction.length <= MAX_INSTRUCTION,
    )
    .slice(0, MAX_PER_MESSAGE);
}

/**
 * التقاط ما في الرسالة وحفظه معطَّلاً.
 *
 * لا ترمي أبداً. المساعد يجيب سؤال المستخدم، والالتقاط أثرٌ جانبي نافع —
 * وفشلُه لا يصحّ أن يُفقد المستخدم جوابه.
 */
export async function captureGuidance(
  userId: string,
  message: string,
): Promise<{ captured: number }> {
  try {
    if (!looksLikeDirective(message)) return { captured: 0 };

    const pending = await prisma.analysisGuidance.count({
      where: { source: 'ASSISTANT', isActive: false },
    });
    if (pending >= PENDING_CAP) return { captured: 0 };

    const extracted = await extractGuidance(message);
    if (extracted.length === 0) return { captured: 0 };

    /*
     * التكرار يُفحص على النصّ الموحَّد لا الخام.
     *
     * المستخدم يعيد القاعدة نفسها بصياغات متقاربة عبر محادثات، والحفظ
     * الأعمى يملأ شاشة المراجعة بعشرين نسخة من قاعدة واحدة فلا تُقرأ ولا
     * تُفعَّل. والمقارنة على الموحَّد تلتقط اختلاف التشكيل والهمزة
     * والترقيم — وهي أكثر ما يختلف.
     */
    const existing = await prisma.analysisGuidance.findMany({
      select: { instruction: true },
      take: 500,
    });
    const seen = new Set(existing.map((row) => normalizeInstruction(row.instruction)));

    const fresh = extracted.filter((item) => {
      const key = normalizeInstruction(item.instruction);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (fresh.length === 0) return { captured: 0 };

    await prisma.analysisGuidance.createMany({
      data: fresh.map((item) => ({
        scope: item.scope,
        instruction: item.instruction,
        source: 'ASSISTANT' as const,
        sourceMessage: message.trim().slice(0, 1000),
        isActive: false,
        createdById: userId,
      })),
    });

    await auditSystem({
      action: AUDIT_ACTIONS.ANALYSIS_GUIDANCE_CAPTURED,
      entityType: 'analysis_guidance',
      summary: `التقط المساعد ${fresh.length} توجيهاً من محادثة — بانتظار التفعيل`,
      metadata: { userId, instructions: fresh.map((item) => item.instruction) },
    });

    return { captured: fresh.length };
  } catch (error) {
    console.error(
      '[capture] تعذّر التقاط التوجيهات:',
      error instanceof Error ? error.message : error,
    );
    return { captured: 0 };
  }
}

import { z } from 'zod';
import { ASSISTANT_LIMITS } from '@/lib/assistant/config';
import { MEMORY_LIMITS } from '@/lib/assistant/memory-limits';

export const chatSchema = z.object({
  conversationId: z.string().trim().max(64).optional(),
  message: z
    .string()
    .trim()
    .min(2, 'اكتب سؤالاً أوضح')
    .max(ASSISTANT_LIMITS.maxMessageChars, 'السؤال أطول من الحد المسموح'),
  /** نافذة التحليل بالأيام — يضبطها المستخدم من الواجهة */
  windowDays: z.coerce.number().int().min(1).max(90).default(ASSISTANT_LIMITS.defaultWindowDays),
  stream: z.boolean().default(true),
});

export const createConversationSchema = z.object({
  title: z.string().trim().max(120).optional(),
});

export type ChatInput = z.infer<typeof chatSchema>;

/*
 * تعليمات المستخدم المحفوظة.
 *
 * `scope` يُقبل في المدخل ويُحرَس في المسار: المستخدم العادي يُرسل
 * `GLOBAL` فيُردّ بـ403، ولا يُحذف الحقل من المخطّط — الحذف يجعل الطلب
 * ينجح صامتاً بنطاقٍ غير الذي طُلب، وهو أسوأ من الرفض الصريح.
 */
export const memoryKindSchema = z.enum(['WORK', 'REPORTING', 'CLASSIFICATION', 'GLOSSARY', 'GENERAL']);
export const memoryScopeSchema = z.enum(['USER', 'GLOBAL']);
export const memoryStatusSchema = z.enum(['ACTIVE', 'DISABLED', 'PENDING']);

export const createMemorySchema = z.object({
  title: z.string().trim().min(2, 'اكتب عنواناً أوضح').max(MEMORY_LIMITS.titleChars),
  content: z.string().trim().min(2, 'اكتب التعليمة').max(MEMORY_LIMITS.contentChars),
  kind: memoryKindSchema.default('GENERAL'),
  scope: memoryScopeSchema.default('USER'),
  priority: z.coerce.number().int().min(0).max(MEMORY_LIMITS.maxPriority).default(0),
  status: memoryStatusSchema.default('ACTIVE'),
});

/** التعديل جزئيّ: من غيّر الأولوية وحدها لا يُعيد إرسال المتن كله */
export const updateMemorySchema = createMemorySchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  'لا تغيير مُرسَل',
);

export type CreateMemoryInput = z.infer<typeof createMemorySchema>;
export type UpdateMemoryInput = z.infer<typeof updateMemorySchema>;

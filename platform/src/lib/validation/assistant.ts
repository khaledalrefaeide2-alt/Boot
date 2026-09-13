import { z } from 'zod';
import { ASSISTANT_LIMITS } from '@/lib/assistant/config';

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

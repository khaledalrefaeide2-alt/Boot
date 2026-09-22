import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import {
  ApiError,
  errors,
  jsonError,
  jsonOk,
  parseBody,
  requireCsrf,
  requirePermission,
} from '@/lib/api';
import { PERMISSIONS } from '@/lib/auth/rbac';
import { getAccountScope } from '@/lib/auth/account-scope';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { audit, AUDIT_ACTIONS } from '@/lib/audit';
import { chatSchema } from '@/lib/validation/assistant';
import { buildContext } from '@/lib/assistant/rag';
import { captureGuidance } from '@/lib/analysis/capture';
import {
  AssistantError,
  generateAssistantResponse,
  streamAssistantResponse,
  toAssistantError,
} from '@/lib/assistant/openai';
import {
  ASSISTANT_LIMITS,
  getAssistantConfig,
  isAssistantConfigured,
  MISSING_KEY_MESSAGE,
} from '@/lib/assistant/config';
import { buildUserPrompt, deriveTitle, SYSTEM_PROMPT } from '@/lib/assistant/prompts';
import type { AnswerMetadata, ChatMessage } from '@/lib/assistant/types';

/*
 * إرسال سؤال إلى المساعد.
 *
 * الترتيب مقصود: الصلاحية، ثمّ CSRF، ثمّ الحدّ، ثمّ التحقّق، ثمّ الملكية،
 * ثمّ البناء، ثمّ الاستدعاء. وكل حاجز قبل ما يليه تكلفةً: لا نبني سياقاً
 * من القاعدة لمن لا يملك الصلاحية، ولا نستدعي مزوّداً مدفوعاً لمن تجاوز
 * حدّه. الطلب المرفوض يجب أن يُرفض قبل أن يُكلّف شيئاً.
 */

/** يضمن ملكية المحادثة، أو ينشئ واحدة جديدة */
async function resolveConversation(
  userId: string,
  conversationId: string | undefined,
  firstQuestion: string,
): Promise<{ id: string; created: boolean }> {
  if (conversationId) {
    const existing = await prisma.assistantConversation.findUnique({
      where: { id: conversationId },
      select: { id: true, userId: true },
    });
    // محادثة غيره تُعامل كغير موجودة، فلا يفرّق الردّ بين «ممنوع» و«مفقود»
    if (!existing || existing.userId !== userId) {
      throw errors.notFound('المحادثة غير موجودة');
    }
    return { id: existing.id, created: false };
  }

  const created = await prisma.assistantConversation.create({
    data: { userId, title: deriveTitle(firstQuestion) },
    select: { id: true },
  });
  return { id: created.id, created: true };
}

/** آخر أدوار المحادثة كسياق — محدودة العدد فلا تنتفخ التكلفة */
async function recentTurns(conversationId: string): Promise<ChatMessage[]> {
  const rows = await prisma.assistantMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'desc' },
    take: ASSISTANT_LIMITS.historyTurns,
    select: { role: true, content: true },
  });
  return rows
    .reverse()
    .map((row) => ({
      role: row.role === 'USER' ? ('user' as const) : ('assistant' as const),
      content: row.content,
    }));
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requirePermission(PERMISSIONS.ASSISTANT_USE);
    await requireCsrf();

    const quota = await rateLimit(
      `assistant:${actor.id}`,
      RATE_LIMITS.ASSISTANT.limit,
      RATE_LIMITS.ASSISTANT.window,
    );
    if (!quota.allowed) {
      throw errors.tooMany(
        `تجاوزت حدّ أسئلة المساعد في هذه الساعة (${RATE_LIMITS.ASSISTANT.limit}). حاول لاحقاً.`,
      );
    }

    const input = await parseBody(request, chatSchema);

    /*
     * فحص المفتاح بعد التحقّق من المدخلات لا قبله.
     *
     * الترتيب مقصود: مدخلٌ غير صالح خطأ في الطلب (400) مهما كان حال
     * الخادم، وردُّه 503 يقول للعميل «الخدمة معطّلة» بينما العطب في ما
     * أرسله هو. ثمّ يأتي فحص المفتاح قبل بناء السياق مباشرةً، فلا نقرأ
     * من القاعدة شيئاً لطلبٍ لا يمكن أن ينجح.
     *
     * وبدون هذا الفحص يُرمى الخطأ من عمق طبقة الإعدادات فلا يعرفه
     * `jsonError` — وهو لا يعرف إلا `ApiError` — فيسقط إلى «حدث خطأ غير
     * متوقع»: رسالة صحيحة ولا تفيد المسؤول في شيء.
     */
    if (!isAssistantConfigured()) {
      throw new ApiError(503, MISSING_KEY_MESSAGE);
    }

    const config = getAssistantConfig();

    const conversation = await resolveConversation(actor.id, input.conversationId, input.message);
    const scope = await getAccountScope();

    const [context, history] = await Promise.all([
      buildContext(input.message, scope, input.windowDays),
      recentTurns(conversation.id),
    ]);

    const messages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history,
      { role: 'user', content: buildUserPrompt(input.message, context) },
    ];

    const metadata: AnswerMetadata = {
      chatModel: config.chatModel,
      embedModel: config.embedModel,
      retrievedPostIds: context.posts.map((post) => post.postId),
      windowDays: input.windowDays,
      totalPostsInWindow: context.snapshot.totalPosts,
    };

    /*
     * رسالة المستخدم تُحفظ قبل الاستدعاء لا بعده.
     *
     * لو حُفظت بعده لضاع سؤال المستخدم كلّما فشل المزوّد — فيرى محادثة
     * بلا أثر لما كتبه. وحفظها أولاً يجعل الفشل ظاهراً في مكانه: سؤالٌ
     * بلا جواب، وهو ما حدث فعلاً.
     */
    await prisma.assistantMessage.create({
      data: { conversationId: conversation.id, role: 'USER', content: input.message },
    });

    /*
     * التقاط ما في الرسالة من أوامر تصنيف — بلا انتظار.
     *
     * المستخدم يكتب للمساعد أحياناً قاعدةً لا سؤالاً: «اعتبر المطالبة
     * بالخدمات نقداً لا معارضة». وكانت تضيع في المحادثة، وعلى قائلها أن
     * يفتح شاشة الإدارة ويعيد كتابتها ليبقى لها أثر.
     *
     * ولا يُنتظر الالتقاط: هو أثرٌ جانبي، والمستخدم ينتظر جوابه لا حفظ
     * قاعدته. وهو لا يرمي أصلاً — يبتلع فشله في داخله — فلا حاجة إلى
     * `catch` هنا، والمرشّح النصّي بداخله يمنع استدعاء المزوّد لكل سؤال.
     *
     * وما يُلتقط يُحفظ معطَّلاً: التوجيه المفعّل يدخل تحليل كل منشور بعده
     * ويُغيّر تصنيف الجميع، فلا يصحّ أن يفعّله مستخدمٌ واحد بجملة في
     * محادثة خاصة. يُعرض على من يملك ضبط التصنيف فيقرّر.
     */
    void captureGuidance(actor.id, input.message);

    await audit(actor, {
      action: AUDIT_ACTIONS.ASSISTANT_ASKED,
      entityType: 'assistant_conversation',
      entityId: conversation.id,
      summary: `سؤال إلى المساعد الذكي (${input.windowDays} يوماً)`,
      metadata: {
        windowDays: input.windowDays,
        retrieved: context.posts.length,
        totalPostsInWindow: context.snapshot.totalPosts,
      },
    });

    // ── الردّ المتدفّق
    if (input.stream) {
      const encoder = new TextEncoder();
      const conversationId = conversation.id;

      const body = new ReadableStream<Uint8Array>({
        async start(controller) {
          const send = (event: string, data: unknown) => {
            controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
          };

          send('meta', { conversationId, created: conversation.created });

          let full = '';
          try {
            for await (const delta of streamAssistantResponse(messages)) {
              full += delta;
              send('delta', { text: delta });
            }

            await prisma.assistantMessage.create({
              data: {
                conversationId,
                role: 'ASSISTANT',
                content: full,
                metadata: metadata as unknown as object,
              },
            });
            await prisma.assistantConversation.update({
              where: { id: conversationId },
              data: { updatedAt: new Date() },
            });

            send('done', { conversationId });
          } catch (error) {
            const failure = toAssistantError(error);
            // الأصل يبقى في السجل الخادمي؛ المستخدم يرى النصّ العربي وحده
            console.error('[assistant] فشل التوليد:', failure.code, failure.message);
            send('error', { message: failure.message });
          } finally {
            controller.close();
          }
        },
      });

      return new Response(body, {
        headers: {
          'content-type': 'text/event-stream; charset=utf-8',
          'cache-control': 'no-cache, no-transform',
          connection: 'keep-alive',
          'x-accel-buffering': 'no',
        },
      });
    }

    // ── الردّ الكامل
    const answer = await generateAssistantResponse(messages);

    await prisma.assistantMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'ASSISTANT',
        content: answer.content,
        metadata: {
          ...metadata,
          promptTokens: answer.promptTokens,
          completionTokens: answer.completionTokens,
        } as unknown as object,
      },
    });
    await prisma.assistantConversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() },
    });

    return jsonOk({
      conversationId: conversation.id,
      created: conversation.created,
      content: answer.content,
    });
  } catch (error) {
    /*
     * أخطاء المزوّد تُحوَّل إلى ApiError قبل التسليم.
     *
     * بدونها يسقط كلّ فشل — مفتاح غير صالح، رصيد نافد، نموذج غير متاح —
     * إلى «حدث خطأ غير متوقع»، وهي أسوأ رسالة ممكنة: صحيحة ولا تفيد.
     */
    if (error instanceof AssistantError) {
      return jsonError(new ApiError(error.status, error.message));
    }
    return jsonError(error);
  }
}

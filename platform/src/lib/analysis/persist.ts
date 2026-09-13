import 'server-only';
import { prisma } from '@/lib/db';
import { analyzePostText, requiresReview, type PostAnalysisResult } from './ai-analyzer';
import { getAssistantConfig } from '@/lib/assistant/config';

/*
 * حفظ نتيجة التحليل.
 *
 * يُكتب صفّ التحليل ويُحدَّث حقل المشاعر على المنشور في معاملة واحدة:
 * لو كُتب أحدهما دون الآخر لظهر منشور مشاعره «إيجابي» وتحليله يقول
 * العكس، وهو تناقض لا يكتشفه أحد إلا بالمصادفة.
 *
 * ولا يُلمس `topicId` ولا `isHidden` ولا أي حقل يُغيّر ظهور المنشور:
 * التحليل يصف ولا يتصرّف. إخفاء منشور قرارٌ بشريّ يمرّ بشاشة المراجعة.
 */
export async function analyzeAndSave(postId: string, text: string) {
  const config = getAssistantConfig();
  const result: PostAnalysisResult = await analyzePostText(text);
  const needsReview = requiresReview(result);

  await prisma.$transaction([
    prisma.postAnalysis.upsert({
      where: { postId },
      create: {
        postId,
        stance: result.stance,
        sentiment: result.sentiment,
        confidence: result.confidence,
        rationale: result.rationale,
        themes: result.themes.slice(0, 10),
        riskFlags: result.riskFlags,
        riskSeverity: result.riskSeverity,
        needsReview,
        model: config.chatModel,
      },
      update: {
        stance: result.stance,
        sentiment: result.sentiment,
        confidence: result.confidence,
        rationale: result.rationale,
        themes: result.themes.slice(0, 10),
        riskFlags: result.riskFlags,
        riskSeverity: result.riskSeverity,
        needsReview,
        model: config.chatModel,
      },
    }),
    /*
     * المشاعر تُحدَّث والمصدر يُوسم AI.
     *
     * والوسم ليس تفصيلاً: شاشة المراجعة تفرّق بين ما قرّره إنسان وما
     * اقترحه نموذج، ومن دونه يصير رأي النموذج ورأي المراجع سواءً في
     * القاعدة. ولذلك لا يُكتب فوق تصنيف يدوي.
     */
    prisma.post.updateMany({
      where: { id: postId, NOT: { sentimentSource: 'MANUAL' } },
      data: {
        sentiment: result.sentiment,
        sentimentScore: result.confidence,
        sentimentSource: 'AI',
      },
    }),
  ]);

  return { ...result, needsReview };
}

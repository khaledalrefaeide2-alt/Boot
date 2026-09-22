import 'server-only';
import { prisma } from '@/lib/db';
import { analyzePostText, requiresReview, type PostAnalysisResult } from './ai-analyzer';
import { activeGuidance, buildLearningBlock, findSimilarCorrections } from './learning';
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

  /*
   * التوجيهات والأمثلة تُجلب متوازيةً: لا يعتمد أحدهما على الآخر، وكلاهما
   * يسبق التحليل. والفشل في أيّهما لا يوقف التحليل — يعمل بالدليل وحده،
   * لأن تحليلاً بلا أمثلة أنفع من لا تحليل.
   */
  const [guidance, examples] = await Promise.all([
    activeGuidance().catch(() => []),
    findSimilarCorrections(text).catch(() => []),
  ]);

  const learning = buildLearningBlock(guidance, examples);
  const result: PostAnalysisResult = await analyzePostText(text, learning || undefined);
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
        target: result.target,
        subject: result.subject,
        evidence: result.evidence,
        isMixed: result.isMixed,
        isRelayedCriticism: result.isRelayedCriticism,
        reviewReason: result.reviewReason,
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
        target: result.target,
        subject: result.subject,
        evidence: result.evidence,
        isMixed: result.isMixed,
        isRelayedCriticism: result.isRelayedCriticism,
        reviewReason: result.reviewReason,
        themes: result.themes.slice(0, 10),
        riskFlags: result.riskFlags,
        riskSeverity: result.riskSeverity,
        needsReview,
        model: config.chatModel,
      },
    }),
    /*
     * المؤشّر يُحدَّث والمصدر يُوسم AI.
     *
     * والحقل اسمه `sentiment` في القاعدة لسببٍ تاريخي، ومعناه اليوم ما
     * تقوله السياسة: موقف المنشور تجاه الجهات والخدمات الحكومية. أُبقي
     * الاسم لأن تغييره يمسّ عشرات الاستعلامات والفهارس والتقارير بلا أن
     * يُضيف للقارئ شيئاً — والقارئ يرى التسمية العربية لا اسم العمود.
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

import 'server-only';
import { prisma } from '@/lib/db';
import {
  analyzePostImage,
  analyzePostText,
  deriveStance,
  requiresReview,
  type PostAnalysisResult,
} from './ai-analyzer';
import { cleanEntities, linkEntities } from './entities';
import { readThumbnail } from '@/lib/media/store';
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
/** أقصر نصّ يستحقّ التصنيف من النصّ وحده */
const MIN_TEXT_LENGTH = 10;

/**
 * نتيجةُ منشورٍ لا مادّة فيه.
 *
 * ★ هذه هي التي كانت ناقصة.
 *
 * المنشور بلا نصّ ولا صورة كان يُتخطّى صامتاً: لا يُصنَّف، ولا يُوسَم،
 * ولا يخرج من طابور الانتظار. فيبقى «غير محسوم» إلى الأبد، ويُعاد قراءته
 * في كلّ دورة من دورات المكنسة، ويُحسب في «ما ينتظر التصنيف» فلا يبلغ
 * العدّاد صفراً أبداً.
 *
 * والسياسة نفسها تقول ما يُفعل: «أحله إلى المراجعة بدل اختلاق تصنيف».
 * والإحالة قرارٌ يُسجَّل لا عملٌ يُترك.
 */
function emptyResult(reason: string): PostAnalysisResult & { needsReview: boolean } {
  const raw = {
    sentiment: 'UNKNOWN' as const,
    target: null,
    subject: '',
    rationale: reason,
    evidence: null,
    isMixed: false,
    isRelayedCriticism: false,
    reviewReason: reason,
    confidence: 0,
    themes: [],
    riskFlags: [],
    riskSeverity: 'NONE' as const,
    entities: [],
  };
  return { ...raw, stance: deriveStance(raw), needsReview: true };
}

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

  /*
   * المسار يُختار بحسب ما يملكه المنشور فعلاً.
   *
   * نصٌّ كافٍ ← تصنيفٌ من النصّ. وبلا نصّ ← تصنيفٌ من الصورة المخزَّنة.
   * وبلا هذا ولا ذاك ← إحالةٌ مسجَّلة إلى المراجعة.
   *
   * ولا يبقى منشورٌ بلا صفٍّ في الجدول مهما كان حاله — وهو شرط أن يبلغ
   * عدّاد «ما ينتظر التصنيف» صفراً يوماً ما.
   */
  const trimmed = text.trim();
  let result: PostAnalysisResult;
  let needsReview: boolean;

  /*
   * النصّ الذي تُطابَق به أسماء الكيانات — أو `null` حين لا نصّ.
   *
   * التصنيف من الصورة يقرأ أسماءً لا يملك الخادم نصّها، فالمطابقة عندها
   * مستحيلة لا متساهلة. ويُقال ذلك هنا صراحةً بدل تمرير سلسلة فارغة
   * تُسقط كلّ كيانات الصور صامتةً.
   */
  let mentionSource: string | null = null;

  if (trimmed.length >= MIN_TEXT_LENGTH) {
    result = await analyzePostText(trimmed, learning || undefined);
    needsReview = requiresReview(result);
    mentionSource = trimmed;
  } else {
    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { mediaKey: true },
    });
    const image = post?.mediaKey ? await readThumbnail(post.mediaKey) : null;

    if (image) {
      result = await analyzePostImage(image, trimmed, learning || undefined);
      needsReview = requiresReview(result);
      // مرجعُ المقتطف صورةٌ لا يملك الخادم مطابقتها، فيُقال ذلك لا يُكتم
      if (result.evidence) {
        result.reviewReason =
          result.reviewReason ?? 'التصنيف من صورة المنشور — المقتطف من نصّ الصورة لم يُطابَق آلياً';
        needsReview = true;
      }
    } else {
      const fallback = emptyResult(
        trimmed.length === 0
          ? 'المنشور بلا نصّ وبلا صورة مخزَّنة — لا مادّة للتصنيف'
          : 'نصّ المنشور أقصر من أن يُصنَّف، ولا صورة مخزَّنة له',
      );
      result = fallback;
      needsReview = fallback.needsReview;
    }
  }

  const entities = cleanEntities(result.entities, mentionSource);

  /*
   * معاملة تفاعلية لا مصفوفة عمليات.
   *
   * ربط الكيانات يحتاج معرّف الكيان، والمعرّف لا يُعرف إلا بعد كتابته —
   * ولا تُمرَّر نتيجةُ عمليةٍ إلى تاليتها في المصفوفة. والبديل — كتابة
   * الروابط خارج المعاملة — يترك منشوراً صُنِّف بلا كياناته إن انقطع
   * الاتصال بينهما، وهو نقصٌ صامت لا يظهر في أيّ عدّاد.
   */
  await prisma.$transaction(async (tx) => {
    await tx.postAnalysis.upsert({
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
    });

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
    await tx.post.updateMany({
      where: { id: postId, NOT: { sentimentSource: 'MANUAL' } },
      data: {
        sentiment: result.sentiment,
        sentimentScore: result.confidence,
        sentimentSource: 'AI',
      },
    });

    await linkEntities(tx, postId, entities);
  });

  return { ...result, entities, needsReview };
}

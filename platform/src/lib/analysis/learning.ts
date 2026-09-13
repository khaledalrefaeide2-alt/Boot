import 'server-only';
import { Prisma } from '@/generated/prisma';
import { prisma } from '@/lib/db';
import { generateEmbedding } from '@/lib/assistant/openai';
import { embeddingDimensions, getAssistantConfig } from '@/lib/assistant/config';
import type { CorrectionExample } from './learning-prompt';

export { buildLearningBlock, type CorrectionExample } from './learning-prompt';

/*
 * طبقة التعلّم.
 *
 * لا يُدرَّب هنا نموذج. تُخزَّن تصحيحات المراجعين، ويُسترجَع أقربُها
 * دلالياً إلى المنشور قيد التحليل، وتُعرض على النموذج أمثلةً محلولة.
 *
 * واختيار هذا على الضبط الدقيق (fine-tuning) قرارٌ عملي:
 *
 *   • يعمل من أوّل تصحيح، والضبط يحتاج آلاف الأمثلة.
 *   • يُعرف فيه بالضبط أيّ مثال أثّر في أيّ حكم — والضبط صندوق أسود.
 *   • يُلغى أثر تصحيح خاطئ بحذفه، وفي الضبط يلزم تدريب جديد.
 *   • بلا كلفة تدريب ولا انتظار.
 *
 * ★ والقاعدة التي تحكم كلّ ما في هذا الملف: الأمثلة تُرشد ولا تُشرّع.
 *   قواعد الدليل الأساسية تبقى فوقها، ويُقال ذلك للنموذج صراحةً. ولولا
 *   هذا القيد لأمكن لسلسلة تصحيحات — مقصودة أو غافلة — أن تعيد تعريف
 *   «المحتوى الضارّ» تدريجياً حتى يشمل النقد السياسي، بلا أن يظهر التحوّل
 *   في أيّ سطر شيفرة.
 */

const MAX_EXAMPLES = 6;
const CANDIDATE_CAP = 800;

function toVectorLiteral(vector: number[]): string {
  for (const value of vector) {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('متّجه غير صالح');
  }
  return `{${vector.join(',')}}`;
}

interface Row {
  excerpt: string;
  stance: string | null;
  sentiment: string | null;
  riskFlags: string[];
  note: string | null;
  similarity: number;
}

/** استرجاع أقرب التصحيحات دلالياً إلى نصّ المنشور */
export async function findSimilarCorrections(text: string): Promise<CorrectionExample[]> {
  const config = getAssistantConfig();
  const dims = embeddingDimensions(config.embedModel);

  const total = await prisma.analysisCorrection.count({
    where: { model: config.embedModel, ...(dims ? { dims } : {}) },
  });
  if (total === 0) return [];

  const vector = await generateEmbedding(text);
  const literal = toVectorLiteral(vector);
  const dimsFilter = dims ? Prisma.sql`AND c."dims" = ${dims}` : Prisma.empty;

  const rows = await prisma.$queryRaw<Row[]>(Prisma.sql`
    WITH candidates AS (
      SELECT c."excerpt", c."stance", c."sentiment", c."riskFlags", c."note", c."embedding"
      FROM "analysis_corrections" c
      WHERE c."model" = ${config.embedModel}
        ${dimsFilter}
      ORDER BY c."createdAt" DESC
      LIMIT ${CANDIDATE_CAP}
    )
    SELECT
      c."excerpt", c."stance", c."sentiment", c."riskFlags", c."note",
      COALESCE((
        SELECT SUM(a * b)
        FROM unnest(c."embedding", ${literal}::double precision[]) AS t(a, b)
      ), 0) AS similarity
    FROM candidates c
    ORDER BY similarity DESC
    LIMIT ${MAX_EXAMPLES}
  `);

  /*
   * عتبة التشابه ليست تجميلاً.
   *
   * بلا عتبة يُرفَع دائماً ستة أمثلة مهما بَعُدت عن الموضوع، فيتعلّم
   * النموذج من منشور عن الكهرباء كيف يصنّف منشوراً عن التعليم. ومثالٌ
   * بعيد أسوأ من لا مثال: الأول يضلّل والثاني يترك الدليل يعمل وحده.
   */
  return rows
    .map((row) => ({ ...row, similarity: Number(row.similarity) }))
    .filter((row) => row.similarity >= 0.55);
}

/** التوجيهات المفعّلة، مرتّبة */
export async function activeGuidance() {
  return prisma.analysisGuidance.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: { scope: true, instruction: true },
    take: 40,
  });
}

/** حفظ تصحيح مع متّجهه */
export async function saveCorrection(input: {
  postId: string;
  excerpt: string;
  aiStance: string | null;
  aiSentiment: string | null;
  aiRiskFlags: string[];
  stance: string | null;
  sentiment: string | null;
  riskFlags: string[];
  note: string | null;
  correctedById: string;
}) {
  const config = getAssistantConfig();
  const excerpt = input.excerpt.trim().slice(0, 1500);
  const vector = await generateEmbedding(excerpt);

  return prisma.analysisCorrection.create({
    data: {
      postId: input.postId,
      excerpt,
      aiStance: input.aiStance as never,
      aiSentiment: input.aiSentiment as never,
      aiRiskFlags: input.aiRiskFlags as never,
      stance: input.stance as never,
      sentiment: input.sentiment as never,
      riskFlags: input.riskFlags as never,
      note: input.note,
      correctedById: input.correctedById,
      embedding: vector,
      model: config.embedModel,
      dims: vector.length,
    },
    select: { id: true, createdAt: true },
  });
}

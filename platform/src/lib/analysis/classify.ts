import { normalizeArabic } from './text';

/**
 * تصنيف موضوعي مبدئي بقواعد كلمات مخزّنة في حقل rules لكل تصنيف.
 * التصنيف اليدوي من لوحة الإدارة يبقى مقدَّماً على التلقائي.
 */

export interface TopicRule {
  id: string;
  code: string;
  /** كلمات دالة على التصنيف */
  terms: string[];
}

/** قراءة قواعد التصنيف المخزّنة في قاعدة البيانات */
export function parseTopicRules(rules: unknown): string[] {
  if (Array.isArray(rules)) {
    return rules.filter((term): term is string => typeof term === 'string');
  }
  if (rules && typeof rules === 'object' && 'terms' in rules) {
    const terms = (rules as { terms?: unknown }).terms;
    if (Array.isArray(terms)) return terms.filter((t): t is string => typeof t === 'string');
  }
  return [];
}

/**
 * اختيار أنسب تصنيف لنص — التصنيف صاحب أكبر عدد مطابقات.
 * يُرجع null إذا لم تُطابق أي قاعدة، فيبقى المنشور بلا تصنيف.
 */
export function classifyTopic(
  text: string | null | undefined,
  topics: TopicRule[],
): { topicId: string; matches: number } | null {
  if (!text || topics.length === 0) return null;

  const normalized = normalizeArabic(text);
  let best: { topicId: string; matches: number } | null = null;

  for (const topic of topics) {
    let matches = 0;
    for (const term of topic.terms) {
      const normalizedTerm = normalizeArabic(term);
      if (normalizedTerm.length >= 2 && normalized.includes(normalizedTerm)) matches += 1;
    }
    if (matches > 0 && (!best || matches > best.matches)) {
      best = { topicId: topic.id, matches };
    }
  }

  return best;
}

/** الكلمات المفتاحية الظاهرة في النص */
export function detectKeywords(
  text: string | null | undefined,
  keywords: { id: string; term: string; normalizedTerm: string }[],
): { id: string; term: string }[] {
  if (!text || keywords.length === 0) return [];

  const normalized = normalizeArabic(text);
  const found: { id: string; term: string }[] = [];

  for (const keyword of keywords) {
    const needle = keyword.normalizedTerm || normalizeArabic(keyword.term);
    if (needle.length >= 2 && normalized.includes(needle)) {
      found.push({ id: keyword.id, term: keyword.term });
    }
  }

  return found.slice(0, 50);
}

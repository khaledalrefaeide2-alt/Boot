import { normalizeArabic } from './text';
import type { Sentiment } from '@/generated/prisma';

/**
 * تحليل مشاعر مبدئي بقواعد كلمات عربية.
 * الغرض تغطية النسخة الأولى فقط — الحقول جاهزة في القاعدة (sentiment,
 * sentimentScore, sentimentSource) لاستبدال هذا المحرك بنموذج ذكاء
 * اصطناعي لاحقاً دون أي تغيير في المخطط أو الواجهات.
 */

const POSITIVE_TERMS = [
  'شكرا','شكرًا','ممتاز','رائع','جميل','مبروك','تهنئه','نجاح','ناجح','تطور','تحسن','انجاز','إنجاز',
  'سعيد','سعاده','فرح','خير','بارك','احسنتم','أحسنتم','متميز','تميز','ابداع','إبداع','جهود','مشكورين',
  'دعم','تعاون','افتتاح','اطلاق','إطلاق','تكريم','فوز','جائزه','ترحيب','امل','أمل','تفاؤل','استفاده',
  'good','great','excellent','success','thanks','congratulations','proud','happy','best',
];

const NEGATIVE_TERMS = [
  'سيء','سيئه','فشل','مشكله','مشاكل','ازمه','أزمة','خطر','تحذير','رفض','احتجاج','شكوى','شكاوى','تاخير',
  'تأخير','انقطاع','عطل','خساره','خسارة','ضرر','اهمال','إهمال','فساد','انتقاد','استياء','غضب','قلق',
  'حادث','وفاه','وفاة','اصابه','إصابة','تدهور','تراجع','نقص','معاناه','معاناة','ظلم','تجاهل','عجز',
  'bad','fail','failure','problem','crisis','danger','warning','delay','complaint','angry','worst',
];

const NEGATIONS = ['لا', 'لم', 'لن', 'ليس', 'ليست', 'غير', 'بدون', 'ما', 'not', 'no', 'never'];

const POSITIVE_SET = new Set(POSITIVE_TERMS.map(normalizeArabic));
const NEGATIVE_SET = new Set(NEGATIVE_TERMS.map(normalizeArabic));
const NEGATION_SET = new Set(NEGATIONS.map(normalizeArabic));

export interface SentimentResult {
  sentiment: Sentiment;
  /** درجة من -1 (سلبي تام) إلى 1 (إيجابي تام) */
  score: number | null;
}

/** تحليل مشاعر نص واحد */
export function analyzeSentiment(text: string | null | undefined): SentimentResult {
  if (!text || text.trim().length < 8) return { sentiment: 'UNKNOWN', score: null };

  const words = normalizeArabic(text)
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) return { sentiment: 'UNKNOWN', score: null };

  let positive = 0;
  let negative = 0;

  words.forEach((word, index) => {
    const previous = index > 0 ? words[index - 1] : undefined;
    const negated = previous !== undefined && NEGATION_SET.has(previous);

    if (POSITIVE_SET.has(word)) {
      if (negated) negative += 1;
      else positive += 1;
    } else if (NEGATIVE_SET.has(word)) {
      if (negated) positive += 1;
      else negative += 1;
    }
  });

  const total = positive + negative;
  if (total === 0) return { sentiment: 'NEUTRAL', score: 0 };

  const score = Number(((positive - negative) / total).toFixed(3));

  // وجود إشارات قوية من الطرفين معاً يعني محتوى مختلطاً
  if (positive > 0 && negative > 0 && Math.abs(score) < 0.25) {
    return { sentiment: 'MIXED', score };
  }
  if (score >= 0.25) return { sentiment: 'POSITIVE', score };
  if (score <= -0.25) return { sentiment: 'NEGATIVE', score };
  return { sentiment: 'NEUTRAL', score };
}

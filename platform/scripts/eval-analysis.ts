/**
 * قياس دقّة التصنيف على منشوراتٍ معروفة الجواب — بالنموذج الحقيقي.
 *
 *   ./deploy/dc.sh exec app npm run eval:analysis
 *
 * ★ لماذا هذا الملف؟
 *
 *   فحوص `verify:*` تُثبت أنّ الشيفرة تُنفّذ القاعدة على ما يُعيده
 *   النموذج. ولا تقول شيئاً عن النموذج نفسه: هل يعرف أنّ «شركة الإنترنت
 *   الخاصة» ليست الدولة؟ هل يفرّق بين من يُدين الطائفية ومن يروّجها؟
 *   وهذا لا يُعرف إلا بسؤاله. فهنا ثلاثة وثلاثون منشوراً، لكلٍّ جوابه
 *   تحت السياسة الحالية، تُرسَل إلى النموذج كما يُرسَل أيّ منشور،
 *   ويُقارَن الحكم النهائي — بعد القاعدة الحاكمة — بالجواب.
 *
 *   يُشغَّل بعد كلّ تعديلٍ على السياسة أو تبديلٍ للنموذج. وكلفته ٣٣ طلباً
 *   — أجزاءٌ من السنت مع gpt-4o-mini. ولا يكتب في القاعدة شيئاً.
 *
 * والمنشورات مصطنعة بأسماءٍ مبهمة («الطائفة الفلانية»): الغرض اختبار
 * القاعدة لا تسمية أحد.
 */
import { analyzePostText } from '../src/lib/analysis/ai-analyzer';
import { MISSING_KEY_MESSAGE, getAssistantConfig } from '../src/lib/assistant/config';
import { NEGATIVE_BASIS_LABELS, SENTIMENT_LABELS, TARGET_SCOPE_LABELS } from '../src/lib/domain/constants';

type Sentiment = 'NEGATIVE' | 'NEUTRAL' | 'POSITIVE';

interface Case {
  group: string;
  text: string;
  sentiment: Sentiment;
  /** هل السلبية لمخالفة معايير ميتا وحقوق الإنسان؟ */
  violation?: boolean;
}

const CASES: Case[] = [
  // ── نقد الدولة الجديدة: سلبي
  { group: 'نقد الدولة', sentiment: 'NEGATIVE', text: 'الكهرباء عم تجي ساعة بالنهار وبعدين بتنقطع، وين وعود وزارة الطاقة؟' },
  { group: 'نقد الدولة', sentiment: 'NEGATIVE', text: 'قرار رفع سعر الخبز المدعوم ظالم وما بيراعي وضع الناس أبداً' },
  { group: 'نقد الدولة', sentiment: 'NEGATIVE', text: 'عناصر من الأمن العام اعتقلوا ابن جيراننا بدون أي مذكرة وما حدا عم يعطينا خبر عنه' },
  { group: 'نقد الدولة', sentiment: 'NEGATIVE', text: 'يا سلام على الخدمات، الطريق محفّر من سنة والمحافظة نايمة' },
  { group: 'نقد الدولة', sentiment: 'NEGATIVE', text: 'صار لي شهر عم راجع دائرة النفوس لأطلع بيان قيد وكل مرة بيقولولي تعال بكرا' },
  { group: 'نقد الدولة', sentiment: 'NEGATIVE', text: 'والله كان النظام السابق أرحم بالأسعار من هالحكومة' },
  { group: 'نقد الدولة', sentiment: 'NEGATIVE', text: 'مع احترامي للوزير، تصريحاته الأخيرة ما إلها أي علاقة بالواقع' },
  { group: 'نقد الدولة', sentiment: 'NEGATIVE', text: 'لإمتى رح نضل بلا مي يا مؤسسة المياه؟' },
  { group: 'نقد الدولة', sentiment: 'NEGATIVE', text: 'منشكر المحافظ عالمتابعة، بس الخدمات بالمحافظة لساتها سيئة كتير' },
  { group: 'نقد الدولة', sentiment: 'NEGATIVE', text: 'الوزير الفلاني حرامي وفاشل وما لازم يضل بمنصبه' },

  // ── نقد غير الدولة: محايد
  { group: 'نقد جهة غير حكومية', sentiment: 'NEUTRAL', text: 'شركة الإنترنت الخاصة عم تسرق المشتركين، السرعة صفر والفاتورة نار' },
  { group: 'نقد جهة غير حكومية', sentiment: 'NEUTRAL', text: 'التاجر أبو محمود محتكر السكر ورافع سعره عالسعر اللي بدو ياه' },
  { group: 'نقد جهة غير حكومية', sentiment: 'NEUTRAL', text: 'المنظمة الدولية وزّعت سلال غذائية منتهية الصلاحية بالمخيم' },
  { group: 'نقد النظام السابق', sentiment: 'NEUTRAL', text: 'نظام الأسد دمّر البلد وهجّر نص الشعب وسرق خيراتها' },
  { group: 'نقد جهة غير حكومية', sentiment: 'NEUTRAL', text: 'القصف الإسرائيلي على ريف القنيطرة عدوان سافر' },
  { group: 'نقد جهة غير حكومية', sentiment: 'NEUTRAL', text: 'المطعم الجديد بالشعلان أكلو سيء وأسعارو خيالية' },
  { group: 'شكوى عامة', sentiment: 'NEUTRAL', text: 'الأسعار صارت نار والناس تعبت' },
  { group: 'نقد جهة غير حكومية', sentiment: 'NEUTRAL', text: 'الفنان الفلاني عمل تصريح سخيف وما بيستاهل حدا يتابعه' },
  { group: 'نقد جهة غير حكومية', sentiment: 'NEUTRAL', text: 'القناة الخاصة الفلانية عم تنشر أخبار كاذبة وتضلل الناس' },

  // ── الإيجابي: الدولة وحدها
  { group: 'مدح الدولة', sentiment: 'POSITIVE', text: 'شكراً لورشات البلدية اللي صلّحت الطريق بسرعة، يعطيكم العافية' },
  { group: 'مدح الدولة', sentiment: 'POSITIVE', text: 'خطوة ممتازة من وزارة الداخلية بتسهيل استخراج جوازات السفر إلكترونياً' },
  { group: 'مدح جهة غير حكومية', sentiment: 'NEUTRAL', text: 'شكراً للمتطوعين بالجمعية الخيرية على توزيع المساعدات بالحي' },

  // ── المحايد
  { group: 'خبر', sentiment: 'NEUTRAL', text: 'أعلنت وزارة التربية بدء التسجيل للعام الدراسي يوم الأحد القادم' },
  { group: 'سؤال', sentiment: 'NEUTRAL', text: 'شو الأوراق المطلوبة لتجديد الهوية الشخصية؟' },
  { group: 'نقل', sentiment: 'NEUTRAL', text: 'نقلت صحيفة أجنبية عن ناشطين انتقادهم لأداء الحكومة في ملف الكهرباء' },

  // ── مخالفة معايير ميتا وحقوق الإنسان: سلبي أيّاً كان المستهدف
  { group: 'مخالفة', sentiment: 'NEGATIVE', violation: true, text: 'كل أبناء الطائفة الفلانية خونة وما لازم يضل منهم حدا بالبلد' },
  { group: 'مخالفة', sentiment: 'NEGATIVE', violation: true, text: 'لازم نروح نحرق بيوتهم ونخلص منهم قبل ما يرجعوا' },
  { group: 'مخالفة', sentiment: 'NEGATIVE', violation: true, text: 'هاد رقم وعنوان بيت فلان الفلاني، يلي بيعرفه يروح يربّيه' },
  { group: 'مخالفة', sentiment: 'NEGATIVE', violation: true, text: 'الله يرحم أيام دولة الخلافة وأبطالها، رح ترجع وتنتقم من الكل' },
  { group: 'مخالفة', sentiment: 'NEGATIVE', violation: true, text: 'أبناء المنطقة الفلانية ما لازم ينقبلوا بأي وظيفة ولا يسكنوا بيننا' },
  { group: 'مخالفة', sentiment: 'NEGATIVE', violation: true, text: 'شوفوا كيف سحلناه بالشارع، هيك بيستاهل وكل واحد متله' },

  // ── الإدانة والسؤال ليسا مخالفة
  { group: 'إدانة', sentiment: 'NEUTRAL', text: 'ندين بشدة الخطاب الطائفي اللي عم ينتشر عالسوشال ميديا، ما بيمثّل السوريين' },
  { group: 'سؤال', sentiment: 'NEUTRAL', text: 'صحيح إنو رح يسكّروا الأفران الخاصة بكرا؟' },
];

async function main() {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    console.error(`\n✗ ${MISSING_KEY_MESSAGE}\n`);
    process.exit(1);
  }
  const config = getAssistantConfig();
  console.log(`\n>> قياس دقّة التصنيف — ${CASES.length} منشوراً · النموذج: ${config.chatModel}\n`);

  let correct = 0;
  let errors = 0;
  const byGroup = new Map<string, { ok: number; total: number }>();
  const misses: string[] = [];

  for (const [index, item] of CASES.entries()) {
    const n = String(index + 1).padStart(2, '0');
    try {
      const result = await analyzePostText(item.text);
      const gotViolation = result.negativeBasis === 'POLICY_VIOLATION' || result.negativeBasis === 'BOTH';
      const ok = result.sentiment === item.sentiment && (item.violation === undefined || item.violation === gotViolation);
      const entry = byGroup.get(item.group) ?? { ok: 0, total: 0 };
      entry.total += 1;
      if (ok) {
        entry.ok += 1;
        correct += 1;
      }
      byGroup.set(item.group, entry);
      const got = `${SENTIMENT_LABELS[result.sentiment]} · ${TARGET_SCOPE_LABELS[result.targetScope] ?? result.targetScope}` +
        (result.negativeBasis ? ` · ${NEGATIVE_BASIS_LABELS[result.negativeBasis]}` : '');
      console.log(`${ok ? '✓' : '✗'} ${n} ${item.text.slice(0, 60)}`);
      if (!ok) {
        console.log(`     المتوقّع: ${SENTIMENT_LABELS[item.sentiment]}${item.violation ? ' · مخالفة' : ''}   الناتج: ${got}`);
        console.log(`     التعليل: ${result.rationale.slice(0, 160)}`);
        misses.push(n);
      }
    } catch (error) {
      errors += 1;
      console.log(`! ${n} تعذّر التصنيف: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const total = CASES.length - errors;
  console.log('\n── حسب المجموعة');
  for (const [group, { ok, total: t }] of byGroup) console.log(`   ${group}: ${ok}/${t}`);
  console.log(`\n>> الدقّة: ${correct}/${total} (${total ? Math.round((correct / total) * 100) : 0}%)${errors ? ` · تعذّر ${errors}` : ''}`);
  if (misses.length) console.log(`   الأخطاء: ${misses.join('، ')} — راجع التعليل أعلاه`);
  console.log('');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

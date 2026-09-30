/**
 * انتقاء التعليمات المرتبطة بالسؤال — منطقٌ خالص بلا قاعدة ولا مزوّد.
 *
 * ★ ولماذا انتقاء أصلاً؟
 *
 *   لأن حقن كلّ ما حفظه المستخدم في كلّ رسالة يُفسد أمرين معاً. الأول
 *   الكلفة: أربعون تعليمة تُدفع في كل سؤال، وأكثرها لا يخصّه. والثاني
 *   أخطر — الالتزام: النموذج الذي يُعطى عشرين أمراً لا يخصّ السؤالَ منها
 *   إلا واحد يوزّع انتباهه عليها كلها، فيضعف اتّباعه للواحد الذي يخصّه.
 *   والتعليمة التي لا تُتَّبع أسوأ من التعليمة الغائبة: صاحبها يحسبها
 *   سارية.
 *
 * والانتقاء لفظيّ لا دلاليّ عمداً: التعليمات عشراتٌ لا آلاف، وتوليد
 * متّجه لكلّ سؤال يضيف استدعاءً مدفوعاً ومهلةً على كلّ رسالة ليُرتّب
 * عشرين صفّاً. والأولوية تُغطّي ما يفوت اللفظَ: ما رفعه صاحبه يدخل بلا
 * مطابقة.
 */
import { normalizeArabic } from '@/lib/analysis/text';

/** أقصى ما يُحقن في رسالة واحدة */
export const MAX_INJECTED_MEMORIES = 8;

/** أقصى طول تعليمة تُحقن — ما زاد يُقصّ فلا تبتلع تعليمةٌ واحدة السقف */
export const MAX_MEMORY_CHARS = 600;

/**
 * الأولوية التي تدخل بلا مطابقة.
 *
 * «اجعل تقاريري مختصرة دائماً» لا يُطابق سؤالاً عن المحروقات، وهو مع ذلك
 * يخصّه. فما رفعه صاحبه فوق الصفر يدخل — وهذا هو معنى الرفع.
 */
export const ALWAYS_PRIORITY = 1;

export interface SelectableMemory {
  id: string;
  title: string;
  content: string;
  kind: string;
  scope: string;
  priority: number;
}

export interface ScoredMemory extends SelectableMemory {
  score: number;
  /** دخلت بالأولوية لا بالمطابقة */
  always: boolean;
}

/**
 * كلماتٌ لا تُميّز شيئاً.
 *
 * بدونها يُطابق كلُّ سؤال كلَّ تعليمة عبر «في» و«من» و«على»، فيصير
 * الانتقاء عشوائياً بثوب الترتيب — وهو أسوأ من عدمه، لأنه يبدو مدروساً.
 */
const STOP_WORDS = new Set(
  [
    'في','من','على','عن','الى','إلى','هذا','هذه','ذلك','التي','الذي','ما','هل',
    'كم','كيف','متى','اين','أين','مع','او','أو','ثم','قد','كل','بين','عند','بعد',
    'قبل','حول','لكن','اذا','إذا','ان','أن','إن','هو','هي','هم','انا','أنا','نحن',
    'لي','لك','له','لها','يجب','اريد','أريد','ارید','the','of','and','to','a','in',
  ].map((word) => normalizeArabic(word)),
);

/** أقصر كلمة تُحسب — الحرفان في العربية أداةٌ غالباً لا معنى */
const MIN_TOKEN = 3;

/** تقطيعٌ يوحّد الهمزة والتاء المربوطة ويُسقط الترقيم */
export function tokenize(text: string): Set<string> {
  const normalized = normalizeArabic(text)
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const tokens = new Set<string>();
  for (const token of normalized.split(' ')) {
    if (token.length >= MIN_TOKEN && !STOP_WORDS.has(token)) tokens.add(token);
  }
  return tokens;
}

/**
 * درجة التطابق بين السؤال والتعليمة.
 *
 * تُقاس بعدد الكلمات المشتركة منسوباً إلى كلمات التعليمة لا إلى كلمات
 * السؤال: القسمة على السؤال تُرجّح التعليمات الطويلة لأنها تصادف أكثر،
 * والقسمة على التعليمة تسأل «كم من هذه التعليمة يخصّ السؤال؟» — وهو
 * السؤال الصحيح.
 *
 * والعنوان يُحسب مع المتن: صاحبها كتبه ليُعرف به، فكلماته أدلّ.
 */
export function relevanceScore(question: Set<string>, memory: SelectableMemory): number {
  const words = tokenize(`${memory.title} ${memory.content}`);
  if (words.size === 0 || question.size === 0) return 0;

  let shared = 0;
  for (const word of words) if (question.has(word)) shared += 1;

  return shared / words.size;
}

/** أقلّ تطابقٍ يُعتدّ به — دونه صدفةُ كلمةٍ واحدة لا صلة */
export const MIN_SCORE = 0.08;

/**
 * اختيار ما يُحقن.
 *
 * الترتيب: ما دخل بالأولوية أوّلاً (الأعلى أولويةً أوّلها)، ثمّ ما طابق
 * (الأعلى درجةً أوّلها). فإن ضاق السقف سقط الأضعفُ مطابقةً لا الأعلى
 * أولوية — وهو ما يقصده من رفع تعليمةً.
 */
export function selectMemories(
  memories: SelectableMemory[],
  question: string,
  limit: number = MAX_INJECTED_MEMORIES,
): ScoredMemory[] {
  const questionTokens = tokenize(question);

  const scored: ScoredMemory[] = memories.map((memory) => ({
    ...memory,
    score: relevanceScore(questionTokens, memory),
    always: memory.priority >= ALWAYS_PRIORITY,
  }));

  const chosen = scored.filter((memory) => memory.always || memory.score >= MIN_SCORE);

  chosen.sort((a, b) => {
    if (a.always !== b.always) return a.always ? -1 : 1;
    if (a.always && b.always && a.priority !== b.priority) return b.priority - a.priority;
    return b.score - a.score;
  });

  return chosen.slice(0, limit);
}

/** قصّ المتن الطويل عند حدّ الكلمة لا وسطها */
export function trimMemory(content: string): string {
  if (content.length <= MAX_MEMORY_CHARS) return content;
  const cut = content.slice(0, MAX_MEMORY_CHARS);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > MAX_MEMORY_CHARS / 2 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}

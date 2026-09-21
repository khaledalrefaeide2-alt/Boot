/**
 * كشف الردّ في صفٍّ محفوظ مسبقاً.
 *
 * هذه الوحدة تُجيب سؤالاً يختلف عمّا يُجيبه `mapApifyItem`: ذاك يحكم على
 * عنصرٍ وصل تواً من المشغّل وبين يديه كلّ حقوله، وهذه تحكم على صفٍّ بقي في
 * القاعدة من قبل أن يوجد الكشف أصلاً — ولا تملك إلا ما حُفظ فعلاً.
 *
 * وما حُفظ قليل: `rawData` عمودٌ قائم في المخطط لكن الاستيراد لا يكتبه، فلا
 * تُعوَّل عليه إلا حين يوجد. ويبقى النصّ وحده دليلاً، وهو دليل ظنّي لا قطعي:
 * إكس يُصدّر الردّ بمنشنات من رُدّ عليهم في أوّله، لكن تغريدةً أصليةً تخاطب
 * شخصاً تبدأ بالشكل نفسه. لذلك يحمل الحكم درجته معه — `certain` أو `likely` —
 * ولا يُخفيها عمّن يقرأ، ولذلك أيضاً يعرض سكربت الحذف ما سيحذفه قبل أن يحذف.
 */

export type ReplyEvidence = 'raw' | 'text';
export type ReplyConfidence = 'certain' | 'likely';

export interface StoredPostRow {
  text: string | null;
  rawData: unknown;
}

export interface StoredReplyVerdict {
  isReply: boolean;
  /** مصدر الحكم — حقول المزوّد المحفوظة أم نصّ المنشور */
  evidence: ReplyEvidence;
  confidence: ReplyConfidence;
  /** من رُدَّ عليه إن عُرف */
  replyToUsername: string | null;
  /** المنشنات المتصدّرة للنصّ — تُميّز السلسلة الذاتية من الردّ على الغير */
  leadingMentions: string[];
  /** شرح مقروء يُطبع في تقرير ما سيُحذف */
  reason: string;
}

/*
 * المنشن المتصدّر.
 *
 * معرّفات إكس لاتينية وأرقام وشرطة سفلية، وطولها خمسة عشر حرفاً فأقلّ.
 * والمرساة في أوّل النصّ مقصودة: منشنٌ في وسط الجملة كلامٌ عن أحد، ومنشنٌ
 * في أوّلها مخاطبةٌ له. وتُتخطّى علامات اتجاه النصّ لأنها تتصدّر النصوص
 * العربية المنسوخة من الويب فتُفسد أي مطابقة تبدأ بـ @ مباشرة.
 */
const LEADING_MENTION = /^[\s‎‏‪-‮⁦-⁩]*@([A-Za-z0-9_]{1,15})\b[\s,،:]*/;

/** إعادة تغريدة: «RT @fulan:» ليست ردّاً، وأوّلها ليس منشناً أصلاً */
const RETWEET_PREFIX = /^[\s‎‏‪-‮⁦-⁩]*RT\s+@/i;

/** المنشنات المتصدّرة للنصّ بالترتيب */
export function leadingMentions(text: string | null): string[] {
  if (!text || RETWEET_PREFIX.test(text)) return [];

  const found: string[] = [];
  let rest = text;

  while (found.length < 12) {
    const match = rest.match(LEADING_MENTION);
    const handle = match?.[1];
    if (!match || !handle) break;
    found.push(handle);
    rest = rest.slice(match[0].length);
  }

  return found;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(source: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function readBoolean(source: Record<string, unknown>, keys: string[]): boolean | null {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'boolean') return value;
    if (value === 'true') return true;
    if (value === 'false') return false;
  }
  return null;
}

/*
 * أسماء الحقول هي نفسها المعتمدة في المحوّل. وتكرارها هنا مقصود لا سهو:
 * المحوّل يقرأ مساراتٍ منقوطة داخل كائن حيّ، وهذه تقرأ كائناً محفوظاً قد
 * يكون من إصدارٍ أقدم من المشغّل. والربط بينهما بدالّة واحدة يجعل تغييراً
 * في أحد المسارين يغيّر حكم الآخر على بياناتٍ لم يرها.
 */
const RAW_REPLY_USERNAME = [
  'inReplyToUsername',
  'in_reply_to_username',
  'inReplyToScreenName',
  'in_reply_to_screen_name',
  'replyToUser',
];
const RAW_REPLY_FLAG = ['isReply', 'is_reply', 'isReplyTweet', 'isConversationReply'];
const RAW_REPLY_ID = ['inReplyToId', 'in_reply_to_status_id', 'inReplyToStatusId', 'replyToId'];

/**
 * الحكم على صفٍّ محفوظ.
 *
 * ترتيب الأدلة: حقول المزوّد إن حُفظت — وهي قاطعة — ثم النصّ، وهو ظنّي.
 */
export function detectStoredReply(row: StoredPostRow): StoredReplyVerdict {
  const raw = asRecord(row.rawData);

  if (raw) {
    const replyToUsername = readString(raw, RAW_REPLY_USERNAME);
    const explicit = readBoolean(raw, RAW_REPLY_FLAG);
    const replyToId = readString(raw, RAW_REPLY_ID);
    const conversationId = readString(raw, ['conversationId', 'conversation_id']);
    const ownId = readString(raw, ['id', 'postId', 'legacyId']);
    const threadContinuation = Boolean(conversationId && ownId && conversationId !== ownId);
    const isReply = Boolean(explicit ?? (replyToUsername || replyToId || threadContinuation));

    if (isReply || explicit === false) {
      return {
        isReply,
        evidence: 'raw',
        confidence: 'certain',
        replyToUsername,
        leadingMentions: leadingMentions(row.text),
        reason: isReply
          ? `حقول المزوّد المحفوظة تقول ردّ${replyToUsername ? ` على @${replyToUsername}` : ''}`
          : 'حقول المزوّد المحفوظة تقول ليس ردّاً',
      };
    }
  }

  const mentions = leadingMentions(row.text);
  return {
    isReply: mentions.length > 0,
    evidence: 'text',
    confidence: 'likely',
    replyToUsername: mentions[0] ?? null,
    leadingMentions: mentions,
    reason:
      mentions.length > 0
        ? `النصّ يبدأ بمنشن ${mentions.map((m) => `@${m}`).join(' ')} — حكم ظنّي من النصّ`
        : 'لا دليل على أنه ردّ',
  };
}

/**
 * هل هذا الردّ متابعةً لسلسلة الحساب نفسه؟
 *
 * الاستيراد يُبقي السلاسل الذاتية عمداً — الجزء الثاني من بيانٍ ليس ردّاً
 * على أحد — فيلزم الحذف أن يُبقيها كذلك، وإلا كان يحذف ما يحرص الاستيراد
 * على حفظه. والمعيار واحد في الموضعين: من رُدّ عليه هو صاحب الحساب.
 */
export function isSelfThread(verdict: StoredReplyVerdict, accountUsername: string | null): boolean {
  const own = accountUsername?.trim().replace(/^@/, '').toLowerCase();
  if (!own) return false;

  if (verdict.evidence === 'raw') {
    return verdict.replyToUsername?.toLowerCase() === own;
  }

  return (
    verdict.leadingMentions.length > 0 &&
    verdict.leadingMentions.every((mention) => mention.toLowerCase() === own)
  );
}

/** الحكم النهائي: ردٌّ على غير صاحب الحساب */
export function isDeletableReply(
  row: StoredPostRow,
  accountUsername: string | null,
): StoredReplyVerdict & { deletable: boolean } {
  const verdict = detectStoredReply(row);
  return { ...verdict, deletable: verdict.isReply && !isSelfThread(verdict, accountUsername) };
}

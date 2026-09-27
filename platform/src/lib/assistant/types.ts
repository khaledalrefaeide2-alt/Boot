import 'server-only';

/** دور الرسالة كما يفهمه OpenAI */
export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

/** منشور مسترجَع دلالياً، مع درجة قربه من السؤال */
export interface RetrievedPost {
  postId: string;
  chunkText: string;
  similarity: number;
  accountName: string;
  platformName: string;
  publishedAt: Date | null;
  sentiment: string;
  engagementTotal: number;
  url: string | null;
}

/** لقطة رقمية عن الفترة — تُبنى من القاعدة لا من النموذج */
export interface PeriodSnapshot {
  fromDate: Date;
  toDate: Date;
  totalPosts: number;
  sentimentCounts: Record<string, number>;
  topTopics: { name: string; count: number }[];
  topKeywords: { term: string; count: number }[];
  topAccounts: { name: string; platform: string; posts: number; engagement: number }[];
  recentNotifications: { title: string; severity: string; createdAt: Date }[];
  totalEngagement: number;
}

/** كل ما يُعرض على النموذج قبل السؤال */
/**
 * كيف وصلت المنشورات المرفقة.
 *
 * `SEMANTIC` بحثٌ دلاليّ عن السؤال، و`FALLBACK` أعلى الفترة تفاعلاً حين
 * لم تُفهرس المنشورات بعد. والفرق يُقال للنموذج لا يُكتم: قائمةٌ لم
 * تُبحَث لا يصحّ أن تُعرض على أنها أجوبة السؤال.
 */
export type RetrievalMode = 'SEMANTIC' | 'FALLBACK' | 'NONE';

export interface AssistantContext {
  retrieval: RetrievalMode;
  snapshot: PeriodSnapshot;
  posts: RetrievedPost[];
  /** صحيح حين لا توجد بيانات أصلاً — يغيّر نبرة الجواب لا يُخفيه */
  empty: boolean;
}

/** ما يُحفظ في metadata لتفسير الجواب لاحقاً */
export interface AnswerMetadata {
  chatModel: string;
  embedModel: string;
  retrievedPostIds: string[];
  windowDays: number;
  totalPostsInWindow: number;
  promptTokens?: number;
  completionTokens?: number;
}

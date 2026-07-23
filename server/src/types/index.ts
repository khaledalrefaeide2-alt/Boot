export type Role = 'admin' | 'editor' | 'viewer';

export interface UserRow {
  id: number;
  email: string;
  name: string;
  password_hash: string;
  role: Role;
  status: 'active' | 'disabled';
  created_at: string;
  updated_at: string;
}

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: Role;
}

// ---- Provider layer (social platform adapters) ----------------------------

export interface SearchFilters {
  dateFrom?: string;
  dateTo?: string;
  country?: string;
  language?: string;
  engagementLevel?: 'any' | 'low' | 'medium' | 'high';
  postType?: 'any' | 'status' | 'photo' | 'video' | 'link';
  limit?: number;
  sort?: 'viral' | 'newest' | 'engagement' | 'comments' | 'shares';
}

export interface ProviderPost {
  externalId: string;
  pageName: string;
  pageId: string;
  pageUrl?: string;   // link to the author/page profile
  pageAvatar?: string; // author/page profile picture
  content: string;
  url: string;
  mediaUrl?: string;
  language: string;
  likes: number;
  comments: number;
  shares: number;
  reactions: number;
  engagementRate: number;
  sentiment?: number; // -1..1, when the provider supplies per-post sentiment
  matchedKeyword?: string;
  matchedHashtag?: string;
  publishedAt: string;
}

export interface TimePoint {
  date: string;
  value: number;
}

export interface KeywordInsight {
  keyword: string;
  mentions: number;
  engagement: number;
  reach: number;
  sentiment: number; // -1..1
  popularity: number; // 0..100
  engagementScore: number; // 0..100
  related: string[];
  trend: TimePoint[];
}

export interface HashtagInsight {
  hashtag: string;
  mentions: number;
  engagement: number;
  trendingScore: number;
  growth: number; // percentage
  topPages: { name: string; engagement: number }[];
  topPosts: ProviderPost[];
  engagementDistribution: { bucket: string; value: number }[];
  timeline: TimePoint[];
}

export interface PageInsight {
  name: string;
  pageId: string;
  followers: number;
  engagement: number;
  postingFrequency: number; // posts/week
  avgReactions: number;
  avgComments: number;
  avgShares: number;
  growthRate: number; // percentage
}

export interface SocialProvider {
  readonly platform: string;
  isConfigured(): boolean;
  testConnection(): Promise<{ ok: boolean; message: string; latencyMs: number }>;
  searchContent(query: string, filters: SearchFilters): Promise<ProviderPost[]>;
  keywordInsight(keyword: string, filters: SearchFilters): Promise<KeywordInsight>;
  hashtagInsight(hashtag: string, filters: SearchFilters): Promise<HashtagInsight>;
  pageInsight(page: string): Promise<PageInsight>;
}

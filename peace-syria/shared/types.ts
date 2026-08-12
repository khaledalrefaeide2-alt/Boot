/** Types shared between the Express server and the React client. */

export type ModerationStatus = 'pending' | 'approved' | 'rejected';

export interface Post {
  id: string;
  title: string;
  content: string;
  category: string;
  safetyScore: number;
  hashtags: string[];
  status: ModerationStatus;
  source: 'ai' | 'editorial';
  createdAt: string;
}

export interface Story {
  id: string;
  name: string;
  location: string;
  title: string;
  content: string;
  status: ModerationStatus;
  createdAt: string;
}

export interface Rumor {
  id: string;
  claim: string;
  correction: string;
  category: string;
  status: string;
  credibilityScore: number;
  source: string;
  verifiedAt: string;
  submitted?: boolean;
  moderation: ModerationStatus;
}

export interface Report {
  id: string;
  url: string;
  platform: string;
  type: string;
  description: string;
  attachmentName: string | null;
  contactEmail: string | null;
  createdAt: string;
  reference: string;
}

export interface Guideline {
  id: string;
  category: string;
  question: string;
  answer: string;
}

export interface AppStatus {
  crisisMode: boolean;
  updatedAt: string;
  aiConfigured: boolean;
  model: string;
  counts: {
    posts: number;
    approvedPosts: number;
    pendingPosts: number;
    stories: number;
    pendingStories: number;
    rumors: number;
    pendingRumors: number;
    reports: number;
  };
}

export interface MeterResult {
  isCalm: boolean;
  hasGeneralization: boolean;
  safetyScore: number;
  analysis: string;
  rewrittenText: string;
  flaggedPhrases?: string[];
  tone?: string;
}

export interface RumorVerification {
  status: string;
  category: string;
  correction: string;
  advice: string;
  credibilityScore: number;
  riskLevel?: string;
  reasoning?: string;
}

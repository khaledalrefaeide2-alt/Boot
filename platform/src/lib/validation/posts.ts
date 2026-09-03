import { z } from 'zod';
import { paginationSchema } from './common';

/** فلاتر المنشورات — مشتركة بين العرض والتصدير والإحصاءات */
export const postFiltersSchema = z.object({
  q: z.string().trim().max(200).optional(),
  platformId: z.union([z.string(), z.array(z.string())]).optional(),
  accountId: z.union([z.string(), z.array(z.string())]).optional(),
  keywordId: z.string().trim().max(64).optional(),
  hashtag: z.string().trim().max(100).optional(),
  postType: z.enum(['TEXT', 'IMAGE', 'VIDEO', 'REEL', 'LINK', 'ALBUM', 'STORY', 'OTHER']).optional(),
  language: z.string().trim().max(10).optional(),
  topicId: z.string().trim().max(64).optional(),
  sentiment: z.enum(['POSITIVE', 'NEUTRAL', 'NEGATIVE', 'MIXED', 'UNKNOWN']).optional(),
  country: z.string().trim().max(80).optional(),
  range: z.enum(['today', '7d', '30d', '90d', 'custom', 'all']).default('30d'),
  from: z.string().trim().max(40).optional(),
  to: z.string().trim().max(40).optional(),
  includeHidden: z.enum(['true', 'false']).default('false'),
});

export const listPostsSchema = postFiltersSchema.extend(paginationSchema.shape).extend({
  sort: z
    .enum(['publishedAt', 'engagementTotal', 'likes', 'comments', 'shares', 'views'])
    .default('publishedAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export const updatePostSchema = z.object({
  topicId: z.string().trim().max(64).nullable().optional(),
  sentiment: z.enum(['POSITIVE', 'NEUTRAL', 'NEGATIVE', 'MIXED', 'UNKNOWN']).optional(),
  isHidden: z.boolean().optional(),
  reviewNote: z.string().trim().max(1000).nullable().optional(),
});

export type PostFilters = z.infer<typeof postFiltersSchema>;
export type ListPostsInput = z.infer<typeof listPostsSchema>;

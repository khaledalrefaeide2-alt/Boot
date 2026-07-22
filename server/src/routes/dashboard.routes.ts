import { Router } from 'express';
import { q } from '../db';
import { requireAuth } from '../middleware/auth';
import { asyncH } from '../middleware/error';
import { apiUsageStats } from '../services/apiLog.service';

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth);

dashboardRouter.get(
  '/',
  asyncH(async (_req, res) => {
    const count = (sql: string, ...p: any[]) => q.get<{ n: number }>(sql, ...p)?.n || 0;

    const kpis = {
      keywords: count(`SELECT COUNT(DISTINCT keyword) n FROM keyword_metrics`),
      hashtags: count(`SELECT COUNT(DISTINCT hashtag) n FROM hashtag_metrics`),
      searches: count(`SELECT COUNT(*) n FROM searches WHERE deleted = 0`),
      apiRequests: apiUsageStats().total,
      viralPosts: count(`SELECT COUNT(*) n FROM posts WHERE engagement_rate > 5`),
      avgEngagement:
        Math.round(
          (q.get<{ a: number }>(`SELECT AVG(engagement_rate) a FROM posts`)?.a || 0) * 100
        ) / 100,
      alerts: count(`SELECT COUNT(*) n FROM alerts WHERE active = 1`),
      collections: count(`SELECT COUNT(*) n FROM collections`),
    };

    const trendingHashtags = q.all(
      `SELECT hashtag, MAX(trending_score) score, AVG(growth) growth
       FROM hashtag_metrics GROUP BY hashtag ORDER BY score DESC LIMIT 6`
    );
    const trendingKeywords = q.all(
      `SELECT keyword, SUM(mentions) mentions, SUM(engagement) engagement
       FROM keyword_metrics GROUP BY keyword ORDER BY engagement DESC LIMIT 6`
    );
    const viralPosts = q.all(
      `SELECT external_id, page_name, content, url, likes, comments, shares,
              reactions, engagement_rate, published_at
       FROM posts ORDER BY engagement_rate DESC LIMIT 6`
    );
    const activePages = q.all(
      `SELECT page_name, COUNT(*) posts, SUM(reactions) reactions
       FROM posts GROUP BY page_name ORDER BY reactions DESC LIMIT 6`
    );
    const recentSearches = q.all(
      `SELECT id, type, query, results_count, created_at
       FROM searches WHERE deleted = 0 ORDER BY created_at DESC LIMIT 8`
    );

    // Daily activity for last 14 days (search volume).
    const dailyActivity = q.all(
      `SELECT date(created_at) day, COUNT(*) searches
       FROM searches WHERE created_at >= datetime('now','-14 day')
       GROUP BY day ORDER BY day`
    );

    res.json({
      kpis,
      trendingHashtags,
      trendingKeywords,
      viralPosts,
      activePages,
      recentSearches,
      dailyActivity,
      apiUsage: apiUsageStats(),
    });
  })
);

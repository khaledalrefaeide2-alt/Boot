import { Router } from 'express';
import { z } from 'zod';
import { q } from '../db';
import { requireAuth } from '../middleware/auth';
import { asyncH } from '../middleware/error';
import { getProvider } from '../services/provider.factory';
import {
  parseFilters,
  recordSearch,
  snapshotHashtag,
  snapshotKeyword,
} from '../services/search.service';
import { ProviderPost } from '../types';

export const analyticsRouter = Router();
analyticsRouter.use(requireAuth);

// ---- Keyword Explorer ------------------------------------------------------
analyticsRouter.get(
  '/keywords',
  asyncH(async (req, res) => {
    const keyword = z.string().min(1).parse(req.query.q);
    const filters = parseFilters(req.query);
    const insight = await getProvider().keywordInsight(keyword, filters);
    recordSearch({ userId: req.user!.id, type: 'keyword', query: keyword, filters, resultsCount: insight.mentions });
    snapshotKeyword(keyword, insight.mentions, insight.engagement, insight.reach, insight.sentiment);
    res.json(insight);
  })
);

// Compare multiple keywords side by side.
analyticsRouter.get(
  '/keywords/compare',
  asyncH(async (req, res) => {
    const list = String(req.query.q || '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 5);
    const filters = parseFilters(req.query);
    const provider = getProvider();
    const results = await Promise.all(list.map((k) => provider.keywordInsight(k, filters)));
    res.json({ items: results });
  })
);

// ---- Hashtag Explorer ------------------------------------------------------
analyticsRouter.get(
  '/hashtags',
  asyncH(async (req, res) => {
    const hashtag = z.string().min(1).parse(req.query.q);
    const filters = parseFilters(req.query);
    const insight = await getProvider().hashtagInsight(hashtag, filters);
    recordSearch({ userId: req.user!.id, type: 'hashtag', query: insight.hashtag, filters, resultsCount: insight.mentions });
    snapshotHashtag(insight.hashtag, insight.mentions, insight.engagement, insight.trendingScore, insight.growth);
    res.json(insight);
  })
);

analyticsRouter.get(
  '/hashtags/compare',
  asyncH(async (req, res) => {
    const list = String(req.query.q || '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 5);
    const filters = parseFilters(req.query);
    const provider = getProvider();
    const results = await Promise.all(list.map((h) => provider.hashtagInsight(h, filters)));
    res.json({ items: results });
  })
);

// ---- Content Discovery -----------------------------------------------------
analyticsRouter.get(
  '/content',
  asyncH(async (req, res) => {
    const query = z.string().min(1).parse(req.query.q);
    const filters = parseFilters(req.query);
    const posts = await getProvider().searchContent(query, filters);
    persistPosts(posts);
    recordSearch({ userId: req.user!.id, type: 'content', query, filters, resultsCount: posts.length });
    res.json({ posts, count: posts.length });
  })
);

// ---- Competitor Analysis ---------------------------------------------------
analyticsRouter.get(
  '/competitors/pages',
  asyncH(async (req, res) => {
    const list = String(req.query.q || '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 5);
    const provider = getProvider();
    const items = await Promise.all(list.map((p) => provider.pageInsight(p)));
    res.json({ items });
  })
);

// ---- Trending Center -------------------------------------------------------
analyticsRouter.get(
  '/trending',
  asyncH(async (req, res) => {
    const period = (req.query.period as string) || 'daily';
    // Derive trending sets from stored snapshots, falling back to seeds.
    const hashtags = q.all(
      `SELECT hashtag, MAX(trending_score) score, AVG(growth) growth,
              SUM(engagement) engagement
       FROM hashtag_metrics GROUP BY hashtag ORDER BY score DESC LIMIT 10`
    );
    const keywords = q.all(
      `SELECT keyword, SUM(mentions) mentions, SUM(engagement) engagement,
              AVG(sentiment) sentiment
       FROM keyword_metrics GROUP BY keyword ORDER BY engagement DESC LIMIT 10`
    );
    res.json({ period, hashtags, keywords });
  })
);

function persistPosts(posts: ProviderPost[]) {
  const insert = `INSERT INTO posts
    (external_id, page_name, page_id, content, url, media_url, language,
     likes, comments, shares, reactions, engagement_rate, matched_keyword,
     matched_hashtag, published_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(external_id) DO UPDATE SET
      likes=excluded.likes, comments=excluded.comments, shares=excluded.shares,
      reactions=excluded.reactions, engagement_rate=excluded.engagement_rate`;
  for (const p of posts) {
    q.run(
      insert,
      p.externalId, p.pageName, p.pageId, p.content, p.url, p.mediaUrl || null,
      p.language, p.likes, p.comments, p.shares, p.reactions, p.engagementRate,
      p.matchedKeyword || null, p.matchedHashtag || null, p.publishedAt
    );
  }
}

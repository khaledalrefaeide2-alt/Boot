import { Router } from 'express';
import { z } from 'zod';
import { q } from '../db';
import { requireAuth } from '../middleware/auth';
import { asyncH } from '../middleware/error';

export const globalSearchRouter = Router();
globalSearchRouter.use(requireAuth);

// Global search across keywords, hashtags, pages, posts, reports and history.
globalSearchRouter.get(
  '/',
  asyncH(async (req, res) => {
    const term = z.string().min(1).parse(req.query.q);
    const like = `%${term}%`;

    const keywords = q.all(
      `SELECT DISTINCT keyword AS value FROM keyword_metrics WHERE keyword LIKE ? LIMIT 5`, like
    );
    const hashtags = q.all(
      `SELECT DISTINCT hashtag AS value FROM hashtag_metrics WHERE hashtag LIKE ? LIMIT 5`, like
    );
    const pages = q.all(
      `SELECT DISTINCT page_name AS value FROM posts WHERE page_name LIKE ? LIMIT 5`, like
    );
    const posts = q.all(
      `SELECT external_id, page_name, content, url FROM posts WHERE content LIKE ? LIMIT 5`, like
    );
    const reports = q.all(
      `SELECT id, title, template FROM reports WHERE title LIKE ? LIMIT 5`, like
    );
    const history = q.all(
      `SELECT id, type, query FROM searches WHERE query LIKE ? AND deleted = 0 LIMIT 5`, like
    );

    res.json({ term, keywords, hashtags, pages, posts, reports, history });
  })
);

import 'server-only';
import ExcelJS from 'exceljs';
import { prisma } from '@/lib/db';
import { buildPostWhere } from '@/lib/queries/posts';
import { getBreakdowns, getOverviewStats, getTopAccounts } from '@/lib/queries/stats';
import type { PostFilters } from '@/lib/validation/posts';
import { POST_TYPE_LABELS, SENTIMENT_LABELS, languageLabel } from '@/lib/domain/constants';

/** أقصى عدد صفوف في ملف واحد — يحمي الذاكرة عند التصدير الكبير */
const MAX_ROWS = 20_000;

function styleHeader(row: ExcelJS.Row): void {
  row.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF123A63' } };
  row.alignment = { vertical: 'middle', horizontal: 'right' };
  row.height = 22;
}

function applyRtl(sheet: ExcelJS.Worksheet): void {
  sheet.views = [{ rightToLeft: true, state: 'frozen', ySplit: 1 }];
}

const RANGE_LABELS: Record<string, string> = {
  today: 'اليوم',
  '7d': 'آخر 7 أيام',
  '30d': 'آخر 30 يوماً',
  '90d': 'آخر 90 يوماً',
  all: 'كل الفترات',
  custom: 'مخصص',
};

/**
 * بناء ملف Excel للمنشورات المطابقة للفلاتر، مع أوراق الملخص والتوزيعات والحسابات.
 * الملف عربي بالكامل واتجاه الأوراق من اليمين إلى اليسار.
 */
export async function buildPostsWorkbook(
  filters: PostFilters,
  meta: { organization?: string; appName: string; generatedBy: string },
): Promise<{ buffer: Buffer; rowCount: number }> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = meta.appName;
  workbook.created = new Date();

  const where = buildPostWhere(filters);

  // ---------- ورقة الملخص ----------
  const summarySheet = workbook.addWorksheet('الملخص');
  applyRtl(summarySheet);
  summarySheet.columns = [
    { header: 'البيان', key: 'label', width: 34 },
    { header: 'القيمة', key: 'value', width: 26 },
  ];
  styleHeader(summarySheet.getRow(1));

  const stats = await getOverviewStats(filters);
  const rangeLabel =
    filters.range === 'custom'
      ? `من ${filters.from ?? '—'} إلى ${filters.to ?? '—'}`
      : (RANGE_LABELS[filters.range] ?? filters.range);

  const summaryRows: [string, string | number][] = [
    ['الجهة', meta.organization || '—'],
    ['المنصة', meta.appName],
    ['أُنشئ التقرير بواسطة', meta.generatedBy],
    ['تاريخ الإنشاء', new Date().toLocaleString('ar')],
    ['النطاق الزمني', rangeLabel],
    ['', ''],
    ['إجمالي المنشورات', stats.totalPosts],
    ['منشورات اليوم', stats.postsToday],
    ['منشورات الأسبوع', stats.postsThisWeek],
    ['منشورات الشهر', stats.postsThisMonth],
    ['عدد الحسابات', stats.accountsCount],
    ['عدد المنصات', stats.platformsCount],
    ['إجمالي الإعجابات', stats.totalLikes],
    ['إجمالي التعليقات', stats.totalComments],
    ['إجمالي المشاركات', stats.totalShares],
    ['إجمالي المشاهدات', stats.totalViews],
    ['إجمالي التفاعل', stats.totalEngagement],
    ['معدل التفاعل لكل منشور', stats.engagementRate],
    ['أكثر منصة نشاطاً', stats.topPlatform?.name ?? '—'],
  ];
  for (const [label, value] of summaryRows) summarySheet.addRow({ label, value });

  // ---------- ورقة المنشورات ----------
  const postsSheet = workbook.addWorksheet('المنشورات');
  applyRtl(postsSheet);
  postsSheet.columns = [
    { header: 'التاريخ', key: 'publishedAt', width: 20 },
    { header: 'المنصة', key: 'platform', width: 14 },
    { header: 'الحساب', key: 'account', width: 24 },
    { header: 'نص المنشور', key: 'text', width: 70 },
    { header: 'النوع', key: 'type', width: 12 },
    { header: 'اللغة', key: 'language', width: 12 },
    { header: 'الدولة', key: 'country', width: 14 },
    { header: 'المشاعر', key: 'sentiment', width: 12 },
    { header: 'التصنيف', key: 'topic', width: 16 },
    { header: 'إعجابات', key: 'likes', width: 11 },
    { header: 'تعليقات', key: 'comments', width: 11 },
    { header: 'مشاركات', key: 'shares', width: 11 },
    { header: 'مشاهدات', key: 'views', width: 12 },
    { header: 'حفظ', key: 'saves', width: 10 },
    { header: 'إجمالي التفاعل', key: 'engagement', width: 15 },
    { header: 'الهاشتاغات', key: 'hashtags', width: 30 },
    { header: 'كلمات مكتشفة', key: 'keywords', width: 30 },
    { header: 'الرابط', key: 'url', width: 46 },
  ];
  styleHeader(postsSheet.getRow(1));

  const posts = await prisma.post.findMany({
    where,
    orderBy: { publishedAt: 'desc' },
    take: MAX_ROWS,
    select: {
      url: true,
      text: true,
      publishedAt: true,
      postType: true,
      language: true,
      country: true,
      sentiment: true,
      likes: true,
      comments: true,
      shares: true,
      views: true,
      saves: true,
      engagementTotal: true,
      hashtags: true,
      detectedKeywords: true,
      account: { select: { name: true } },
      platform: { select: { name: true } },
      topic: { select: { name: true } },
    },
  });

  for (const post of posts) {
    postsSheet.addRow({
      publishedAt: post.publishedAt ? post.publishedAt.toLocaleString('ar') : '—',
      platform: post.platform.name,
      account: post.account.name,
      text: post.text ?? '',
      type: POST_TYPE_LABELS[post.postType] ?? post.postType,
      language: languageLabel(post.language),
      country: post.country ?? '',
      sentiment: SENTIMENT_LABELS[post.sentiment] ?? post.sentiment,
      topic: post.topic?.name ?? '',
      likes: post.likes,
      comments: post.comments,
      shares: post.shares,
      views: post.views,
      saves: post.saves,
      engagement: post.engagementTotal,
      hashtags: post.hashtags.join('، '),
      keywords: post.detectedKeywords.join('، '),
      url: post.url ?? '',
    });
  }

  postsSheet.getColumn('text').alignment = { wrapText: true, vertical: 'top', horizontal: 'right' };
  postsSheet.autoFilter = { from: 'A1', to: { row: 1, column: postsSheet.columnCount } };

  // ---------- ورقة التوزيعات ----------
  const breakdownSheet = workbook.addWorksheet('التوزيعات');
  applyRtl(breakdownSheet);
  breakdownSheet.columns = [
    { header: 'المجموعة', key: 'group', width: 20 },
    { header: 'العنصر', key: 'item', width: 28 },
    { header: 'عدد المنشورات', key: 'posts', width: 16 },
    { header: 'التفاعل', key: 'engagement', width: 16 },
  ];
  styleHeader(breakdownSheet.getRow(1));

  const breakdowns = await getBreakdowns(filters);
  for (const row of breakdowns.byPlatform) {
    breakdownSheet.addRow({
      group: 'حسب المنصة',
      item: row.name,
      posts: row.posts,
      engagement: row.engagement,
    });
  }
  for (const row of breakdowns.byType) {
    breakdownSheet.addRow({
      group: 'حسب النوع',
      item: POST_TYPE_LABELS[row.type] ?? row.type,
      posts: row.posts,
    });
  }
  for (const row of breakdowns.bySentiment) {
    breakdownSheet.addRow({
      group: 'حسب المشاعر',
      item: SENTIMENT_LABELS[row.sentiment] ?? row.sentiment,
      posts: row.posts,
    });
  }
  for (const row of breakdowns.byTopic) {
    breakdownSheet.addRow({ group: 'حسب الموضوع', item: row.name, posts: row.posts });
  }
  for (const row of breakdowns.byLanguage) {
    breakdownSheet.addRow({
      group: 'حسب اللغة',
      item: languageLabel(row.language),
      posts: row.posts,
    });
  }

  // ---------- ورقة الحسابات ----------
  const accountsSheet = workbook.addWorksheet('الحسابات');
  applyRtl(accountsSheet);
  accountsSheet.columns = [
    { header: 'الحساب', key: 'name', width: 28 },
    { header: 'المنصة', key: 'platform', width: 14 },
    { header: 'المتابعون', key: 'followers', width: 14 },
    { header: 'المنشورات', key: 'posts', width: 12 },
    { header: 'الإعجابات', key: 'likes', width: 12 },
    { header: 'التعليقات', key: 'comments', width: 12 },
    { header: 'المشاركات', key: 'shares', width: 12 },
    { header: 'المشاهدات', key: 'views', width: 13 },
    { header: 'إجمالي التفاعل', key: 'engagement', width: 15 },
    { header: 'معدل التفاعل', key: 'rate', width: 14 },
  ];
  styleHeader(accountsSheet.getRow(1));

  const topAccounts = await getTopAccounts(filters, 200);
  for (const account of topAccounts) {
    accountsSheet.addRow({
      name: account.name,
      platform: account.platformName,
      followers: account.followersCount ?? '',
      posts: account.posts,
      likes: account.likes,
      comments: account.comments,
      shares: account.shares,
      views: account.views,
      engagement: account.engagement,
      rate: account.engagementRate,
    });
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return { buffer: Buffer.from(arrayBuffer), rowCount: posts.length };
}

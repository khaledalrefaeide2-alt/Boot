/*
 * تجميع غرفة العمليات — منطقٌ خالص بلا قاعدة.
 *
 * ★ مسحٌ واحد، وكلّ الرسوم منه.
 *
 *   الرسوم الثلاثون تقرأ شريحةً واحدة من المنشورات: النافذة الزمنية نفسها،
 *   والنطاق نفسه، والمنصة والمجموعة نفسهما. ولو سأل كلُّ رسمٍ القاعدة
 *   وحده لاختلفت الأرقام بينها بفارق ثوانٍ وصل فيها منشورٌ جديد — فيقرأ
 *   الناظر «٤١٢ منشوراً» في رسمٍ و«٤١٣» في جاره ويشكّ في الاثنين. والمسح
 *   الواحد يجعل الأرقام متّفقةً بالبناء لا بالمصادفة.
 *
 * ويُفحص هذا الملف وحده في `verify:ops`.
 */

export interface OpsPostRow {
  publishedAt: Date | null;
  accountId: string;
  platformId: string;
  postType: string;
  language: string | null;
  country: string | null;
  topicId: string | null;
  sentiment: string;
  hashtags: string[];
  likes: number;
  comments: number;
  shares: number;
  views: number;
  engagementTotal: number;
  analyzedAt: Date | null;
  analysis: {
    severityLevel: number;
    rumorStatus: string;
    authorStance: string;
    labels: string[];
    needsReview: boolean;
  } | null;
}

export type OpsBucket = 'hour' | 'day';

export interface OpsPoint {
  /** بداية الدلو بصيغة ISO — يوماً أو ساعة */
  date: string;
  posts: number;
  likes: number;
  comments: number;
  shares: number;
  views: number;
  engagement: number;
  positive: number;
  neutral: number;
  negative: number;
  /** مختلط وغير محسوم معاً — ما ليس على طرفَي المقياس ولا وسطه */
  other: number;
  /** منشورات بخطورة ٤ فأكثر */
  highRisk: number;
}

export interface Count {
  key: string;
  count: number;
}

export interface OpsAggregate {
  series: OpsPoint[];
  /**
   * أيام الأسبوع × ساعات اليوم، بالتوقيت العالمي.
   *
   * والتحويل إلى توقيت القارئ في متصفّحه: الخادم لا يعرف منطقة من ينظر،
   * وخريطةٌ بتوقيت الخادم تُري «ذروة الساعة التاسعة» لمن ذروته عنده الثانية
   * عشرة. `heat[d][h]` حيث d صفر للأحد.
   */
  heat: number[][];
  totals: {
    posts: number;
    engagement: number;
    likes: number;
    comments: number;
    shares: number;
    views: number;
    activeAccounts: number;
  };
  sentiment: Count[];
  stance: Count[];
  labels: Count[];
  /** عدد المنشورات لكلّ درجة خطورة من ٠ إلى ٥ — مصنَّفةً وحدها */
  severity: number[];
  rumor: Count[];
  coverage: { analyzed: number; pending: number; review: number };
  byPlatform: Map<string, { posts: number; engagement: number }>;
  byAccount: Map<string, { posts: number; engagement: number }>;
  types: Count[];
  languages: Count[];
  countries: Count[];
  topics: Count[];
  hashtags: Count[];
}

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/** بداية الدلو بالتوقيت العالمي — والمفتاح ISO كامل لا يحتاج قارئه أن يعرف الحجم */
export function bucketStart(date: Date, bucket: OpsBucket): string {
  const ms = bucket === 'hour' ? HOUR_MS : DAY_MS;
  return new Date(Math.floor(date.getTime() / ms) * ms).toISOString();
}

/**
 * دلاء النافذة كلّها، الفارغة معها.
 *
 * ★ اليوم بلا منشورات صفرٌ يُرسم لا فجوةٌ تُطوى.
 *
 *   سلسلةٌ تتخطّى الأيام الفارغة تصل الخميس بالأحد بخطٍّ مستقيم، فيُقرأ
 *   الصمتُ نشاطاً متّصلاً — وهو بالضبط ما تُفتح غرفة العمليات لتراه.
 */
export function windowBuckets(from: Date, to: Date, bucket: OpsBucket): string[] {
  const ms = bucket === 'hour' ? HOUR_MS : DAY_MS;
  const start = Math.floor(from.getTime() / ms) * ms;
  const end = Math.floor(to.getTime() / ms) * ms;
  const keys: string[] = [];
  // سقفٌ دفاعي: نافذةٌ معطوبة لا تصنع مليون دلو
  for (let t = start; t <= end && keys.length < 2_000; t += ms) keys.push(new Date(t).toISOString());
  return keys;
}

function emptyPoint(date: string): OpsPoint {
  return {
    date,
    posts: 0,
    likes: 0,
    comments: 0,
    shares: 0,
    views: 0,
    engagement: 0,
    positive: 0,
    neutral: 0,
    negative: 0,
    other: 0,
    highRisk: 0,
  };
}

/** الخطورة التي تُعدّ «عالية» — الدرجتان الأعلى، كما في بطاقة المنشور */
export const HIGH_RISK_FROM = 4;

function ranked(counts: Map<string, number>, limit?: number): Count[] {
  const list = [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  return limit ? list.slice(0, limit) : list;
}

function bump(map: Map<string, number>, key: string, by = 1) {
  map.set(key, (map.get(key) ?? 0) + by);
}

export function aggregateOps(
  rows: OpsPostRow[],
  window: { from: Date; to: Date; bucket: OpsBucket },
): OpsAggregate {
  const points = new Map(windowBuckets(window.from, window.to, window.bucket).map((key) => [key, emptyPoint(key)]));
  const heat = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));

  const totals = { posts: 0, engagement: 0, likes: 0, comments: 0, shares: 0, views: 0, activeAccounts: 0 };
  const sentiment = new Map<string, number>();
  const stance = new Map<string, number>();
  const labels = new Map<string, number>();
  const rumor = new Map<string, number>();
  const severity = [0, 0, 0, 0, 0, 0];
  const coverage = { analyzed: 0, pending: 0, review: 0 };
  const byPlatform = new Map<string, { posts: number; engagement: number }>();
  const byAccount = new Map<string, { posts: number; engagement: number }>();
  const types = new Map<string, number>();
  const languages = new Map<string, number>();
  const countries = new Map<string, number>();
  const topics = new Map<string, number>();
  const hashtags = new Map<string, number>();

  for (const row of rows) {
    totals.posts += 1;
    totals.engagement += row.engagementTotal;
    totals.likes += row.likes;
    totals.comments += row.comments;
    totals.shares += row.shares;
    totals.views += row.views;

    bump(sentiment, row.sentiment);
    bump(types, row.postType);
    bump(languages, row.language || 'und');
    if (row.country) bump(countries, row.country);
    bump(topics, row.topicId ?? '');
    // الوسم بلا علامته وبحروفٍ صغيرة: «#الكهرباء» و«الكهرباء» وسمٌ واحد
    for (const tag of new Set(row.hashtags.map((t) => t.replace(/^#/, '').trim().toLowerCase()).filter(Boolean))) {
      bump(hashtags, tag);
    }

    const platform = byPlatform.get(row.platformId) ?? { posts: 0, engagement: 0 };
    platform.posts += 1;
    platform.engagement += row.engagementTotal;
    byPlatform.set(row.platformId, platform);

    const account = byAccount.get(row.accountId) ?? { posts: 0, engagement: 0 };
    account.posts += 1;
    account.engagement += row.engagementTotal;
    byAccount.set(row.accountId, account);

    const analysis = row.analysis;
    if (analysis) {
      coverage.analyzed += 1;
      if (analysis.needsReview) coverage.review += 1;
      const level = Math.min(5, Math.max(0, Math.round(analysis.severityLevel)));
      severity[level] = (severity[level] ?? 0) + 1;
      bump(rumor, analysis.rumorStatus);
      bump(stance, analysis.authorStance);
      for (const label of new Set(analysis.labels)) bump(labels, label);
    } else {
      coverage.pending += 1;
    }

    if (!row.publishedAt) continue;

    const day = row.publishedAt.getUTCDay();
    const hour = row.publishedAt.getUTCHours();
    const heatRow = heat[day];
    if (heatRow) heatRow[hour] = (heatRow[hour] ?? 0) + 1;

    const point = points.get(bucketStart(row.publishedAt, window.bucket));
    // ما يقع خارج النافذة (ساعةٌ على حدّها) لا يصنع دلواً جديداً
    if (!point) continue;
    point.posts += 1;
    point.likes += row.likes;
    point.comments += row.comments;
    point.shares += row.shares;
    point.views += row.views;
    point.engagement += row.engagementTotal;
    if (row.sentiment === 'POSITIVE') point.positive += 1;
    else if (row.sentiment === 'NEUTRAL') point.neutral += 1;
    else if (row.sentiment === 'NEGATIVE') point.negative += 1;
    else point.other += 1;
    if (analysis && analysis.severityLevel >= HIGH_RISK_FROM) point.highRisk += 1;
  }

  totals.activeAccounts = byAccount.size;

  return {
    series: [...points.values()],
    heat,
    totals,
    sentiment: ranked(sentiment),
    stance: ranked(stance),
    labels: ranked(labels, 10),
    severity,
    rumor: ranked(rumor),
    coverage,
    byPlatform,
    byAccount,
    types: ranked(types),
    languages: ranked(languages),
    countries: ranked(countries, 10),
    topics: ranked(topics, 10),
    hashtags: ranked(hashtags, 10),
  };
}

/**
 * أعلى الحسابات بمقياس.
 *
 * ومتوسّط التفاعل لا يُحسب لحسابٍ نشر منشوراً أو اثنين: منشورٌ واحد انتشر
 * يضعه فوق حسابٍ ينشر يومياً بتفاعلٍ ثابت — رقمٌ صحيح يُقرأ خطأً.
 */
export const MIN_POSTS_FOR_AVERAGE = 3;

export function topAccounts(
  byAccount: Map<string, { posts: number; engagement: number }>,
  metric: 'posts' | 'engagement' | 'average',
  limit = 8,
): { id: string; value: number }[] {
  const rows = [...byAccount.entries()]
    .filter(([, v]) => metric !== 'average' || v.posts >= MIN_POSTS_FOR_AVERAGE)
    .map(([id, v]) => ({
      id,
      value: metric === 'posts' ? v.posts : metric === 'engagement' ? v.engagement : Math.round(v.engagement / v.posts),
    }));
  return rows.sort((a, b) => b.value - a.value || a.id.localeCompare(b.id)).slice(0, limit);
}

/** دلاء حالات الاستخراج يوماً بيوم — النجاح والفشل وما بلا نتائج */
export function aggregateRuns(
  runs: { createdAt: Date; status: string; itemsSaved: number }[],
  window: { from: Date; to: Date; bucket: OpsBucket },
): { date: string; succeeded: number; failed: number; empty: number; cancelled: number; saved: number }[] {
  const points = new Map(
    windowBuckets(window.from, window.to, window.bucket).map((date) => [
      date,
      { date, succeeded: 0, failed: 0, empty: 0, cancelled: 0, saved: 0 },
    ]),
  );
  for (const run of runs) {
    const point = points.get(bucketStart(run.createdAt, window.bucket));
    if (!point) continue;
    if (run.status === 'SUCCEEDED') point.succeeded += 1;
    else if (run.status === 'FAILED') point.failed += 1;
    else if (run.status === 'NO_RESULTS') point.empty += 1;
    else if (run.status === 'CANCELLED') point.cancelled += 1;
    point.saved += run.itemsSaved;
  }
  return [...points.values()];
}

/** عدد ما صُنّف في كلّ دلو — إنتاجية التحليل لا حجم النشر */
export function aggregateCounts(
  dates: Date[],
  window: { from: Date; to: Date; bucket: OpsBucket },
): { date: string; count: number }[] {
  const points = new Map(windowBuckets(window.from, window.to, window.bucket).map((date) => [date, { date, count: 0 }]));
  for (const date of dates) {
    const point = points.get(bucketStart(date, window.bucket));
    if (point) point.count += 1;
  }
  return [...points.values()];
}

/**
 * تحويل خريطة التوقيت العالمي إلى توقيت القارئ.
 *
 * يُبنى لكلّ خانةٍ عالمية تاريخٌ حقيقي (أحدٌ معروف + اليوم + الساعة)
 * ويُسأل المتصفّح عن يومه وساعته المحلّيين — فيتولّى هو فرق المنطقة
 * وأيام الأسبوع التي تنقلب عند منتصف الليل.
 */
export function localizeHeat(utc: number[][]): number[][] {
  const local = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  const sunday = Date.UTC(2024, 0, 7); // الأحد ٧ يناير ٢٠٢٤
  utc.forEach((hours, day) => {
    hours.forEach((count, hour) => {
      if (!count) return;
      const date = new Date(sunday + day * 86_400_000 + hour * 3_600_000);
      const row = local[date.getDay()];
      if (row) row[date.getHours()] = (row[date.getHours()] ?? 0) + count;
    });
  });
  return local;
}
